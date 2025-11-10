'use client'

import { useState } from 'react'

interface KeyResetModalProps {
  isOpen: boolean
  onClose: () => void
  onReset: () => Promise<{ apiKey: string } | null>
}

export default function KeyResetModal({ isOpen, onClose, onReset }: KeyResetModalProps) {
  const [understood, setUnderstood] = useState(false)
  const [loading, setLoading] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleReset = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await onReset()
      if (result) {
        setNewKey(result.apiKey)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reset API key')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setUnderstood(false)
    setLoading(false)
    setNewKey(null)
    setError(null)
    setCopied(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="glass-light dark:glass-dark rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Reset API Key
        </h2>

        {!newKey ? (
          <>
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200">
                Resetting your API key will immediately invalidate your old key and break any existing integrations. This action cannot be undone.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">
                  I understand this will invalidate my old API key
                </span>
              </label>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleReset}
                disabled={!understood || loading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Resetting...' : 'Reset API Key'}
              </button>
              <button
                onClick={handleClose}
                disabled={loading}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
              <p className="text-sm text-green-800 dark:text-green-200">
                API key successfully reset!
              </p>
            </div>

            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                Save this key now. It won&apos;t be shown again.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New API Key
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newKey}
                  readOnly
                  className="flex-1 px-3 py-2 font-mono text-sm bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md"
                />
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
