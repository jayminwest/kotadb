'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useState, useEffect } from 'react'

export default function LandingHero() {
  const { user } = useAuth()
  const [apiStatus, setApiStatus] = useState<'checking' | 'healthy' | 'error'>('checking')
  const [apiVersion, setApiVersion] = useState<string>('')

  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
        const response = await fetch(`${apiUrl}/health`)

        if (response.ok) {
          const data = await response.json()
          setApiStatus('healthy')
          setApiVersion(data.version || 'unknown')
        } else {
          setApiStatus('error')
        }
      } catch (error) {
        setApiStatus('error')
      }
    }

    checkApiHealth()
  }, [])

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
        </div>

        {/* API Status and MCP Badge */}
        <div className="flex flex-col items-center justify-center gap-3 pt-8">
          {/* API Status Badge */}
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            apiStatus === 'healthy'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : apiStatus === 'error'
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${
              apiStatus === 'healthy' ? 'bg-green-500' : apiStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
            }`} />
            {apiStatus === 'healthy'
              ? `API: Healthy ${apiVersion && `(v${apiVersion})`}`
              : apiStatus === 'error'
              ? 'API: Unavailable'
              : 'Checking API...'
            }
          </div>

          {/* MCP Integration badge */}
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
