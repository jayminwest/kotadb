'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function LandingHero() {
  const { user } = useAuth()

  return (
    <section className="relative overflow-hidden py-20 px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 opacity-50" />

      {/* Content */}
      <div className="relative max-w-4xl mx-auto text-center space-y-8">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
          Code Intelligence for{' '}
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            AI Agents
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
          Make Claude Code smarter about your codebase with semantic search, dependency analysis, and change impact detection via MCP
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          {user ? (
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              Get Started
            </Link>
          )}

          <a
            href="https://github.com/kotadb/kotadb"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 glass-light dark:glass-dark text-gray-900 dark:text-gray-100 font-semibold rounded-lg transition-all duration-200 hover:shadow-lg"
          >
            View on GitHub
          </a>
        </div>

        {/* MCP Integration badge */}
        <div className="flex items-center justify-center gap-2 pt-8">
          <div className="glass-light dark:glass-dark px-4 py-2 rounded-full text-sm font-medium">
            <span className="text-gray-700 dark:text-gray-300">
              🔌 Powered by Model Context Protocol
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
