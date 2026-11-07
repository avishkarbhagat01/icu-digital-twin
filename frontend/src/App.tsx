import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Empty } from './components/ui'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const PatientList = lazy(() => import('./pages/PatientList'))
const PatientDetail = lazy(() => import('./pages/PatientDetail'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const Trends = lazy(() => import('./pages/Trends'))
const Alerts = lazy(() => import('./pages/Alerts'))
const ModelEvaluation = lazy(() => import('./pages/ModelEvaluation'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

export default function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="admin" element={<AdminPanel />} />
          <Route path="trends" element={<Trends />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="model" element={<ModelEvaluation />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Empty title="Page not found">Use the navigation to return to the overview.</Empty>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
