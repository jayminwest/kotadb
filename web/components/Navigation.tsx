'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ApiKeyInput from './ApiKeyInput'
import RateLimitStatus from './RateLimitStatus'

export default function Navigation() {
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  return (
    <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">
              KotaDB
            </Link>

            <div className="hidden md:flex space-x-4">
              <Link
                href="/search"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/search')
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
              >
                Search
              </Link>

              <Link
                href="/repository-index"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/repository-index')
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
              >
                Index
              </Link>

              <Link
                href="/files"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/files')
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
                }`}
              >
                Files
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <RateLimitStatus />
            <ApiKeyInput />
          </div>
        </div>
      </div>
    </nav>
  )
}
