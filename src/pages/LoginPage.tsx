import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address first')
      return
    }
    setError(null)
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setResetLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">ST Mobile CRM</h1>
          <p className="text-[var(--color-muted)] text-sm">Sign in to your team account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-muted)] mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="you@stmobileauto.com"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-[var(--color-muted)]">Password</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading}
                className="text-xs text-[var(--color-primary)] hover:brightness-125 transition"
              >
                {resetLoading ? 'Sending...' : 'Forgot password?'}
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="••••••••"
              required
            />
          </div>

          {resetSent && (
            <p className="text-xs" style={{ color: '#22C55E' }}>✓ Password reset email sent — check your inbox.</p>
          )}

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-primary)] text-white rounded px-3 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50 transition"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
