import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ModelInfo } from '../api/types'
import { useLive } from '../context/LiveData'
import { SimControls } from '../components/Layout'
import { Notice, PageHeader } from '../components/ui'
import { fmtDateTime } from '../lib/format'

export default function SettingsPage() {
  const { settings, sim, refresh } = useLive()
  const [interval, setIntervalSec] = useState('3')
  const [medium, setMedium] = useState('25')
  const [high, setHigh] = useState('50')
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [model, setModel] = useState<ModelInfo | null>(null)

  useEffect(() => { api.model().then(setModel).catch(() => setModel(null)) }, [])
  useEffect(() => {
    if (settings) { setIntervalSec(String(settings.interval_seconds)); setMedium(String(Math.round(settings.medium_threshold * 100))); setHigh(String(Math.round(settings.high_threshold * 100))) }
    // load once when settings first arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings === null])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const i = Number(interval), m = Number(medium) / 100, h = Number(high) / 100
    if (!(i >= 0.5 && i <= 60)) return setMsg({ tone: 'error', text: 'Update interval must be between 0.5 and 60 seconds.' })
    if (!(m > 0 && m < h && h < 1)) return setMsg({ tone: 'error', text: 'Thresholds must satisfy 0 < Medium < High < 100.' })
    try { await api.saveSettings({ interval_seconds: i, medium_threshold: m, high_threshold: h }); await refresh(); setMsg({ tone: 'info', text: 'Settings saved. New thresholds apply to all displayed risk levels immediately; alerts already raised are not changed.' }) }
    catch (err) { setMsg({ tone: 'error', text: errorMessage(err) }) }
  }

  return (
    <>
      <PageHeader title="Settings and simulation" subtitle="Control the synthetic data stream and the risk thresholds." />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="panel-title">Simulation controls</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Each update adds one new synthetic measurement for every patient. Reset clears all measurements, predictions and alerts and restarts the same synthetic cohort.</p>
          <SimControls />
          {sim && <p className="mt-3 text-sm text-muted">{sim.patient_count} patients, {sim.tick_count} updates since the last reset.</p>}
        </section>

        <section className="panel p-5">
          <h2 className="panel-title">Update interval and risk thresholds</h2>
          <form onSubmit={save} className="mt-3 space-y-3" noValidate>
            <label className="block text-sm">Seconds between updates<input className="input mt-1 max-w-[10rem]" value={interval} onChange={(e) => setIntervalSec(e.target.value)} inputMode="decimal" /></label>
            <div className="flex gap-4">
              <label className="block text-sm">Medium risk from (%)<input className="input mt-1" value={medium} onChange={(e) => setMedium(e.target.value)} inputMode="numeric" /></label>
              <label className="block text-sm">High risk from (%)<input className="input mt-1" value={high} onChange={(e) => setHigh(e.target.value)} inputMode="numeric" /></label>
            </div>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
            <button className="btn btn-primary">Save settings</button>
          </form>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h2 className="panel-title">Risk model</h2>
          {!model ? <p className="mt-2 text-sm text-muted">Model information is unavailable.</p> : !model.available ? (
            <div className="mt-3"><Notice tone="error" title="Model not loaded">{model.error}</Notice></div>
          ) : (
            <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Version</dt><dd className="font-medium">{model.model_version}</dd></div>
              <div><dt className="text-muted">Type</dt><dd className="font-medium">{model.model_type}</dd></div>
              <div><dt className="text-muted">Training data</dt><dd className="font-medium">{model.data_source}</dd></div>
              <div><dt className="text-muted">Trained</dt><dd className="font-medium">{fmtDateTime(model.trained_at)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Prediction target</dt><dd className="font-medium">{model.target}</dd></div>
            </dl>
          )}
          <div className="mt-4"><Notice tone="warn" title="Limitations">{model?.disclaimer ?? 'Prototype for academic research and demonstration only.'} Missing or delayed measurements can affect predictions, and the system does not replace professional clinical assessment.</Notice></div>
        </section>
      </div>
    </>
  )
}
