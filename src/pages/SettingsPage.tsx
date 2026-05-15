import { useState, useEffect } from 'react'
import { RefreshCw, ExternalLink, Plug, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

type ConnectionStatus = 'loading' | 'connected' | 'disconnected' | 'error'

interface CompanyInfo {
  companyName: string
  realmId: string
}

export default function SettingsPage() {
  const [status, setStatus] = useState<ConnectionStatus>('loading')
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null)
  const [testing, setTesting] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check for ?qb=connected in URL
    const params = new URLSearchParams(window.location.search)
    if (params.get('qb') === 'connected') {
      setJustConnected(true)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
    checkConnection()
  }, [])

  async function checkConnection() {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/.netlify/functions/qb-api?path=companyinfo')
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          setStatus('disconnected')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.CompanyInfoResponse?.CompanyInfo || data.CompanyInfo) {
        const info = data.CompanyInfoResponse?.CompanyInfo || data.CompanyInfo
        setCompanyInfo({
          companyName: info.CompanyName || 'Unknown',
          realmId: data._realmId || '',
        })
        setStatus('connected')
      } else if (data.error) {
        setStatus('disconnected')
        setError(data.error)
      } else {
        setStatus('disconnected')
      }
    } catch (err: any) {
      setStatus('error')
      setError(err.message || 'Failed to check connection')
    }
  }

  async function testConnection() {
    setTesting(true)
    await checkConnection()
    setTesting(false)
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">Settings</h1>

      {/* QuickBooks Connection Card */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Plug size={18} className="text-[var(--color-primary)]" />
            <h2 className="text-base font-semibold text-white">QuickBooks Connection</h2>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Just connected success banner */}
          {justConnected && status === 'connected' && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg p-3 text-sm">
              <CheckCircle size={16} />
              <span>Successfully connected to QuickBooks!</span>
            </div>
          )}

          {/* Loading state */}
          {status === 'loading' && (
            <div className="flex items-center gap-3 py-4">
              <div className="animate-spin w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
              <span className="text-[var(--color-muted)] text-sm">Checking connection...</span>
            </div>
          )}

          {/* Connected state */}
          {status === 'connected' && companyInfo && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 text-sm font-medium">Connected</span>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)] text-sm">Company</span>
                  <span className="text-white text-sm font-medium">{companyInfo.companyName}</span>
                </div>
                {companyInfo.realmId && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--color-muted)] text-sm">Realm ID</span>
                    <span className="text-white text-sm font-mono">{companyInfo.realmId}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition disabled:opacity-50"
                >
                  <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  disabled
                  className="flex items-center gap-2 px-3 py-2 text-red-400/50 text-sm rounded-lg border border-gray-800 cursor-not-allowed"
                  title="Coming soon"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {/* Disconnected state */}
          {status === 'disconnected' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-gray-500 rounded-full" />
                <span className="text-[var(--color-muted)] text-sm">Not connected</span>
              </div>

              <p className="text-[var(--color-muted)] text-sm">
                Connect your QuickBooks Online account to sync customers, invoices, and payments.
              </p>

              <a
                href="/.netlify/functions/qb-auth"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2CA01C] hover:bg-[#249016] text-white text-sm font-medium rounded-lg transition"
              >
                <ExternalLink size={14} />
                Connect to QuickBooks
              </a>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <XCircle size={16} />
                <span className="text-sm">Connection error</span>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={checkConnection}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition"
                >
                  <RefreshCw size={14} />
                  Retry
                </button>
                <a
                  href="/.netlify/functions/qb-auth"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-[#2CA01C] hover:bg-[#249016] text-white text-sm rounded-lg transition"
                >
                  <ExternalLink size={14} />
                  Reconnect
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
