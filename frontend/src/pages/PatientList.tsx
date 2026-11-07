import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLive } from '../context/LiveData'
import { Empty, PageHeader, RiskBadge } from '../components/ui'
import { fmtNum, fmtTime } from '../lib/format'
import type { RiskCategory } from '../api/types'

type Sort = 'risk' | 'id'

export default function PatientList() {
  const { patients } = useLive()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'All' | RiskCategory>('All')
  const [sort, setSort] = useState<Sort>('risk')

  const rows = useMemo(() => patients
    .filter((p) => (cat === 'All' || p.risk?.risk_category === cat) && p.patient.patient_id.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sort === 'id' ? a.patient.patient_id.localeCompare(b.patient.patient_id) : (b.risk?.risk_score ?? -1) - (a.risk?.risk_score ?? -1)),
  [patients, q, cat, sort])

  return (
    <>
      <PageHeader title="Patients" subtitle="Select a patient to open the digital twin."
        actions={<Link className="btn btn-primary" to="/admin">Manage patients</Link>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-[14rem]" placeholder="Search by patient ID" aria-label="Search by patient ID" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Filter by risk level" value={cat} onChange={(e) => setCat(e.target.value as 'All' | RiskCategory)}>
          {['All', 'High', 'Medium', 'Low'].map((c) => <option key={c} value={c}>{c === 'All' ? 'All risk levels' : `${c} risk`}</option>)}
        </select>
        <select className="input w-auto" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="risk">Sort by risk</option><option value="id">Sort by patient ID</option>
        </select>
      </div>
      <div className="panel overflow-x-auto">
        {!rows.length ? <Empty title="No matching patients">Change the search or the risk filter.</Empty> : (
          <table className="w-full">
            <thead><tr>
              {['Patient', 'Age', 'HR', 'BP', 'SpO\u2082', 'Temp', 'RR', 'Risk', 'Alerts', 'Last update'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const c = p.current, f = new Set(p.flags.map((x) => x.vital))
                const bad = (k: Parameters<typeof f.has>[0]) => (f.has(k) ? 'font-semibold text-high' : '')
                return (
                  <tr key={p.patient.patient_id} className="cursor-pointer hover:bg-accent-soft/40"
                    onClick={() => nav(`/patients/${p.patient.patient_id}`)}>
                    <td className="td font-medium"><Link to={`/patients/${p.patient.patient_id}`} onClick={(e) => e.stopPropagation()}>{p.patient.patient_id}</Link></td>
                    <td className="td">{p.patient.age}</td>
                    <td className={`td ${bad('heart_rate')}`}>{fmtNum(c?.heart_rate)}</td>
                    <td className={`td ${bad('systolic_bp')}`}>{fmtNum(c?.systolic_bp)}/{fmtNum(c?.diastolic_bp)}</td>
                    <td className={`td ${bad('spo2')}`}>{fmtNum(c?.spo2)}</td>
                    <td className={`td ${bad('temperature')}`}>{fmtNum(c?.temperature, 1)}</td>
                    <td className={`td ${bad('respiratory_rate')}`}>{fmtNum(c?.respiratory_rate)}</td>
                    <td className="td"><RiskBadge category={p.risk?.risk_category} score={p.risk?.risk_score} /></td>
                    <td className="td">{p.active_alerts > 0 ? <span className="font-medium text-high">{p.active_alerts} to review</span> : <span className="text-muted">None</span>}</td>
                    <td className="td text-muted">{fmtTime(p.last_update)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Values outside the reference range are shown in red.</p>
    </>
  )
}
