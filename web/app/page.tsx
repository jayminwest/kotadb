'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

export default function Home() {
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
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Welcome to <span className="text-blue-600 dark:text-blue-400">KotaDB</span>
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          A lightweight code intelligence platform for indexing and searching repositories
        </p>

        {/* API Status Badge */}
        <div className="flex justify-center">
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
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid md:grid-cols-3 gap-6">
        <Link
          href="/search"
          className="block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
        >
          <h2 className="text-2xl font-semibold mb-3">Search Code</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Full-text search across indexed repositories with context snippets
          </p>
        </Link>

        <Link
          href="/repository-index"
          className="block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
        >
          <h2 className="text-2xl font-semibold mb-3">Index Repository</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Index GitHub repositories for searchable code intelligence
          </p>
        </Link>

        <Link
          href="/files"
          className="block p-6 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
        >
          <h2 className="text-2xl font-semibold mb-3">Recent Files</h2>
          <p className="text-gray-600 dark:text-gray-400">
            View recently indexed files and repository metadata
          </p>
        </Link>
      </section>

      {/* Getting Started */}
      <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 space-y-4">
        <h2 className="text-2xl font-semibold">Getting Started</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
          <li>Enter your API key in the navigation bar (format: <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">kota_&lt;tier&gt;_&lt;key_id&gt;_&lt;secret&gt;</code>)</li>
          <li>Index a repository or search existing indexed code</li>
          <li>Monitor your rate limit quota in the header</li>
        </ol>
      </section>
    </div>
  )
}
