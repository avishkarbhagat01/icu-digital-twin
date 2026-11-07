import type { ReactNode } from 'react'
import { AlertTriangle, Info, Inbox } from 'lucide-react'
import type { RiskCategory } from '../api/types'
import { RISK_STYLE, fmtPct } from '../lib/format'

export function RiskBadge({ category, score }: { category: RiskCategory | null | undefined; score?: number | null }) {
  if (!category) return <span className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">No estimate</span>
  const s = RISK_STYLE[category]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.soft} ${s.text}`} data-testid="risk-badge">
      <span className={`h-1.5 w-1.5 rounded-full ${s.solid}`} />
      {category}
      {score !== undefined && score !== null && <span className="font-medium opacity-80">{fmtPct(score)}</span>}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error'; title?: string; children: ReactNode }) {
  const styles = { info: 'bg-accent-soft text-accent-dark border-accent/20', warn: 'bg-med-soft text-med border-med/25', error: 'bg-high-soft text-high border-high/25' }[tone]
  const Icon = tone === 'info' ? Info : AlertTriangle
  return (
    <div role={tone === 'error' ? 'alert' : 'note'} className={`flex gap-2.5 rounded-md border px-3.5 py-2.5 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{title && <p className="font-semibold">{title}</p>}<div className={title ? 'mt-0.5' : ''}>{children}</div></div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <Inbox className="h-6 w-6 text-muted/60" aria-hidden />
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
    </div>
  )
}

export function Sparkline({ values, hex, high, medium }: { values: number[]; hex: string; high?: number; medium?: number }) {
  const w = 120, h = 34
  if (values.length < 2) return <svg width={w} height={h} aria-hidden />
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - Math.min(1, Math.max(0, v)) * (h - 6)] as const)
  const y = (t?: number) => (t === undefined ? null : h - 3 - t * (h - 6))
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Recent risk trend">
      {[y(medium), y(high)].map((yy, i) => yy !== null && <line key={i} x1="0" x2={w} y1={yy} y2={yy} stroke="#9FB1C5" strokeWidth="0.8" strokeDasharray="2 3" />)}
      <polyline fill="none" stroke={hex} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => p.join(',')).join(' ')} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={hex} />
    </svg>
  )
}
