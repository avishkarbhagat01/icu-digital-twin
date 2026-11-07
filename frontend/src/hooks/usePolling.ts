import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'

/** Calls `fetcher` immediately and then every `intervalMs`. Keeps the last good data if a refresh fails. */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const ref = useRef(fetcher)
  const seq = useRef(0)
  ref.current = fetcher

  const refresh = useCallback(async () => {
    const mine = ++seq.current
    try {
      const result = await ref.current()
      if (mine !== seq.current) return
      setData(result)
      setError(null)
    } catch (e) {
      if (mine !== seq.current) return
      setError(errorMessage(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setData(null)
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, refresh, ...deps])

  return { data, error, loading, refresh }
}
