import { useState } from 'react'
import { api } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { useLive } from '../context/LiveData'
import { AlertsTable } from '../components/AlertsTable'
import { Notice, PageHeader } from '../components/ui'

type Tab = 'active' | 'acknowledged' | 'all'
const TABS: { id: Tab; label: string }[] = [{ id: 'active', label: 'Needs review' }, { id: 'acknowledged', label: 'Acknowledged' }, { id: 'all', label: 'Full history' }]

export default function Alerts() {
  const { settings, refresh } = useLive()
  const [tab, setTab] = useState<Tab>('active')
  const list = usePolling(() => api.alerts(tab, undefined, 200), 2000, [tab])
  const counts = list.data?.counts
  return (
    <>
      <PageHeader title="Risk and alerts" subtitle={settings ? `An alert is raised when a patient's risk estimate rises to Medium (${Math.round(settings.medium_threshold * 100)}% or more) or High (${Math.round(settings.high_threshold * 100)}% or more).` : undefined} />
      <div className="mb-4"><Notice>Acknowledging an alert records that someone has seen it. It is not a clinical intervention and does not change the patient's risk estimate.</Notice></div>
      {list.error && <div className="mb-4"><Notice tone="error" title="Alerts unavailable">{list.error}</Notice></div>}
      <div className="mb-3 flex gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-accent font-medium text-accent-dark' : 'border-transparent text-muted hover:text-ink-900'}`}>
            {t.label}{counts && t.id !== 'all' && <span className="ml-1.5 rounded-full bg-canvas px-1.5 text-xs">{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      <div className="panel"><AlertsTable alerts={list.data?.items ?? []} onChange={() => { list.refresh(); refresh() }} /></div>
    </>
  )
}
