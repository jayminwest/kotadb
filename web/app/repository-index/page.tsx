'use client'

import { useState, FormEvent } from 'react'
import { apiClient, ApiError } from '@/lib/api-client'
import { useAuth } from '@/context/AuthContext'

export default function IndexPage() {
  const { apiKey, updateRateLimitInfo, isAuthenticated } = useAuth()
  const [repository, setRepository] = useState('')
  const [ref, setRef] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!isAuthenticated) {
      setError('Please set an API key to index repositories')
      return
    }

    if (!repository.trim()) {
      setError('Repository is required')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { response, headers } = await apiClient.index(
        {
          repository: repository.trim(),
          ref: ref.trim() || undefined,
        },
        apiKey!,
      )

      updateRateLimitInfo(headers)
<<<<<<< HEAD
      setSuccess(`Indexing job started successfully! Job ID: ${response.jobId}`)
=======
      setSuccess(`Indexing job started successfully! Run ID: ${response.runId}`)
>>>>>>> origin/main
      setRepository('')
      setRef('')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Invalid API key. Please check your credentials.')
        } else if (err.status === 429) {
          setError('Rate limit exceeded. Please wait before trying again.')
        } else {
          setError(`Indexing failed: ${err.message}`)
        }
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Index Repository</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Index a GitHub repository to make it searchable
        </p>
      </div>

      {!isAuthenticated && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200">
            Please set your API key in the navigation bar to index repositories.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="repository" className="block text-sm font-medium mb-2">
            Repository <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="repository"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="owner/repo (e.g., facebook/react)"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Format: owner/repository (e.g., facebook/react, vercel/next.js)
          </p>
        </div>

        <div>
          <label htmlFor="ref" className="block text-sm font-medium mb-2">
            Branch / Tag / Commit (optional)
          </label>
          <input
            type="text"
            id="ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="main (defaults to repository default branch)"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Leave empty to use the default branch (main/master)
          </p>
        </div>

        <button
          type="submit"
          disabled={!repository.trim() || isLoading || !isAuthenticated}
          className="w-full px-6 py-3 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isLoading ? 'Starting indexing...' : 'Start Indexing'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-800 dark:text-green-200">{success}</p>
          <p className="text-green-700 dark:text-green-300 text-sm mt-2">
            The repository is being indexed in the background. You can search for files once indexing completes.
          </p>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Indexing Notes</h3>
        <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200 text-sm">
          <li>Public repositories are cloned from GitHub automatically</li>
          <li>Only TypeScript, JavaScript, and JSON files are indexed</li>
          <li>Indexing runs asynchronously and may take several minutes</li>
          <li>Dependencies and imports are extracted for code intelligence</li>
        </ul>
      </div>
    </div>
  )
}
