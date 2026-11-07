import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HistoryPoint } from '../api/types'
import { VITAL_BY_KEY, fmtPct, fmtTime } from '../lib/format'
import type { VitalKey } from '../api/types'

interface Series { key: VitalKey; color?: string }

export function VitalChart({ title, series, data, height = 190 }: { title: string; series: Series[]; data: HistoryPoint[]; height?: number }) {
  const first = VITAL_BY_KEY[series[0].key]
  const rows = data.map((d) => ({ ...d, t: fmtTime(d.timestamp) }))
  const [lo, hi] = first.ref
  return (
    <figure className="panel p-4" aria-label={`${title} trend`}>
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink-900">{title}</span>
        <span className="text-xs text-muted">{first.unit}, reference {lo}–{hi}</span>
      </figcaption>
      {rows.length < 2 ? (
        <p className="grid place-items-center text-sm text-muted" style={{ height }}>Waiting for more measurements.</p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#E6EBF0" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#5B6B7C' }} minTickGap={36} tickLine={false} axisLine={{ stroke: '#DAE1E8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#5B6B7C' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #DAE1E8' }} />
            {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />}
            {series.length === 1 && [lo, hi].map((y) => <ReferenceLine key={y} y={y} stroke="#9FB1C5" strokeDasharray="4 4" ifOverflow="hidden" />)}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={VITAL_BY_KEY[s.key].label} stroke={s.color ?? VITAL_BY_KEY[s.key].color}
                strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </figure>
  )
}

export function RiskChart({ data, medium, high, height = 190 }: { data: HistoryPoint[]; medium?: number; high?: number; height?: number }) {
  const rows = data.filter((d) => d.risk_score !== null).map((d) => ({ t: fmtTime(d.timestamp), risk: d.risk_score as number }))
  return (
    <figure className="panel p-4" aria-label="Risk estimate trend">
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink-900">Risk estimate</span>
        <span className="text-xs text-muted">probability, prototype model</span>
      </figcaption>
      {rows.length < 2 ? (
        <p className="grid place-items-center text-sm text-muted" style={{ height }}>No risk estimates yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#E6EBF0" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#5B6B7C' }} minTickGap={36} tickLine={false} axisLine={{ stroke: '#DAE1E8' }} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => fmtPct(v)} tick={{ fontSize: 11, fill: '#5B6B7C' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: number) => fmtPct(v)} contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #DAE1E8' }} />
            {medium !== undefined && <ReferenceLine y={medium} stroke="#A66A0C" strokeDasharray="4 4" label={{ value: 'Medium', fontSize: 10, fill: '#A66A0C', position: 'insideTopRight' }} />}
            {high !== undefined && <ReferenceLine y={high} stroke="#BF352B" strokeDasharray="4 4" label={{ value: 'High', fontSize: 10, fill: '#BF352B', position: 'insideTopRight' }} />}
            <Line type="monotone" dataKey="risk" name="Risk" stroke="#0F1D31" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </figure>
  )
}
