'use client'

import { useState } from 'react'
import { apiClient, ApiError } from '@/lib/api-client'
import { useAuth } from '@/context/AuthContext'
import SearchBar from '../components/SearchBar'
import FileList from '../components/FileList'
import type { SearchResult } from '@shared/types/api'

export default function SearchPage() {
  const { apiKey, updateRateLimitInfo, isAuthenticated } = useAuth()
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async (term: string) => {
    if (!isAuthenticated) {
      setError('Please set an API key to search')
      return
    }

    setIsLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      const { response, headers } = await apiClient.search({ term }, apiKey!)
      setResults(response.results)
      updateRateLimitInfo(headers)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Invalid API key. Please check your credentials.')
        } else if (err.status === 429) {
          setError('Rate limit exceeded. Please wait before trying again.')
        } else {
          setError(`Search failed: ${err.message}`)
        }
      } else {
        setError('An unexpected error occurred')
      }
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Search Code</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Search across indexed repositories for code, functions, and patterns
        </p>
      </div>

      {!isAuthenticated && (
        <div className="glass-light dark:glass-dark bg-yellow-50/50 dark:bg-yellow-900/20 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200">
            Please set your API key in the navigation bar to search code.
          </p>
        </div>
      )}

      <SearchBar onSearch={handleSearch} isLoading={isLoading} />

      {error && (
        <div className="glass-light dark:glass-dark bg-red-50/50 dark:bg-red-900/20 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Searching...</p>
        </div>
      )}

      {!isLoading && hasSearched && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {results.length} {results.length === 1 ? 'result' : 'results'} found
            </h2>
          </div>

          <FileList files={results} emptyMessage="No files match your search query" />
        </div>
      )}
    </div>
  )
}
