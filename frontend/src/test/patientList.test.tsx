import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { TwinState } from '../api/types'
import PatientList from '../pages/PatientList'

const patient: TwinState = {
  patient: { patient_id: 'P001', display_name: 'Synthetic Patient 001', age: 65, admission_time: '2026-01-01T00:00:00Z', demo_status: 'synthetic' },
  current: null,
  previous: null,
  deltas: {},
  flags: [],
  risk: null,
  risk_error: null,
  measurement_count: 0,
  last_update: null,
  active_alerts: 0,
}

vi.mock('../context/LiveData', () => ({
  useLive: () => ({ patients: [patient] }),
}))

describe('PatientList', () => {
  it('renders the patient ID as a link to the patient details', () => {
    render(<MemoryRouter><PatientList /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'P001' })).toHaveAttribute('href', '/patients/P001')
  })
})
