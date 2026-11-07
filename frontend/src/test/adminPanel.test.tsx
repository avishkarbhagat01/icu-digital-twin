import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPanel from '../pages/AdminPanel'

const { api, refresh, patientState } = vi.hoisted(() => ({
  api: {
    adminSession: vi.fn(),
    addMeasurement: vi.fn(),
  },
  refresh: vi.fn(),
  patientState: {
    patient: { patient_id: 'P007', display_name: 'Patient 007', age: 71, admission_time: '2026-01-01T00:00:00Z', demo_status: 'synthetic' },
    current: { measurement_id: 1, timestamp: '2026-01-01T10:00:00Z', heart_rate: 128, systolic_bp: 92, diastolic_bp: 58, spo2: 89, temperature: 38.6, respiratory_rate: 27, quality: 'ok', quality_notes: null },
    previous: null, deltas: {}, flags: [], risk: null, risk_error: null, measurement_count: 1, last_update: null, active_alerts: 0,
  },
}))

vi.mock('../api/client', () => ({
  api: {
    ...api,
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
    deletePatient: vi.fn(),
    adminLogout: vi.fn(),
  },
  errorMessage: (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.',
}))

vi.mock('../context/LiveData', () => ({
  useLive: () => ({ patients: [patientState], refresh }),
}))

describe('AdminPanel vital sign editing', () => {
  beforeEach(() => {
    api.adminSession.mockResolvedValue({ configured: true, authenticated: true, username: 'admin' })
    api.addMeasurement.mockResolvedValue(patientState)
    refresh.mockResolvedValue(undefined)
  })

  it('prefills the latest vitals and records edited values as a new measurement', async () => {
    render(<MemoryRouter><AdminPanel /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit vital signs' }))

    expect(screen.getByLabelText(/Heart rate/)).toHaveValue('128')
    fireEvent.change(screen.getByLabelText(/Heart rate/), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save vital signs' }))

    await waitFor(() => expect(api.addMeasurement).toHaveBeenCalledWith('P007', {
      heart_rate: 100,
      systolic_bp: 92,
      diastolic_bp: 58,
      spo2: 89,
      temperature: 38.6,
      respiratory_rate: 27,
    }))
    expect(refresh).toHaveBeenCalled()
  })
})
