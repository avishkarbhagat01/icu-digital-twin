import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import type { AdminSession, Patient, TwinState } from '../api/types'
import { useLive } from '../context/LiveData'
import { MeasurementForm } from '../components/MeasurementForm'
import { Empty, Notice, PageHeader } from '../components/ui'

export default function AdminPanel() {
  const { patients, refresh } = useLive()
  const [session, setSession] = useState<AdminSession | null>(null)
  const [checking, setChecking] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editingVitals, setEditingVitals] = useState<string | null>(null)

  useEffect(() => {
    api.adminSession()
      .then(setSession)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setChecking(false))
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.adminLogin(username, password)
      setSession(await api.adminSession())
      setPassword('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const createPatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const form = e.currentTarget
    setBusy(true)
    setError(null)
    try {
      await api.createPatient({
        patient_id: String(data.get('patient_id')).trim(),
        display_name: String(data.get('display_name')).trim(),
        age: Number(data.get('age')),
      })
      form.reset()
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const updatePatient = async (oldId: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const state: TwinState = await api.updatePatient(oldId, {
        patient_id: String(data.get('patient_id')).trim(),
        display_name: String(data.get('display_name')).trim(),
        age: Number(data.get('age')),
      })
      setEditing(null)
      await refresh()
      if (state.patient.patient_id !== oldId) setError(`Patient ID updated to ${state.patient.patient_id}.`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const deletePatient = async (patient: Patient) => {
    if (!window.confirm(`Delete ${patient.display_name} (${patient.patient_id}) and all of their vital measurements, alerts, and risk predictions?`)) return
    setBusy(true)
    setError(null)
    try {
      await api.deletePatient(patient.patient_id)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.adminLogout()
      setSession((current) => current ? { ...current, authenticated: false, username: null } : current)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Admin panel" subtitle="Manage patient records and access controls." />
      {error && <div className="mb-4"><Notice tone={error.startsWith('Patient ID updated') ? 'info' : 'error'}>{error}</Notice></div>}
      {checking && <p className="text-sm text-muted">Checking admin session…</p>}
      {!checking && session && !session.configured && (
        <Notice tone="error" title="Admin login is not configured">
          {session.configuration_error ?? 'Configure admin username, a password with at least 12 characters, and a random secret of at least 32 characters in backend/.env, then restart the backend.'}
        </Notice>
      )}
      {!checking && session?.configured && !session.authenticated && (
        <form className="panel max-w-md space-y-3 p-5" onSubmit={login}>
          <h2 className="panel-title">Admin sign in</h2>
          <label className="block text-xs text-muted">Username
            <input className="input mt-1" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="block text-xs text-muted">Password
            <input className="input mt-1" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      )}
      {!checking && session?.authenticated && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Signed in as <span className="font-medium text-ink-900">{session.username}</span></p>
            <button type="button" className="btn" onClick={logout} disabled={busy}>Sign out</button>
          </div>

          <form className="panel space-y-3 p-4" onSubmit={createPatient}>
            <h2 className="panel-title">Add patient</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs text-muted">Patient ID
                <input className="input mt-1" name="patient_id" required maxLength={32} pattern="[A-Za-z0-9_-]+" />
              </label>
              <label className="block text-xs text-muted">Display name
                <input className="input mt-1" name="display_name" required maxLength={100} />
              </label>
              <label className="block text-xs text-muted">Age
                <input className="input mt-1" name="age" type="number" min={0} max={120} required />
              </label>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create patient'}</button>
          </form>

          <section>
            <h2 className="panel-title mb-3">Patient records</h2>
            {!patients.length ? <div className="panel"><Empty title="No patients found" /></div> : (
              <div className="grid gap-3">
                {patients.map(({ patient, current }) => (
                  <article key={patient.patient_id} className="panel p-4">
                    {editing === patient.patient_id ? (
                      <form className="space-y-3" onSubmit={(e) => updatePatient(patient.patient_id, e)}>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block text-xs text-muted">Patient ID
                            <input className="input mt-1" name="patient_id" defaultValue={patient.patient_id} required maxLength={32} pattern="[A-Za-z0-9_-]+" />
                          </label>
                          <label className="block text-xs text-muted">Display name
                            <input className="input mt-1" name="display_name" defaultValue={patient.display_name} required maxLength={100} />
                          </label>
                          <label className="block text-xs text-muted">Age
                            <input className="input mt-1" name="age" type="number" defaultValue={patient.age} min={0} max={120} required />
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn btn-primary" type="submit" disabled={busy}>Save changes</button>
                          <button className="btn" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <Link className="font-medium text-accent-dark hover:underline" to={`/patients/${encodeURIComponent(patient.patient_id)}`}>
                            {patient.display_name} ({patient.patient_id})
                          </Link>
                          <p className="mt-1 text-sm text-muted">
                            Age {patient.age}
                            {current && <> · HR {current.heart_rate} · BP {current.systolic_bp}/{current.diastolic_bp} · SpO₂ {current.spo2}% · Temp {current.temperature}°C · RR {current.respiratory_rate}</>}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button className="btn" type="button" onClick={() => { setEditingVitals(editingVitals === patient.patient_id ? null : patient.patient_id); setEditing(null) }} disabled={busy}>
                            {editingVitals === patient.patient_id ? 'Cancel vital edit' : 'Edit vital signs'}
                          </button>
                          <button className="btn" type="button" onClick={() => setEditing(patient.patient_id)} disabled={busy}>Edit</button>
                          <button className="btn btn-danger" type="button" onClick={() => deletePatient(patient)} disabled={busy}>Delete</button>
                        </div>
                      </div>
                    )}
                    {editingVitals === patient.patient_id && (
                      <div className="mt-4 border-t border-line pt-4">
                        <h3 className="mb-1 text-sm font-semibold">Edit vital signs</h3>
                        <p className="mb-3 text-xs text-muted">
                          Saving records a new measurement using these values. Previous readings remain in the patient history.
                        </p>
                        <MeasurementForm
                          key={patient.patient_id}
                          patientId={patient.patient_id}
                          initialValues={current ?? undefined}
                          requireAll={!current}
                          submitLabel="Save vital signs"
                          successText="Updated vital signs recorded as a new measurement."
                          onDone={async () => { await refresh(); setEditingVitals(null) }}
                        />
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}
