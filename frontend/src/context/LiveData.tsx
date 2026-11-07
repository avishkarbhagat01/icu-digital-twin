import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { api, errorMessage } from '../api/client'
import type { AlertList, AppSettings, SimStatus, TwinState } from '../api/types'
import { usePolling } from '../hooks/usePolling'

interface Live {
  patients: TwinState[]
  alerts: AlertList | null
  sim: SimStatus | null
  settings: AppSettings | null
  error: string | null
  loading: boolean
  refresh: () => Promise<void>
  simAction: (a: 'start' | 'pause' | 'reset' | 'step') => Promise<string | null>
}

const Ctx = createContext<Live | null>(null)
const POLL_MS = 2000

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const p = usePolling(api.patients, POLL_MS)
  const a = usePolling(() => api.alerts('all', undefined, 50), POLL_MS)
  const s = usePolling(api.simulation, POLL_MS)
  const st = usePolling(api.settings, POLL_MS)

  const pr = p.refresh, ar = a.refresh, sr = s.refresh, str = st.refresh
  const refresh = useCallback(async () => { await Promise.all([pr(), ar(), sr(), str()]) }, [pr, ar, sr, str])
  const simAction = useCallback(async (act: 'start' | 'pause' | 'reset' | 'step') => {
    try { await api.simAction(act); await refresh(); return null } catch (e) { return errorMessage(e) }
  }, [refresh])

  const value = useMemo<Live>(() => ({
    patients: p.data ?? [], alerts: a.data, sim: s.data, settings: st.data,
    error: p.error ?? a.error ?? s.error, loading: p.loading, refresh, simAction,
  }), [p.data, a.data, s.data, st.data, p.error, a.error, s.error, p.loading, refresh, simAction])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLive() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLive must be used inside LiveDataProvider')
  return v
}
