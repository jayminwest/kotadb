'use client'

import { useAuth } from '@/context/AuthContext'
import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import type { CreatePortalSessionResponse } from '@shared/types/api'
import KeyResetModal from '@/components/KeyResetModal'
import KeyRevokeModal from '@/components/KeyRevokeModal'

interface KeyMetadata {
  keyId: string
  tier: string
  rateLimitPerHour: number
  createdAt: string
  lastUsedAt: string | null
  enabled: boolean
}

function DashboardContent() {
  const { user, subscription, apiKey, setApiKey, isLoading } = useAuth()
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [loadingKeyGen, setLoadingKeyGen] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [keyGenError, setKeyGenError] = useState<string | null>(null)
  const [keyGenSuccess, setKeyGenSuccess] = useState<string | null>(null)
  const [keyMetadata, setKeyMetadata] = useState<KeyMetadata | null>(null)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const router = useRouter()

  // Fetch key metadata when user is authenticated and has an API key
  useEffect(() => {
    if (user && apiKey) {
      fetchKeyMetadata()
    }
  }, [user, apiKey])

  const handleManageBilling = async () => {
    setLoadingPortal(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const response = await fetch(`${apiUrl}/api/subscriptions/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      })

      if (response.ok) {
        const data: CreatePortalSessionResponse = await response.json()
        window.location.href = data.url
      } else {
        process.stderr.write('Failed to create portal session\n')
      }
    } catch (error) {
      process.stderr.write(`Error creating portal session: ${error instanceof Error ? error.message : String(error)}\n`)
    } finally {
      setLoadingPortal(false)
    }
  }

  const handleGenerateApiKey = async () => {
    setLoadingKeyGen(true)
    setKeyGenError(null)
    setKeyGenSuccess(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

      // Get the current session
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setKeyGenError('You must be logged in to generate an API key')
        return
      }

      const response = await fetch(`${apiUrl}/api/keys/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const keyData = await response.json() as {
          apiKey?: string
          keyId: string
          message?: string
        }

        if (keyData.apiKey) {
          // New key generated
          setApiKey(keyData.apiKey)
          setKeyGenSuccess('API key successfully generated!')
          // Auto-refresh metadata to show new key info
          await fetchKeyMetadata()
        } else if (keyData.message?.includes('already exists')) {
          // Key already exists - fetch metadata to display it
          setKeyGenError('You already have an API key. Fetching details...')
          try {
            await fetchKeyMetadata()
            // Clear error and show success message after successful fetch
            setKeyGenError(null)
            setKeyGenSuccess('API key already exists and is active')
          } catch (fetchError) {
            // If fetch fails, update error message
            setKeyGenError('You already have an API key. Please refresh the page to view details.')
          }
        }
      } else {
        const errorData = await response.json() as { error?: string }
        setKeyGenError(errorData.error || 'Failed to generate API key')
      }
    } catch (error) {
      process.stderr.write(`Error generating API key: ${error instanceof Error ? error.message : String(error)}\n`)
      setKeyGenError('An unexpected error occurred. Please try again.')
    } finally {
      setLoadingKeyGen(false)
    }
  }

  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }

  const fetchKeyMetadata = async () => {
    setLoadingMetadata(true)
    setMetadataError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setMetadataError('You must be logged in to view API key metadata')
        return
      }

      const response = await fetch(`${apiUrl}/api/keys/current`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json() as KeyMetadata
        setKeyMetadata(data)
      } else if (response.status === 404) {
        setKeyMetadata(null) // No key exists
      } else {
        setMetadataError('Failed to load API key metadata')
      }
    } catch (error) {
      setMetadataError('An unexpected error occurred')
    } finally {
      setLoadingMetadata(false)
    }
  }

  const handleResetApiKey = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        throw new Error('You must be logged in to reset your API key')
      }

      const response = await fetch(`${apiUrl}/api/keys/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('kotadb_api_key', data.apiKey)
        await fetchKeyMetadata()
        return { apiKey: data.apiKey }
      } else if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        throw new Error(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to reset API key')
      }
    } catch (error: any) {
      throw error
    }
  }

  const handleRevokeApiKey = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        throw new Error('You must be logged in to revoke your API key')
      }

      const response = await fetch(`${apiUrl}/api/keys/current`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        localStorage.removeItem('kotadb_api_key')
        setKeyMetadata(null)
        setKeyGenSuccess('API key revoked successfully')
        // Reload to update auth context
        window.location.reload()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to revoke API key')
      }
    } catch (error: any) {
      throw error
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'trialing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'canceled':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">Dashboard</h1>

          {/* User Profile Section */}
          <div className="glass-light dark:glass-dark rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Profile</h2>
            <div className="space-y-3">
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Email:</span>
                <p className="text-gray-900 dark:text-gray-100">{user?.email || 'N/A'}</p>
              </div>
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">GitHub Username:</span>
                <p className="text-gray-900 dark:text-gray-100">
                  {user?.user_metadata?.user_name || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Subscription Section */}
          <div className="glass-light dark:glass-dark rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Subscription</h2>
              {subscription && subscription.tier !== 'free' && (
                <button
                  onClick={handleManageBilling}
                  disabled={loadingPortal}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loadingPortal ? 'Loading...' : 'Manage Billing'}
                </button>
              )}
            </div>

            {subscription ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tier:</span>
                  <span className="px-3 py-1 rounded-full text-xs font-medium glass-light dark:glass-dark bg-blue-100/50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                    {subscription.tier.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(subscription.status)}`}>
                    {subscription.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Current Period:</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                  </p>
                </div>
                {subscription.cancel_at_period_end && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Your subscription will be canceled at the end of the current billing period.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">You are on the free tier</p>
                <a
                  href="/pricing"
                  className="inline-block px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Upgrade to Solo or Team
                </a>
              </div>
            )}
          </div>

          {/* MCP Configuration Section */}
          {apiKey && (
            <div className="glass-light dark:glass-dark rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">MCP Configuration</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Integrate KotaDB with Claude Code CLI using MCP (Model Context Protocol)
              </p>
              <button
                onClick={() => router.push('/mcp')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
                Configure MCP Integration
              </button>
            </div>
          )}

          {/* API Keys Section */}
          <div className="glass-light dark:glass-dark rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">API Keys</h2>

            {/* Success Message */}
            {keyGenSuccess && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
                <p className="text-sm text-green-800 dark:text-green-200">
                  {keyGenSuccess}
                </p>
              </div>
            )}

            {/* Error Message */}
            {keyGenError && !keyMetadata && !apiKey && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-200">
                  {keyGenError}
                </p>
              </div>
            )}

            {/* Key Metadata Card */}
            {loadingMetadata && (
              <div className="mb-4 p-4 glass-light dark:glass-dark rounded-md animate-pulse">
                <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            )}

            {metadataError && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {metadataError}
                </p>
              </div>
            )}

            {keyMetadata && (
              <div className="mb-4 p-4 glass-light dark:glass-dark rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Key ID:</span>
                  <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                    {keyMetadata.keyId.substring(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Tier:</span>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100/50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
                    {keyMetadata.tier.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Rate Limit:</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {keyMetadata.rateLimitPerHour} requests/hour
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Created:</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {formatDate(keyMetadata.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Last Used:</span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {keyMetadata.lastUsedAt ? formatRelativeTime(keyMetadata.lastUsedAt) : 'Never used'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Status:</span>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Active
                  </span>
                </div>
              </div>
            )}

            {apiKey ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 glass-light dark:glass-dark rounded-md">
                  <div className="flex-1 font-mono text-sm text-gray-900 dark:text-gray-100">
                    {apiKey.substring(0, 20)}...{apiKey.substring(apiKey.length - 10)}
                  </div>
                  <button
                    onClick={copyApiKey}
                    className="ml-4 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors"
                  >
                    {copiedKey ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Use this API key to authenticate requests to the KotaDB API
                </p>

                {/* Key Management Buttons */}
                <div className="flex space-x-3 mt-4">
                  <button
                    onClick={() => setShowResetModal(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 transition-colors"
                  >
                    Reset API Key
                  </button>
                  <button
                    onClick={() => setShowRevokeModal(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                  >
                    Revoke API Key
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">No API key configured</p>
                <button
                  onClick={handleGenerateApiKey}
                  disabled={loadingKeyGen}
                  className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingKeyGen ? 'Generating...' : 'Generate API Key'}
                </button>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                  Click the button above to generate your first API key
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <KeyResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onReset={handleResetApiKey}
      />
      <KeyRevokeModal
        isOpen={showRevokeModal}
        onClose={() => setShowRevokeModal(false)}
        onRevoke={handleRevokeApiKey}
      />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
