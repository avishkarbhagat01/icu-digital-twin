import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import type { Alert } from '../api/types'
import { fmtDateTime } from '../lib/format'
import { Empty, RiskBadge } from './ui'

interface Props { alerts: Alert[]; onChange: () => void; hidePatient?: boolean; compact?: boolean }

export function AlertsTable({ alerts, onChange, hidePatient = false, compact = false }: Props) {
  const [busy, setBusy] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!alerts.length) return <Empty title="No alerts here">Alerts appear when a patient's risk estimate rises into the Medium or High range.</Empty>

  const ack = async (id: number) => {
    setBusy(id)
    try { await api.acknowledge(id); setErr(null); onChange() } catch (e) { setErr(errorMessage(e)) } finally { setBusy(null) }
  }
  const button = (a: Alert) => !a.acknowledged && (
    <button className="btn" disabled={busy === a.alert_id} onClick={() => ack(a.alert_id)}><Check className="h-4 w-4" />Acknowledge</button>
  )
  const error = err && <p className="px-3 py-2 text-sm text-high" role="alert">{err}</p>

  if (compact) {
    return (
      <>
        {error}
        <ul className="divide-y divide-line">
          {alerts.map((a) => (
            <li key={a.alert_id} className="space-y-1.5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Link className="font-medium text-accent-dark hover:underline" to={`/patients/${a.patient_id}`}>{a.patient_id}</Link>
                <RiskBadge category={a.risk_category} score={a.risk_score} />
              </div>
              <p className="text-ink-800">{a.reason}</p>
              <div className="flex items-center justify-between"><span className="text-xs text-muted">{fmtDateTime(a.timestamp)}</span>{button(a)}</div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <div className="overflow-x-auto">
      {error}
      <table className="w-full">
        <thead><tr>
          <th className="th">Time</th>{!hidePatient && <th className="th">Patient</th>}<th className="th">Risk level</th>
          <th className="th">Reason for review</th><th className="th">Status</th><th className="th" />
        </tr></thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.alert_id} className={a.acknowledged ? 'opacity-70' : ''}>
              <td className="td text-muted">{fmtDateTime(a.timestamp)}</td>
              {!hidePatient && <td className="td"><Link className="font-medium text-accent-dark hover:underline" to={`/patients/${a.patient_id}`}>{a.patient_id}</Link></td>}
              <td className="td"><RiskBadge category={a.risk_category} score={a.risk_score} /></td>
              <td className="td max-w-[34rem] whitespace-normal text-ink-800">{a.reason}</td>
              <td className="td text-muted">{a.acknowledged ? `Acknowledged ${fmtDateTime(a.acknowledged_at)}` : 'Needs review'}</td>
              <td className="td text-right">{button(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
