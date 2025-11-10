'use client'

import { useAuth } from '@/context/AuthContext'
import { useState } from 'react'
import type { CreateCheckoutSessionResponse } from '@shared/types/api'

export default function PricingPage() {
  const { isAuthenticated, subscription, session } = useAuth()
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleUpgrade = async (tier: 'solo' | 'team') => {
    if (!isAuthenticated || !session) {
      window.location.href = '/login'
      return
    }

    setLoadingTier(tier)
    setError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const response = await fetch(`${apiUrl}/api/subscriptions/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tier,
          successUrl: `${window.location.origin}/dashboard?upgrade=success`,
          cancelUrl: `${window.location.origin}/pricing?upgrade=canceled`,
        }),
      })

      if (response.ok) {
        const data: CreateCheckoutSessionResponse = await response.json()
        window.location.href = data.url
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create checkout session' }))
        const errorMessage = errorData.error || 'Failed to create checkout session'
        setError(errorMessage)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error. Please try again.'
      setError(message)
    } finally {
      setLoadingTier(null)
    }
  }

  const isCurrentPlan = (tier: string) => {
    return subscription?.tier === tier
  }

  const tiers = [
    {
      name: 'Free',
      tier: 'free',
      price: '$0',
      period: 'forever',
      description: 'Perfect for getting started',
      features: [
        '100 requests per hour',
        'Basic code search',
        'Repository indexing',
        'Community support',
      ],
      cta: 'Get Started',
      highlighted: false,
    },
    {
      name: 'Solo',
      tier: 'solo',
      price: '$29.99',
      period: 'per month',
      description: 'For individual developers',
      features: [
        '1,000 requests per hour',
        'Advanced code search',
        'Unlimited repositories',
        'Priority support',
        'API access',
      ],
      cta: 'Upgrade to Solo',
      highlighted: true,
    },
    {
      name: 'Team',
      tier: 'team',
      price: '$49.99',
      period: 'per month',
      description: 'For development teams',
      features: [
        '10,000 requests per hour',
        'Advanced code search',
        'Unlimited repositories',
        'Priority support',
        'API access',
        'Team collaboration',
        'Dedicated support',
      ],
      cta: 'Upgrade to Team',
      highlighted: false,
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Select the perfect plan for your needs
          </p>
          {error && (
            <div className="mt-4 mx-auto max-w-2xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="mt-2 text-sm text-red-600 dark:text-red-400 underline hover:text-red-700 dark:hover:text-red-300"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {tiers.map((tier) => (
            <div
              key={tier.tier}
              className={`glass-light dark:glass-dark rounded-lg shadow-lg overflow-hidden transition-all duration-200 hover:shadow-xl ${
                tier.highlighted ? 'ring-2 ring-blue-600 transform scale-105' : ''
              }`}
            >
              {tier.highlighted && (
                <div className="bg-blue-600 text-white text-center py-2 text-sm font-semibold">
                  Most Popular
                </div>
              )}

              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {tier.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">{tier.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                    {tier.price}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 ml-2">{tier.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <svg
                        className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrentPlan(tier.tier) ? (
                  <div className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-center font-medium">
                    Current Plan
                  </div>
                ) : tier.tier === 'free' ? (
                  <a
                    href={isAuthenticated ? '/dashboard' : '/login'}
                    className="block w-full py-3 px-4 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md text-center font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <button
                    onClick={() => handleUpgrade(tier.tier as 'solo' | 'team')}
                    disabled={loadingTier === tier.tier}
                    className={`w-full py-3 px-4 rounded-md text-center font-medium transition-colors ${
                      tier.highlighted
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600'
                    } disabled:opacity-50`}
                  >
                    {loadingTier === tier.tier ? 'Loading...' : tier.cta}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            All plans include a 14-day free trial. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
