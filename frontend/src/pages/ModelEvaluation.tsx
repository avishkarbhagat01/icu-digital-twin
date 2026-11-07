import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, ApiError, errorMessage } from '../api/client'
import type { Evaluation } from '../api/types'
import { Empty, Notice, PageHeader } from '../components/ui'
import { fmtDateTime } from '../lib/format'

const METRICS: { key: keyof Evaluation['metrics']; label: string; hint: string }[] = [
  { key: 'auroc', label: 'AUROC', hint: 'How well scores rank deteriorating above stable rows' },
  { key: 'precision', label: 'Precision', hint: 'Share of High-risk calls that were true events' },
  { key: 'recall', label: 'Recall', hint: 'Share of true events that were called High' },
  { key: 'f1', label: 'F1 score', hint: 'Balance of precision and recall' },
]

export default function ModelEvaluation() {
  const [ev, setEv] = useState<Evaluation | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.evaluation().then(setEv).catch((e) => (e instanceof ApiError && e.status === 404 ? setMissing(e.message) : setError(errorMessage(e)))).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-sm text-muted">Loading evaluation…</p>
  if (error) return <Notice tone="error" title="Evaluation unavailable">{error}</Notice>
  if (missing || !ev) return (<><PageHeader title="Model evaluation" /><div className="panel"><Empty title="No evaluation results yet">{missing}</Empty></div></>)

  const cm = ev.confusion_matrix
  const total = cm.tn + cm.fp + cm.fn + cm.tp
  const importance = ev.feature_importance.slice(0, 10)
  return (
    <>
      <PageHeader title="Model evaluation" subtitle={`${ev.model_type} (${ev.model_version}), trained ${fmtDateTime(ev.trained_at)}`} />
      <div className="mb-5"><Notice tone="warn" title="Synthetic data results">{ev.disclaimer} High scores here mostly show that the simulated data is easy to separate, not that the model would work in an ICU.</Notice></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => (
          <div key={m.key} className="panel p-4">
            <p className="text-sm text-muted">{m.label}</p>
            <p className="mt-1 text-3xl font-semibold text-ink-900">{ev.metrics[m.key].toFixed(3)}</p>
            <p className="mt-1 text-xs text-muted">{m.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-label="Confusion matrix">
          <h2 className="panel-title">Confusion matrix</h2>
          <p className="mb-3 text-xs text-muted">Held-out test rows, High-risk cut-off {Math.round(ev.threshold * 100)}%.</p>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 text-center text-sm">
            <span /><span className="text-xs text-muted">Predicted stable</span><span className="text-xs text-muted">Predicted deteriorating</span>
            <span className="self-center text-xs text-muted [writing-mode:vertical-rl] rotate-180">Actually stable</span>
            <Cell label="True negative" n={cm.tn} total={total} good /><Cell label="False positive" n={cm.fp} total={total} />
            <span className="self-center text-xs text-muted [writing-mode:vertical-rl] rotate-180">Actually deteriorating</span>
            <Cell label="False negative" n={cm.fn} total={total} /><Cell label="True positive" n={cm.tp} total={total} good />
          </div>
        </section>

        <section className="panel p-5" aria-label="ROC curve">
          <h2 className="panel-title">ROC curve</h2>
          <p className="mb-2 text-xs text-muted">Area under the curve {ev.metrics.auroc.toFixed(3)}. Dashed line is chance.</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={ev.roc_curve} margin={{ top: 6, right: 12, bottom: 16, left: -10 }}>
              <CartesianGrid stroke="#E6EBF0" />
              <XAxis type="number" dataKey="fpr" domain={[0, 1]} tick={{ fontSize: 11 }} label={{ value: 'False positive rate', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#5B6B7C' }} />
              <YAxis type="number" domain={[0, 1]} tick={{ fontSize: 11 }} label={{ value: 'True positive rate', angle: -90, position: 'insideLeft', offset: 18, fontSize: 11, fill: '#5B6B7C' }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#9FB1C5" strokeDasharray="4 4" />
              <Line dataKey="tpr" stroke="#0B7A85" strokeWidth={2.2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="panel p-5" aria-label="Feature importance">
          <h2 className="panel-title">What the model relies on</h2>
          <p className="mb-2 text-xs text-muted">Drop in AUROC when a feature is shuffled (permutation importance, test set).</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={importance} layout="vertical" margin={{ left: 40, right: 12 }}>
              <CartesianGrid stroke="#E6EBF0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="feature" tick={{ fontSize: 11 }} width={120} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="importance" fill="#0F1D31" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="panel p-5" aria-label="Method">
          <h2 className="panel-title">What was predicted and how it was tested</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <Row t="Prediction target" d={ev.target} />
            <Row t="Data" d={`${ev.data_source}: ${ev.dataset.patients.toLocaleString()} simulated patients, ${ev.dataset.rows_total.toLocaleString()} measurement rows.`} />
            <Row t="Evaluation" d={`${ev.evaluation_method} Test rows: ${ev.dataset.rows_test.toLocaleString()} (${(ev.dataset.positive_rate_test * 100).toFixed(1)}% positive).`} />
            <Row t="Model selection" d={ev.candidates.map((c) => `${c.name}: validation AUROC ${c.validation_auroc.toFixed(3)}`).join('. ') + '. The better one was refit and tested once.'} />
            <Row t="Limitations" d="Synthetic data, one simulated cohort, no calibration or external validation. Results do not establish real-world clinical accuracy." />
          </dl>
        </section>
      </div>
    </>
  )
}

function Cell({ label, n, total, good = false }: { label: string; n: number; total: number; good?: boolean }) {
  return (
    <div className={`rounded-md px-3 py-4 ${good ? 'bg-low-soft text-low' : 'bg-high-soft text-high'}`}>
      <p className="text-2xl font-semibold">{n.toLocaleString()}</p>
      <p className="text-xs">{label} ({((n / total) * 100).toFixed(1)}%)</p>
    </div>
  )
}
const Row = ({ t, d }: { t: string; d: string }) => (<div><dt className="font-medium text-ink-900">{t}</dt><dd className="text-muted">{d}</dd></div>)
