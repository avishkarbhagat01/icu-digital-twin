import { useState } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { TwinState, VitalKey } from '../api/types'
import { VITALS } from '../lib/format'
import { Notice } from './ui'

const LIMITS: Record<VitalKey, [number, number]> = {
  heart_rate: [20, 250], systolic_bp: [40, 260], diastolic_bp: [20, 160], spo2: [50, 100], temperature: [30, 43], respiratory_rate: [4, 60],
}

export function MeasurementForm({
  patientId,
  onDone,
  requireAll = false,
  initialValues,
  submitLabel = 'Add measurement',
  successText,
}: {
  patientId: string
  onDone: (s: TwinState) => void
  requireAll?: boolean
  initialValues?: Partial<TwinState['current']>
  submitLabel?: string
  successText?: string
}) {
  const [vals, setVals] = useState<Partial<Record<VitalKey, string>>>(() => {
    const initial: Partial<Record<VitalKey, string>> = {}
    for (const v of VITALS) {
      const value = initialValues?.[v.key]
      if (value !== null && value !== undefined) initial[v.key] = String(value)
    }
    return initial
  })
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<VitalKey, string>>>({})
  const [msg, setMsg] = useState<{ tone: 'info' | 'error' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Partial<Record<VitalKey, string>> = {}
    const body: Partial<Record<VitalKey, number>> = {}
    for (const v of VITALS) {
      const raw = vals[v.key]?.trim()
      if (!raw) {
        if (requireAll) errs[v.key] = 'Required for the first measurement.'
        continue
      }
      const n = Number(raw)
      const [lo, hi] = LIMITS[v.key]
      if (!Number.isFinite(n) || n < lo || n > hi) errs[v.key] = `Enter ${lo}\u2013${hi}`
      else body[v.key] = n
    }
    setFieldErrors(errs)
    if (Object.keys(errs).length) { setMsg({ tone: 'error', text: 'Fix the highlighted values and try again.' }); return }
    if (!Object.keys(body).length) { setMsg({ tone: 'error', text: 'Enter at least one vital sign.' }); return }
    setBusy(true)
    try {
      const s = await api.addMeasurement(patientId, body)
      setVals({})
      setMsg(s.current?.quality === 'imputed'
        ? { tone: 'warn', text: s.current.quality_notes ?? 'Some values were carried forward.' }
        : { tone: 'info', text: successText ?? 'Measurement recorded and the digital twin updated.' })
      onDone(s)
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const fe: Partial<Record<VitalKey, string>> = {}
        err.details.forEach((d) => { if (d.field && d.field in LIMITS) fe[d.field as VitalKey] = d.message })
        setFieldErrors(fe)
      }
      setMsg({ tone: 'error', text: errorMessage(err) })
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {VITALS.map((v) => (
          <label key={v.key} className="block text-xs text-muted">
            {v.label} ({v.unit})
            <input className={`input mt-1 ${fieldErrors[v.key] ? 'border-high' : ''}`} inputMode="decimal" value={vals[v.key] ?? ''} aria-invalid={!!fieldErrors[v.key]} required={requireAll}
              onChange={(e) => setVals({ ...vals, [v.key]: e.target.value })} placeholder={`${LIMITS[v.key][0]}\u2013${LIMITS[v.key][1]}`} />
            {fieldErrors[v.key] && <span className="text-high">{fieldErrors[v.key]}</span>}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{requireAll ? 'Enter all six vital signs for the first measurement.' : 'Leave a value empty to carry it forward from the previous measurement; it will be flagged as incomplete.'}</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  )
}
