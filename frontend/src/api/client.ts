import type { AdminSession, Alert, AlertList, AppSettings, Evaluation, HistoryPoint, ModelInfo, Patient, SimStatus, TwinState, Vitals } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public details?: { field?: string; message?: string }[]) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, credentials: 'include', ...init })
  } catch {
    throw new ApiError('Cannot reach the backend. Check that the API server is running.', 0, 'network')
  }
  if (!res.ok) {
    let body: any = null
    try { body = await res.json() } catch { /* not JSON */ }
    const e = body?.error
    throw new ApiError(e?.message ?? `Request failed (${res.status}).`, res.status, e?.code, e?.details)
  }
  return res.json() as Promise<T>
}

const post = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  patients: () => request<TwinState[]>('/patients'),
  patient: (id: string) => request<TwinState>(`/patients/${id}`),
  createPatient: (patient: Pick<Patient, 'patient_id' | 'display_name' | 'age'>) => post<TwinState>('/patients', patient),
  updatePatient: (id: string, patient: Pick<Patient, 'patient_id' | 'display_name' | 'age'>) =>
    request<TwinState>(`/patients/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patient) }),
  deletePatient: (id: string) => request<{ deleted: boolean; patient_id: string }>(`/patients/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminSession: () => request<AdminSession>('/admin/session'),
  adminLogin: (username: string, password: string) => post<{ authenticated: boolean; username: string }>('/admin/login', { username, password }),
  adminLogout: () => post<{ authenticated: boolean; username: string | null }>('/admin/logout'),
  history: (id: string, limit = 60) => request<HistoryPoint[]>(`/patients/${id}/history?limit=${limit}`),
  addMeasurement: (id: string, v: Partial<Vitals>) => post<TwinState>(`/patients/${id}/measurements`, v),
  alerts: (status: 'all' | 'active' | 'acknowledged' = 'all', patientId?: string, limit = 100) =>
    request<AlertList>(`/alerts?status=${status}&limit=${limit}${patientId ? `&patient_id=${patientId}` : ''}`),
  acknowledge: (id: number) => post<Alert>(`/alerts/${id}/acknowledge`),
  simulation: () => request<SimStatus>('/simulation'),
  simAction: (a: 'start' | 'pause' | 'reset' | 'step') => post<SimStatus>(`/simulation/${a}`),
  settings: () => request<AppSettings>('/settings'),
  saveSettings: (s: Partial<AppSettings>) => request<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(s) }),
  model: () => request<ModelInfo>('/model'),
  evaluation: () => request<Evaluation>('/model/evaluation'),
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')
