import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Minus } from 'lucide-react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { useLive } from '../context/LiveData'
import { AlertsTable } from '../components/AlertsTable'
import { RiskChart, VitalChart } from '../components/Charts'
import { MeasurementForm } from '../components/MeasurementForm'
import { Notice, PageHeader, RiskBadge } from '../components/ui'
import { RISK_STYLE, VITALS, fmtDateTime, fmtDelta, fmtNum, fmtPct } from '../lib/format'

export default function PatientDetail() {
  const { id = '' } = useParams()
  const { settings } = useLive()
  const [windowSize, setWindowSize] = useState(60)
  const twin = usePolling(() => api.patient(id), 2000, [id])
  const hist = usePolling(() => api.history(id, windowSize), 2000, [id, windowSize])
  const alerts = usePolling(() => api.alerts('all', id, 20), 2000, [id])
  const refreshAll = async () => { await Promise.all([twin.refresh(), hist.refresh(), alerts.refresh()]) }
  const afterMeasurement = async () => {
    await refreshAll()
    requestAnimationFrame(() => document.getElementById('vital-sign-trends')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  if (twin.error && !twin.data) {
    return (<><Link to="/patients" className="btn mb-4"><ArrowLeft className="h-4 w-4" />Back to patients</Link><Notice tone="error" title="Patient unavailable">{twin.error}</Notice></>)
  }
  const s = twin.data
  if (!s) return <p className="text-sm text-muted">Loading patient…</p>
  const { patient, current, risk } = s
  const flagged = new Map(s.flags.map((f) => [f.vital, f]))
  const history = hist.data ?? []

  return (
    <>
      <Link to="/patients" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink-900"><ArrowLeft className="h-4 w-4" />Patients</Link>
      <PageHeader
        title={`${patient.display_name} (${patient.patient_id})`}
        subtitle={`Age ${patient.age}. Admitted ${fmtDateTime(patient.admission_time)}. ${s.measurement_count} measurements. Synthetic record.`}
        actions={<RiskBadge category={risk?.risk_category} score={risk?.risk_score} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-5" aria-label="Digital twin state">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="panel-title">Digital twin state</h2>
            <span className="text-xs text-muted">Latest {fmtDateTime(s.last_update)}</span>
          </div>
          {current?.quality === 'imputed' && <div className="mb-3"><Notice tone="warn" title="Incomplete measurement">{current.quality_notes}</Notice></div>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {VITALS.map((v) => {
              const val = current?.[v.key] ?? null, prev = s.previous?.[v.key] ?? null, d = s.deltas[v.key]
              const f = flagged.get(v.key)
              const Arrow = !d ? Minus : d > 0 ? ArrowUp : ArrowDown
              return (
                <div key={v.key} className={`rounded-md border p-3 ${f ? 'border-high/40 bg-high-soft/50' : 'border-line'}`}>
                  <p className="text-xs text-muted">{v.label}</p>
                  <p className={`mt-1 text-2xl font-semibold ${f ? 'text-high' : 'text-ink-900'}`}>{fmtNum(val, v.decimals)}<span className="ml-1 text-xs font-normal text-muted">{v.unit}</span></p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted" title={`Previous ${fmtNum(prev, v.decimals)}`}>
                    <Arrow className="h-3 w-3" aria-hidden />{fmtDelta(d, v.decimals)} since previous
                  </p>
                  {f && <p className="mt-1 text-xs font-medium text-high">{f.status === 'low' ? 'Below' : 'Above'} reference {v.ref[0]}–{v.ref[1]}</p>}
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel p-5" aria-label="Risk estimate">
          <h2 className="panel-title">Risk estimate</h2>
          {risk ? (
            <>
              <p className={`mt-3 text-5xl font-semibold ${RISK_STYLE[risk.risk_category].text}`} data-testid="risk-score">{fmtPct(risk.risk_score)}</p>
              <div className="mt-2 flex items-center gap-2"><RiskBadge category={risk.risk_category} /><span className="text-xs text-muted">Prototype estimate</span></div>
              <div className="relative mt-4 h-2 rounded-full bg-canvas" aria-hidden>
                {settings && <>
                  <span className="absolute inset-y-0 bg-med-soft" style={{ left: `${settings.medium_threshold * 100}%`, width: `${(settings.high_threshold - settings.medium_threshold) * 100}%` }} />
                  <span className="absolute inset-y-0 right-0 bg-high-soft" style={{ left: `${settings.high_threshold * 100}%` }} />
                </>}
                <span className={`absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded ${RISK_STYLE[risk.risk_category].solid}`} style={{ left: `calc(${risk.risk_score * 100}% - 3px)` }} />
              </div>
              <h3 className="mt-5 text-sm font-semibold">Reason for review</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-800">{risk.reason}</p>
              <p className="mt-4 text-xs text-muted">Model {risk.model_version}. Trained on synthetic data; not clinically validated.</p>
            </>
          ) : (
            <div className="mt-3"><Notice tone="error" title="No risk estimate">{s.risk_error ?? 'The model did not return a result for the latest measurement.'}</Notice></div>
          )}
        </section>
      </div>

      <div id="vital-sign-trends" className="mb-3 mt-8 flex items-center justify-between scroll-mt-6">
        <h2 className="panel-title">Vital sign trends</h2>
        <select className="input w-auto" aria-label="History length" value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value))}>
          {[30, 60, 120, 300].map((n) => <option key={n} value={n}>Last {n} measurements</option>)}
        </select>
      </div>
      {hist.error && <div className="mb-3"><Notice tone="error">{hist.error}</Notice></div>}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <RiskChart data={history} medium={settings?.medium_threshold} high={settings?.high_threshold} />
        <VitalChart title="Heart rate" series={[{ key: 'heart_rate' }]} data={history} />
        <VitalChart title="Blood pressure" series={[{ key: 'systolic_bp' }, { key: 'diastolic_bp' }]} data={history} />
        <VitalChart title={'Oxygen saturation (SpO\u2082)'} series={[{ key: 'spo2' }]} data={history} />
        <VitalChart title="Temperature" series={[{ key: 'temperature' }]} data={history} />
        <VitalChart title="Respiratory rate" series={[{ key: 'respiratory_rate' }]} data={history} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section>
          <h2 className="panel-title mb-3">Alerts for this patient</h2>
          <div className="panel"><AlertsTable alerts={alerts.data?.items ?? []} hidePatient onChange={refreshAll} /></div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="panel-title">Add vital signs</h2>
            <Link to="/admin" className="text-xs text-accent-dark hover:underline">Admin sign in</Link>
          </div>
          <div className="panel p-4"><MeasurementForm patientId={id} onDone={afterMeasurement} requireAll={s.measurement_count === 0} /></div>
        </section>
      </div>
    </>
  )
}
