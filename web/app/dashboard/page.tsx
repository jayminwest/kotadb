'use client'

import { useAuth } from '@/context/AuthContext'
import { useState } from 'react'
import type { CreatePortalSessionResponse } from '@shared/types/api'

export default function DashboardPage() {
  const { user, subscription, apiKey, isLoading } = useAuth()
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

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
        console.error('Failed to create portal session')
      }
    } catch (error) {
      console.error('Error creating portal session:', error)
    } finally {
      setLoadingPortal(false)
    }
  }

  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
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

          {/* API Keys Section */}
          <div className="glass-light dark:glass-dark rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">API Keys</h2>
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
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400 mb-4">No API keys configured</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  You can configure your API key in the navigation bar or contact support to generate one
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
