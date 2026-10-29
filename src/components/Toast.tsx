import { useState, useEffect, useCallback } from 'react'

interface ToastOptions {
  action?: {
    label: string
    onClick: () => void
  }
  duration?: number
}

let showToastFn: ((message: string, options?: ToastOptions) => void) | null = null

export function toast(message: string, options?: ToastOptions) {
  if (showToastFn) showToastFn(message, options)
}

export default function Toast() {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const [action, setAction] = useState<ToastOptions['action'] | null>(null)
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const hide = useCallback(() => setVisible(false), [])

  useEffect(() => {
    showToastFn = (msg: string, options?: ToastOptions) => {
      if (timer) clearTimeout(timer)
      setMessage(msg)
      setAction(options?.action || null)
      setVisible(true)
      const t = setTimeout(hide, options?.duration || 2000)
      setTimer(t)
    }
    return () => { showToastFn = null }
  }, [timer, hide])

  if (!visible) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-gray-800 text-white px-5 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-4">
        <span>{message}</span>
        {action && (
          <button
            onClick={() => {
              if (timer) clearTimeout(timer)
              action.onClick()
              setVisible(false)
            }}
            className="text-accent font-bold uppercase text-xs hover:text-white transition-colors shrink-0"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}