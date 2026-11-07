import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { useLive } from '../context/LiveData'
import { RiskChart, VitalChart } from '../components/Charts'
import { Notice, PageHeader, RiskBadge } from '../components/ui'
import { fmtTime } from '../lib/format'

export default function Trends() {
  const { patients, settings } = useLive()
  const [id, setId] = useState('')
  const [n, setN] = useState(60)
  useEffect(() => { if (!id && patients.length) setId(patients[0].patient.patient_id) }, [id, patients])
  const hist = usePolling(() => (id ? api.history(id, n) : Promise.resolve([])), 2000, [id, n])
  const sel = patients.find((p) => p.patient.patient_id === id)
  const data = hist.data ?? []

  return (
    <>
      <PageHeader title="Vital sign trends" subtitle="Compare each vital sign with its reference range over time. Dashed lines mark the reference range."
        actions={<>
          <select className="input w-auto" aria-label="Patient" value={id} onChange={(e) => setId(e.target.value)}>
            {patients.map((p) => <option key={p.patient.patient_id} value={p.patient.patient_id}>{p.patient.patient_id} (age {p.patient.age})</option>)}
          </select>
          <select className="input w-auto" aria-label="Window" value={n} onChange={(e) => setN(Number(e.target.value))}>
            {[30, 60, 120, 300].map((v) => <option key={v} value={v}>Last {v}</option>)}
          </select>
        </>} />
      {sel && <p className="mb-4 flex items-center gap-2 text-sm text-muted"><RiskBadge category={sel.risk?.risk_category} score={sel.risk?.risk_score} />Latest measurement {fmtTime(sel.last_update)}</p>}
      {hist.error && <div className="mb-3"><Notice tone="error">{hist.error}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <VitalChart title="Heart rate" series={[{ key: 'heart_rate' }]} data={data} height={230} />
        <VitalChart title="Blood pressure" series={[{ key: 'systolic_bp' }, { key: 'diastolic_bp' }]} data={data} height={230} />
        <VitalChart title={'Oxygen saturation (SpO\u2082)'} series={[{ key: 'spo2' }]} data={data} height={230} />
        <VitalChart title="Temperature" series={[{ key: 'temperature' }]} data={data} height={230} />
        <VitalChart title="Respiratory rate" series={[{ key: 'respiratory_rate' }]} data={data} height={230} />
        <RiskChart data={data} medium={settings?.medium_threshold} high={settings?.high_threshold} height={230} />
      </div>
    </>
  )
}
