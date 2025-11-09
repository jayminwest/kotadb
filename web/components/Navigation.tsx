'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import ApiKeyInput from './ApiKeyInput'
import RateLimitStatus from './RateLimitStatus'

export default function Navigation() {
  const pathname = usePathname()
  const { isAuthenticated, user, subscription, signOut } = useAuth()

  const isActive = (path: string) => pathname === path

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/'
  }

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case 'team':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'solo':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    }
  }

  return (
    <nav className="sticky top-0 z-50 glass-light dark:glass-dark border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">
              KotaDB
            </Link>

            <div className="hidden md:flex space-x-4">
              {isAuthenticated && (
                <>
                  <Link
                    href="/dashboard"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/dashboard')
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                  >
                    Dashboard
                  </Link>

                  <Link
                    href="/pricing"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/pricing')
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                  >
                    Pricing
                  </Link>

                  <Link
                    href="/mcp"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/mcp')
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                  >
                    MCP
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <RateLimitStatus />

            {isAuthenticated ? (
              <>
                {subscription && (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTierBadgeColor(subscription.tier)}`}>
                    {subscription.tier.toUpperCase()}
                  </span>
                )}

                <div className="flex items-center space-x-3">
                  <div className="hidden md:block text-sm text-gray-700 dark:text-gray-300">
                    {user?.email || user?.user_metadata?.user_name || 'User'}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <>
                <ApiKeyInput />
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
