import type { RiskCategory, VitalKey } from '../api/types'

export interface VitalMeta { key: VitalKey; label: string; short: string; unit: string; decimals: number; ref: [number, number]; color: string }

export const VITALS: VitalMeta[] = [
  { key: 'heart_rate', label: 'Heart rate', short: 'HR', unit: 'bpm', decimals: 0, ref: [50, 110], color: '#C2410C' },
  { key: 'systolic_bp', label: 'Systolic BP', short: 'SBP', unit: 'mmHg', decimals: 0, ref: [90, 180], color: '#1D4ED8' },
  { key: 'diastolic_bp', label: 'Diastolic BP', short: 'DBP', unit: 'mmHg', decimals: 0, ref: [50, 110], color: '#6D8FD6' },
  { key: 'spo2', label: 'SpO\u2082', short: 'SpO\u2082', unit: '%', decimals: 0, ref: [92, 100], color: '#0B7A85' },
  { key: 'temperature', label: 'Temperature', short: 'Temp', unit: '\u00B0C', decimals: 1, ref: [36, 38], color: '#B45309' },
  { key: 'respiratory_rate', label: 'Respiratory rate', short: 'RR', unit: '/min', decimals: 0, ref: [10, 24], color: '#6D28D9' },
]
export const VITAL_BY_KEY = Object.fromEntries(VITALS.map((v) => [v.key, v])) as Record<VitalKey, VitalMeta>

export const RISK_STYLE: Record<RiskCategory, { text: string; soft: string; solid: string; edge: string; hex: string }> = {
  Low: { text: 'text-low', soft: 'bg-low-soft', solid: 'bg-low', edge: 'border-l-low', hex: '#1D8758' },
  Medium: { text: 'text-med', soft: 'bg-med-soft', solid: 'bg-med', edge: 'border-l-med', hex: '#A66A0C' },
  High: { text: 'text-high', soft: 'bg-high-soft', solid: 'bg-high', edge: 'border-l-high', hex: '#BF352B' },
}
export const RISK_RANK: Record<RiskCategory, number> = { Low: 0, Medium: 1, High: 2 }

export const fmtNum = (v: number | null | undefined, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '\u2013' : v.toFixed(d))
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '\u2013' : `${Math.round(v * 100)}%`)
export const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour12: false }) : '\u2013')
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString([], { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '\u2013'
export const fmtDelta = (d: number | undefined, decimals: number) =>
  d === undefined || d === 0 ? '0' : `${d > 0 ? '+' : '\u2212'}${Math.abs(d).toFixed(decimals)}`
