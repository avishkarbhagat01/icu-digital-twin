import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Activity, BellRing, Gauge, LayoutDashboard, Pause, Play, RotateCcw, Settings, StepForward, Users, HeartPulse, Shield } from 'lucide-react'
import { useLive } from '../context/LiveData'
import { Notice } from './ui'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/admin', label: 'Admin panel', icon: Shield },
  { to: '/trends', label: 'Vital trends', icon: Activity },
  { to: '/alerts', label: 'Risk and alerts', icon: BellRing },
  { to: '/model', label: 'Model evaluation', icon: Gauge },
  { to: '/settings', label: 'Settings and simulation', icon: Settings },
]

export function SimControls({ compact = false }: { compact?: boolean }) {
  const { sim, simAction } = useLive()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (a: 'start' | 'pause' | 'reset' | 'step') => {
    if (a === 'reset' && !window.confirm('Reset the simulation? All measurements, predictions and alerts are cleared and the synthetic patients restart.')) return
    setBusy(true); setErr(await simAction(a)); setBusy(false)
  }
  const running = sim?.running ?? false
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${running ? 'bg-low-soft text-low' : 'bg-canvas text-muted'}`} aria-live="polite">
        <span className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-low' : 'bg-muted/50'}`} />
        {sim ? (running ? 'Simulation running' : 'Simulation paused') : 'Simulation unavailable'}
        {sim && !compact && <span className="text-muted">(update {sim.tick_count})</span>}
      </span>
      {running ? (
        <button className="btn" onClick={() => run('pause')} disabled={busy || !sim}><Pause className="h-4 w-4" />Pause</button>
      ) : (
        <button className="btn btn-primary" onClick={() => run('start')} disabled={busy || !sim}><Play className="h-4 w-4" />Start</button>
      )}
      <button className="btn" onClick={() => run('step')} disabled={busy || !sim || running} title="Generate one new measurement for every patient"><StepForward className="h-4 w-4" />Step</button>
      <button className="btn" onClick={() => run('reset')} disabled={busy || !sim}><RotateCcw className="h-4 w-4" />Reset</button>
      {err && <span className="text-xs text-high" role="alert">{err}</span>}
    </div>
  )
}

export default function Layout() {
  const { alerts, error } = useLive()
  const active = alerts?.counts.active ?? 0
  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 flex-col bg-ink-900 text-ink-300 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-700"><HeartPulse className="h-5 w-5 text-[#33C1CC]" aria-hidden /></span>
          <div className="leading-tight">
            <p className="text-[15px] font-semibold text-white">Twin ICU</p>
            <p className="text-xs">Deterioration digital twin</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${isActive ? 'bg-ink-700 font-medium text-white' : 'hover:bg-ink-800 hover:text-white'}`}>
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {to === '/alerts' && active > 0 && <span className="rounded-full bg-high px-1.5 text-xs font-semibold text-white">{active}</span>}
            </NavLink>
          ))}
        </nav>
        <p className="px-5 pb-5 text-xs leading-relaxed">All patients are synthetic. Risk scores are prototype estimates and not clinical advice.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bg-ink-950 px-4 py-1.5 text-center text-xs text-ink-300">
          Research prototype using synthetic data. Not for clinical use or treatment decisions.
        </div>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden"><HeartPulse className="h-5 w-5 text-accent" aria-hidden /><span className="font-semibold">Twin ICU</span></div>
          <SimControls compact />
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3 py-1.5 lg:hidden" aria-label="Main mobile">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `whitespace-nowrap rounded-md px-2.5 py-1 text-sm ${isActive ? 'bg-accent-soft font-medium text-accent-dark' : 'text-muted'}`}>{label}</NavLink>
          ))}
        </nav>
        <main className="flex-1 px-4 py-6 lg:px-8">
          {error && <div className="mb-4"><Notice tone="error" title="Live data is unavailable">{error} The last values shown may be out of date.</Notice></div>}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
