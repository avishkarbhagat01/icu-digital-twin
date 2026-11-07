export type RiskCategory = 'Low' | 'Medium' | 'High'
export type VitalKey = 'heart_rate' | 'systolic_bp' | 'diastolic_bp' | 'spo2' | 'temperature' | 'respiratory_rate'
export type Vitals = Record<VitalKey, number | null>

export interface Patient { patient_id: string; display_name: string; age: number; admission_time: string; demo_status: string }
export interface AdminSession { configured: boolean; authenticated: boolean; username: string | null; configuration_error?: string | null }
export interface Measurement extends Vitals { measurement_id: number; timestamp: string; quality: 'ok' | 'imputed'; quality_notes: string | null }
export interface Risk { risk_score: number; risk_category: RiskCategory; model_version: string; timestamp: string; reason: string }
export interface Flag { vital: VitalKey; status: 'low' | 'high'; value: number; message: string }

export interface TwinState {
  patient: Patient
  current: Measurement | null
  previous: Measurement | null
  deltas: Partial<Record<VitalKey, number>>
  flags: Flag[]
  risk: Risk | null
  risk_error: string | null
  measurement_count: number
  last_update: string | null
  active_alerts: number
  risk_spark?: number[]
}
export interface HistoryPoint extends Vitals { measurement_id: number; timestamp: string; quality: string; risk_score: number | null; risk_category: RiskCategory | null }
export interface Alert { alert_id: number; patient_id: string; timestamp: string; risk_category: RiskCategory; risk_score: number; reason: string; acknowledged: boolean; acknowledged_at: string | null }
export interface AlertList { items: Alert[]; counts: { active: number; acknowledged: number } }
export interface SimStatus { running: boolean; tick_count: number; patient_count: number; interval_seconds: number }
export interface AppSettings { interval_seconds: number; medium_threshold: number; high_threshold: number }
export interface ModelInfo { available: boolean; error: string | null; model_version: string | null; model_type: string | null; target: string | null; data_source: string | null; trained_at: string | null; disclaimer: string }
export interface Evaluation {
  model_version: string; model_type: string; trained_at: string; data_source: string; target: string; horizon_steps: number
  evaluation_method: string; threshold: number; disclaimer: string
  dataset: { patients: number; rows_total: number; rows_train: number; rows_validation: number; rows_test: number; positive_rate_test: number }
  candidates: { name: string; validation_auroc: number }[]
  metrics: { auroc: number; auprc: number; precision: number; recall: number; f1: number; accuracy: number }
  confusion_matrix: { tn: number; fp: number; fn: number; tp: number }
  roc_curve: { fpr: number; tpr: number }[]
  feature_importance: { feature: string; importance: number }[]
}
