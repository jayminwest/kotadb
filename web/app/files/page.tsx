'use client'

import { useState, useEffect } from 'react'
import { apiClient, ApiError } from '@/lib/api-client'
import { useAuth } from '@/context/AuthContext'
import FileList from '@/components/FileList'
import type { SearchResult } from '@shared/types/api'

export default function FilesPage() {
  const { apiKey, updateRateLimitInfo, isAuthenticated } = useAuth()
  const [files, setFiles] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(20)

  const loadFiles = async () => {
    if (!isAuthenticated) {
      setError('Please set an API key to view files')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { response, headers } = await apiClient.recentFiles(limit, apiKey!)
      setFiles(response.results)
      updateRateLimitInfo(headers)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Invalid API key. Please check your credentials.')
        } else if (err.status === 429) {
          setError('Rate limit exceeded. Please wait before trying again.')
        } else {
          setError(`Failed to load files: ${err.message}`)
        }
      } else {
        setError('An unexpected error occurred')
      }
      setFiles([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const handleRefresh = () => {
    loadFiles()
  }

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit)
    // Reload with new limit after state update
    setTimeout(() => loadFiles(), 0)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Recent Files</h1>
          <p className="text-gray-600 dark:text-gray-400">
            View recently indexed files across all repositories
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isLoading || !isAuthenticated}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {!isAuthenticated && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200">
            Please set your API key in the navigation bar to view files.
          </p>
        </div>
      )}

      {isAuthenticated && (
        <div className="flex items-center space-x-4">
          <label htmlFor="limit" className="text-sm font-medium">
            Show:
          </label>
          <select
            id="limit"
            value={limit}
            onChange={(e) => handleLimitChange(Number(e.target.value))}
            disabled={isLoading}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={10}>10 files</option>
            <option value={20}>20 files</option>
            <option value={50}>50 files</option>
            <option value={100}>100 files</option>
          </select>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading files...</p>
        </div>
      )}

      {!isLoading && isAuthenticated && (
        <FileList files={files} emptyMessage="No indexed files found" />
      )}
    </div>
  )
}
