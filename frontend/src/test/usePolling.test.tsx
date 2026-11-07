import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePolling } from '../hooks/usePolling'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe('usePolling', () => {
  it('keeps the result of the latest request when an older request resolves last', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => usePolling(fetcher, 60_000))

    act(() => { void result.current.refresh() })
    await act(async () => { second.resolve('second'); await second.promise })
    await waitFor(() => expect(result.current.data).toBe('second'))

    await act(async () => { first.resolve('first'); await first.promise })
    expect(result.current.data).toBe('second')
  })

  it('clears the previous data when dependencies change', async () => {
    const fetcher = vi.fn(async (id: string) => id)
    const { result, rerender } = renderHook(
      ({ id }) => usePolling(() => fetcher(id), 60_000, [id]),
      { initialProps: { id: 'P001' } },
    )
    await waitFor(() => expect(result.current.data).toBe('P001'))

    rerender({ id: 'P002' })
    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.data).toBe('P002'))
  })
})
