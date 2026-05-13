import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
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
            <label className="block text-sm text-[var(--color-muted)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="••••••••"
              required
            />
          </div>

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
