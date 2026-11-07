import { Link } from 'react-router-dom'
import { useLive } from '../context/LiveData'
import { PatientCard } from '../components/PatientCard'
import { AlertsTable } from '../components/AlertsTable'
import { Empty, PageHeader, RiskBadge } from '../components/ui'
import { RISK_RANK, RISK_STYLE, fmtTime } from '../lib/format'
import type { RiskCategory } from '../api/types'

export default function Dashboard() {
  const { patients, alerts, settings, loading, refresh } = useLive()
  const sorted = [...patients].sort((a, b) =>
    RISK_RANK[b.risk?.risk_category ?? 'Low'] - RISK_RANK[a.risk?.risk_category ?? 'Low'] || (b.risk?.risk_score ?? 0) - (a.risk?.risk_score ?? 0))
  const counts: Record<RiskCategory, number> = { Low: 0, Medium: 0, High: 0 }
  patients.forEach((p) => { if (p.risk) counts[p.risk.risk_category]++ })
  const total = Math.max(1, counts.Low + counts.Medium + counts.High)
  const latest = patients.map((p) => p.last_update).filter(Boolean).sort().pop()
  const unack = (alerts?.items ?? []).filter((a) => !a.acknowledged).slice(0, 5)

  return (
    <>
      <PageHeader title="Ward overview" subtitle={`${patients.length} synthetic patients. Last update ${fmtTime(latest)}.`} />
      <section className="panel mb-6 p-4" aria-label="Risk distribution">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {(['High', 'Medium', 'Low'] as RiskCategory[]).map((c) => (
              <div key={c} className="flex items-center gap-2"><RiskBadge category={c} /><span className="text-xl font-semibold" data-testid={`count-${c}`}>{counts[c]}</span></div>
            ))}
          </div>
          <Link to="/alerts" className="text-sm text-accent-dark hover:underline">
            {alerts?.counts.active ?? 0} {(alerts?.counts.active ?? 0) === 1 ? 'alert needs' : 'alerts need'} review
          </Link>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-canvas" role="img" aria-label="Share of patients by risk level">
          {(['High', 'Medium', 'Low'] as RiskCategory[]).map((c) => <div key={c} className={RISK_STYLE[c].solid} style={{ width: `${(counts[c] / total) * 100}%` }} />)}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section aria-label="Patients by priority">
          <h2 className="panel-title mb-3">Patients, highest risk first</h2>
          {loading && !patients.length ? <p className="text-sm text-muted">Loading patients…</p> : !patients.length ? (
            <div className="panel"><Empty title="No patients to show">Start the backend and press Reset to create the synthetic patients.</Empty></div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {sorted.map((p) => <PatientCard key={p.patient.patient_id} state={p} settings={settings} />)}
            </div>
          )}
        </section>
        <section aria-label="Alerts needing review" className="self-start">
          <h2 className="panel-title mb-3">Needs review</h2>
          <div className="panel"><AlertsTable alerts={unack} onChange={refresh} compact /></div>
          <Link to="/alerts" className="mt-2 inline-block text-sm text-accent-dark hover:underline">See all alerts</Link>
        </section>
      </div>
    </>
  )
}
