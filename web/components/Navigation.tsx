'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import ApiKeyInput from './ApiKeyInput'
import RateLimitStatus from './RateLimitStatus'
import { useState, useEffect, useRef } from 'react'

export default function Navigation() {
  const pathname = usePathname()
  const { isAuthenticated, user, subscription, signOut } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement>(null)

  const isActive = (path: string) => pathname === path

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false)
  }, [pathname])

  // Handle escape key to close menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMenuOpen) {
        setIsMenuOpen(false)
        hamburgerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isMenuOpen])

  // Focus management: trap focus inside drawer when open
  useEffect(() => {
    if (isMenuOpen && drawerRef.current) {
      const focusableElements = drawerRef.current.querySelectorAll(
        'a[href], button:not([disabled])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement?.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement?.focus()
          }
        }
      }

      firstElement?.focus()
      document.addEventListener('keydown', handleTab)
      return () => document.removeEventListener('keydown', handleTab)
    } else if (!isMenuOpen && hamburgerRef.current && document.activeElement !== hamburgerRef.current) {
      // Return focus to hamburger when closing drawer
      hamburgerRef.current.focus()
    }
  }, [isMenuOpen])

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
    <>
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
              {/* Hamburger button - mobile only */}
              <button
                ref={hamburgerRef}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="md:hidden h-12 w-12 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Open menu"
                aria-expanded={isMenuOpen}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <RateLimitStatus />

              {isAuthenticated ? (
                <>
                  {subscription && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTierBadgeColor(subscription.tier)}`}>
                      {subscription.tier.toUpperCase()}
                    </span>
                  )}

                  <div className="hidden md:flex items-center space-x-3">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
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
                  <div className="hidden md:block">
                    <ApiKeyInput />
                  </div>
                  <Link
                    href="/login"
                    className="hidden md:block px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Overlay backdrop */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden"
          onClick={() => setIsMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        className={`fixed inset-y-0 left-0 z-50 w-80 glass-light dark:glass-dark border-r border-gray-200/50 dark:border-gray-800/50 transform transition-transform duration-300 ease-in-out md:hidden ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
      >
        <div className="flex flex-col h-full">
          {/* Logo section */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200/50 dark:border-gray-800/50">
            <Link href="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">
              KotaDB
            </Link>
            <button
              onClick={() => setIsMenuOpen(false)}
              className="h-10 w-10 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close menu"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation links */}
          <div className="flex-1 overflow-y-auto py-6">
            <nav role="menu">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    className={`block px-6 py-4 text-base font-medium transition-colors ${
                      isActive('/dashboard')
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/pricing"
                    className={`block px-6 py-4 text-base font-medium transition-colors ${
                      isActive('/pricing')
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Pricing
                  </Link>
                  <Link
                    href="/mcp"
                    className={`block px-6 py-4 text-base font-medium transition-colors ${
                      isActive('/mcp')
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                    }`}
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    MCP
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="block px-6 py-4 text-base font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* User profile section */}
          {isAuthenticated && (
            <div className="border-t border-gray-200/50 dark:border-gray-800/50 p-6">
              <div className="mb-4">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  {user?.email || user?.user_metadata?.user_name || 'User'}
                </div>
                {subscription && (
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getTierBadgeColor(subscription.tier)}`}>
                    {subscription.tier.toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                role="menuitem"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
