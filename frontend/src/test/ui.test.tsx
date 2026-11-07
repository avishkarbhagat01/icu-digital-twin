import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RiskBadge } from '../components/ui'
import { AlertsTable } from '../components/AlertsTable'
import { PatientCard } from '../components/PatientCard'
import ModelEvaluation from '../pages/ModelEvaluation'
import { fmtDelta, fmtPct } from '../lib/format'
import type { TwinState } from '../api/types'

afterEach(() => vi.restoreAllMocks())

const state: TwinState = {
  patient: { patient_id: 'P007', display_name: 'Synthetic Patient 007', age: 71, admission_time: '2026-01-01T00:00:00Z', demo_status: 'synthetic' },
  current: { measurement_id: 1, timestamp: '2026-01-01T10:00:00Z', heart_rate: 128, systolic_bp: 92, diastolic_bp: 58, spo2: 89, temperature: 38.6, respiratory_rate: 27, quality: 'ok', quality_notes: null },
  previous: null, deltas: {}, flags: [{ vital: 'spo2', status: 'low', value: 89, message: 'low' }],
  risk: { risk_score: 0.83, risk_category: 'High', model_version: 'm1', timestamp: '2026-01-01T10:00:00Z', reason: 'r' },
  risk_error: null, measurement_count: 20, last_update: '2026-01-01T10:00:00Z', active_alerts: 2, risk_spark: [0.1, 0.4, 0.83],
}

describe('formatting', () => {
  it('formats percentages and signed deltas', () => {
    expect(fmtPct(0.834)).toBe('83%')
    expect(fmtDelta(-3, 0)).toBe('\u22123')
    expect(fmtDelta(1.25, 1)).toBe('+1.3')
  })
})

describe('components', () => {
  it('RiskBadge shows category and score, and a fallback without an estimate', () => {
    const { rerender } = render(<RiskBadge category="High" score={0.83} />)
    expect(screen.getByTestId('risk-badge')).toHaveTextContent('High83%')
    rerender(<RiskBadge category={null} />)
    expect(screen.getByText('No estimate')).toBeInTheDocument()
  })

  it('PatientCard links to the right patient and shows risk, vitals and pending alerts', () => {
    render(<MemoryRouter><PatientCard state={state} settings={null} /></MemoryRouter>)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/patients/P007')
    expect(screen.getByText('83%')).toBeInTheDocument()
    expect(screen.getByText('92/58')).toBeInTheDocument()
    expect(screen.getByText('2 to review')).toBeInTheDocument()
  })

  it('AlertsTable offers Acknowledge only for unacknowledged alerts, and an empty state otherwise', () => {
    const base = { patient_id: 'P001', timestamp: '2026-01-01T10:00:00Z', risk_category: 'High' as const, risk_score: 0.7, reason: 'SpO2 low', acknowledged_at: null }
    const { rerender } = render(<MemoryRouter><AlertsTable onChange={() => {}} alerts={[{ ...base, alert_id: 1, acknowledged: false }, { ...base, alert_id: 2, acknowledged: true }]} /></MemoryRouter>)
    expect(screen.getAllByRole('button', { name: /acknowledge/i })).toHaveLength(1)
    rerender(<MemoryRouter><AlertsTable onChange={() => {}} alerts={[]} /></MemoryRouter>)
    expect(screen.getByText('No alerts here')).toBeInTheDocument()
  })
})

describe('ModelEvaluation page', () => {
  it('shows an empty state instead of metrics when no evaluation exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: 'evaluation_unavailable', message: 'No valid evaluation results exist.' } }) }))
    render(<ModelEvaluation />)
    await waitFor(() => expect(screen.getByText('No evaluation results yet')).toBeInTheDocument())
    expect(screen.queryByText('AUROC')).not.toBeInTheDocument()
  })

  it('shows a clear error when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')))
    render(<ModelEvaluation />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/cannot reach the backend/i))
  })
})
