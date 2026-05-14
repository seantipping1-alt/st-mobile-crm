import { useState, useEffect } from 'react'

let showToastFn: ((message: string) => void) | null = null

export function toast(message: string) {
  if (showToastFn) showToastFn(message)
}

export default function Toast() {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    showToastFn = (msg: string) => {
      setMessage(msg)
      setVisible(true)
      setTimeout(() => setVisible(false), 2000)
    }
    return () => { showToastFn = null }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-green-600 text-white px-5 py-2.5 rounded-lg shadow-lg text-sm font-medium">
        {message}
      </div>
    </div>
  )
}
