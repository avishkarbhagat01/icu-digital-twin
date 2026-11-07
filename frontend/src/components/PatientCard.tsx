import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import type { AppSettings, TwinState } from '../api/types'
import { RISK_STYLE, VITAL_BY_KEY, fmtNum, fmtPct, fmtTime } from '../lib/format'
import { RiskBadge, Sparkline } from './ui'


export function PatientCard({ state, settings }: { state: TwinState; settings: AppSettings | null }) {
  const { patient, current, risk } = state
  const cat = risk?.risk_category
  const flagged = new Set(state.flags.map((f) => f.vital))
  return (
    <Link to={`/patients/${patient.patient_id}`}
      className={`panel block border-l-4 p-4 transition-shadow hover:shadow-md ${cat ? RISK_STYLE[cat].edge : 'border-l-line'}`} aria-label={`Open ${patient.display_name}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-900">{patient.patient_id}</p>
          <p className="text-xs text-muted">Age {patient.age}</p>
        </div>
        <RiskBadge category={cat} />
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className={`text-3xl font-semibold leading-none ${cat ? RISK_STYLE[cat].text : 'text-muted'}`}>{fmtPct(risk?.risk_score)}</p>
          <p className="mt-1 text-xs text-muted">estimated risk</p>
        </div>
        <Sparkline values={state.risk_spark ?? []} hex={cat ? RISK_STYLE[cat].hex : '#9FB1C5'} medium={settings?.medium_threshold} high={settings?.high_threshold} />
      </div>
      {current ? (
        <dl className="mt-3 grid grid-cols-5 gap-1 border-t border-line pt-3 text-center">
          <Cell label="HR" value={fmtNum(current.heart_rate)} bad={flagged.has('heart_rate')} />
          <Cell label="BP" value={`${fmtNum(current.systolic_bp)}/${fmtNum(current.diastolic_bp)}`} bad={flagged.has('systolic_bp') || flagged.has('diastolic_bp')} />
          <Cell label={VITAL_BY_KEY.spo2.short} value={fmtNum(current.spo2)} bad={flagged.has('spo2')} />
          <Cell label="Temp" value={fmtNum(current.temperature, 1)} bad={flagged.has('temperature')} />
          <Cell label="RR" value={fmtNum(current.respiratory_rate)} bad={flagged.has('respiratory_rate')} />
        </dl>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-sm text-muted">No measurements yet.</p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>Updated {fmtTime(state.last_update)}</span>
        {state.active_alerts > 0 && <span className="inline-flex items-center gap-1 font-medium text-high"><Bell className="h-3.5 w-3.5" aria-hidden />{state.active_alerts} to review</span>}
      </div>
      {state.risk_error && <p className="mt-2 text-xs text-high">{state.risk_error}</p>}
    </Link>
  )
}

function Cell({ label, value, bad }: { label: string; value: string; bad: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`text-sm font-semibold ${bad ? 'text-high' : 'text-ink-900'}`}>{value}</dd>
    </div>
  )
}
