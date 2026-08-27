import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useState } from 'react'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Toast from './components/Toast'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CustomersPage from './pages/CustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import JobsPage from './pages/JobsPage'
import NewJobPage from './pages/NewJobPage'
import JobDetailPage from './pages/JobDetailPage'
import ServicesPage from './pages/ServicesPage'
import SettingsPage from './pages/SettingsPage'
import BonusTrackerPage from './pages/BonusTrackerPage'
import FinancialAdvisorPage from './pages/FinancialAdvisorPage'
import HelpPage from './pages/HelpPage'
import PublicJobPage from './pages/PublicJobPage'
import PublicPortalPage from './pages/PublicPortalPage'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/new" element={<NewJobPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/team" element={<Navigate to="/settings" replace />} />
        <Route path="/bonus" element={<BonusTrackerPage />} />
        <Route path="/advisor" element={<FinancialAdvisorPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function PasswordResetModal() {
  const { clearPasswordRecovery } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setTimeout(() => {
        clearPasswordRecovery()
      }, 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl p-6 w-full max-w-sm mx-4" style={{ background: '#1E293B' }}>
        <h2 className="text-lg font-bold mb-1" style={{ color: '#F8FAFC' }}>Reset Password</h2>
        <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>Enter your new password below.</p>

        {success ? (
          <div className="text-center py-4">
            <p className="text-sm font-medium" style={{ color: '#22C55E' }}>✓ Password updated successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: '#0F172A', color: '#F8FAFC', border: '1px solid #334155' }}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#94A3B8' }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: '#0F172A', color: '#F8FAFC', border: '1px solid #334155' }}
              />
            </div>
            {error && <p className="text-xs" style={{ color: '#EF4444' }}>{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{ background: '#1FA0E5', color: '#fff' }}
            >
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes - no auth required */}
      <Route path="/j/:id" element={<PublicJobPage />} />
      <Route path="/p/:token" element={<PublicPortalPage />} />

      {/* Protected routes */}
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <PasswordRecoveryGate />
        <Toast />
      </AuthProvider>
    </BrowserRouter>
  )
}

function PasswordRecoveryGate() {
  const { passwordRecovery } = useAuth()
  if (!passwordRecovery) return null
  return <PasswordResetModal />
}
