'use client'

import { useAuth } from '@/context/AuthContext'
import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ConfigurationDisplay from '@/components/mcp/ConfigurationDisplay'
import CopyButton from '@/components/mcp/CopyButton'
import ToolReference from '@/components/mcp/ToolReference'

type ConfigType = 'global' | 'project'

function MCPContent() {
  const { user, apiKey, setApiKey, isLoading } = useAuth()
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState<ConfigType>('global')
  const [showKey, setShowKey] = useState(false)
  const [copiedConfig, setCopiedConfig] = useState<ConfigType | null>(null)
  const [loadingKey, setLoadingKey] = useState(false)
  const [keyFetchError, setKeyFetchError] = useState<string | null>(null)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  // Fetch API key from backend if user is authenticated but context doesn't have key yet
  useEffect(() => {
    const fetchApiKeyFromBackend = async () => {
      if (!user || apiKey || loadingKey || isLoading) {
        return
      }

      // Check localStorage first as immediate fallback
      const storedKey = localStorage.getItem('kotadb_api_key')
      if (storedKey) {
        setApiKey(storedKey)
        return
      }

      setLoadingKey(true)
      setKeyFetchError(null)

      try {
        const { createClient } = await import('@/lib/supabase')
        const supabase = createClient()
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
          setKeyFetchError('You must be logged in to view API key')
          setLoadingKey(false)
          return
        }

        const response = await fetch(`${apiUrl}/api/keys/current`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          // API key metadata endpoint doesn't return the secret, so we need to check localStorage
          // or prompt user to visit dashboard to see their key
          if (storedKey) {
            setApiKey(storedKey)
          }
        } else if (response.status === 404) {
          // No key exists - this is expected, not an error
          setKeyFetchError(null)
        } else {
          setKeyFetchError('Failed to load API key. Please try refreshing the page.')
        }
      } catch (error) {
        setKeyFetchError('An unexpected error occurred while loading your API key.')
      } finally {
        setLoadingKey(false)
      }
    }

    fetchApiKeyFromBackend()
  }, [user, apiKey, isLoading, loadingKey, apiUrl, setApiKey])

  const generateConfiguration = (type: ConfigType) => {
    if (!apiKey) return ''

    const config = {
      mcpServers: {
        kotadb: {
          type: 'http',
          url: `${apiUrl}/mcp`,
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        }
      }
    }

    return JSON.stringify(config, null, 2)
  }

  const handleCopy = async (type: ConfigType) => {
    const config = generateConfiguration(type)
    try {
      await navigator.clipboard.writeText(config)
      setCopiedConfig(type)
      setTimeout(() => setCopiedConfig(null), 2000)
    } catch (error) {
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea')
        textArea.value = config
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        setCopiedConfig(type)
        setTimeout(() => setCopiedConfig(null), 2000)
      } catch (fallbackError) {
        process.stderr.write(`Failed to copy configuration: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}\n`)
      }
    }
  }

  if (isLoading || loadingKey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              MCP Configuration for Claude Code
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Copy and paste this configuration to integrate KotaDB with Claude Code CLI
            </p>
          </div>

          {keyFetchError && (
            <div className="glass-light dark:glass-dark rounded-lg shadow-md p-8 text-center mb-6">
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Error Loading API Key
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {keyFetchError}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Retry
              </button>
            </div>
          )}

          {!apiKey && !keyFetchError ? (
            <div className="glass-light dark:glass-dark rounded-lg shadow-md p-8 text-center">
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No API Key Generated
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                You need to generate an API key before you can configure MCP integration
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Go to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="glass-light dark:glass-dark rounded-lg shadow-md overflow-hidden">
                <div className="border-b border-gray-200 dark:border-gray-700">
                  <nav className="flex -mb-px" aria-label="Tabs">
                    <button
                      onClick={() => setSelectedTab('global')}
                      className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                        selectedTab === 'global'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      Global Configuration
                    </button>
                    <button
                      onClick={() => setSelectedTab('project')}
                      className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                        selectedTab === 'project'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      Project Configuration
                    </button>
                  </nav>
                </div>

                <div className="p-6">
                  {/* Configuration Info */}
                  <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {selectedTab === 'global' ? (
                        <>
                          <strong>Global Configuration:</strong> Save to <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded">~/.claude/mcp.json</code> to use KotaDB in all Claude Code sessions
                        </>
                      ) : (
                        <>
                          <strong>Project Configuration:</strong> Save to <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded">.mcp.json</code> in your project root to use KotaDB only in this project
                        </>
                      )}
                    </p>
                  </div>

                  {/* Configuration Display */}
                  <ConfigurationDisplay
                    configuration={generateConfiguration(selectedTab)}
                    showKey={showKey}
                    apiKey={apiKey!}
                  />

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      {showKey ? 'Hide' : 'Show'} API Key
                    </button>
                    <CopyButton
                      onClick={() => handleCopy(selectedTab)}
                      copied={copiedConfig === selectedTab}
                    />
                  </div>
                </div>
              </div>

              {/* Setup Instructions */}
              <div className="glass-light dark:glass-dark rounded-lg shadow-md p-6 mt-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Setup Instructions
                </h2>
                <ol className="space-y-3 text-gray-700 dark:text-gray-300">
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium mr-3">
                      1
                    </span>
                    <span>Click &quot;Copy Configuration&quot; button above</span>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium mr-3">
                      2
                    </span>
                    <div>
                      <div>Save the configuration to:</div>
                      <ul className="mt-2 ml-6 space-y-1 text-sm">
                        <li>
                          <strong>macOS/Linux:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">~/.claude/mcp.json</code> (global) or <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">.mcp.json</code> (project)
                        </li>
                        <li>
                          <strong>Windows:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">%USERPROFILE%\.claude\mcp.json</code> (global) or <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">.mcp.json</code> (project)
                        </li>
                      </ul>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium mr-3">
                      3
                    </span>
                    <div>
                      <div>Verify the configuration:</div>
                      <code className="block mt-2 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded text-sm">
                        claude mcp list
                      </code>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        You should see &quot;kotadb&quot; in the list of available MCP servers
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium mr-3">
                      4
                    </span>
                    <span>Start using KotaDB tools in Claude Code!</span>
                  </li>
                </ol>

                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    Troubleshooting
                  </h3>
                  <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                    <li><strong>Connection failed:</strong> Verify your API key is valid and the server URL is correct</li>
                    <li><strong>401 Unauthorized:</strong> Your API key may have been revoked or is invalid</li>
                    <li><strong>429 Rate Limited:</strong> You have exceeded your tier&apos;s rate limit. Upgrade or wait for the rate limit to reset</li>
                  </ul>
                </div>
              </div>

              {/* Available Tools */}
              <ToolReference />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MCPPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <MCPContent />
    </Suspense>
  )
}
