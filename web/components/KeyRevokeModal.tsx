'use client'

import { useState } from 'react'

interface KeyRevokeModalProps {
  isOpen: boolean
  onClose: () => void
  onRevoke: () => Promise<void>
}

export default function KeyRevokeModal({ isOpen, onClose, onRevoke }: KeyRevokeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleRevoke = async () => {
    setLoading(true)
    setError(null)
    try {
      await onRevoke()
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setLoading(false)
    setError(null)
    setSuccess(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="glass-light dark:glass-dark rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Revoke API Key
        </h2>

        {!success ? (
          <>
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200">
                Revoking your API key will disable all API access. You will need to generate a new key to continue using KotaDB.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleRevoke}
                disabled={loading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Revoking...' : 'Revoke API Key'}
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
                API key revoked successfully. You can generate a new key from the dashboard.
              </p>
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
