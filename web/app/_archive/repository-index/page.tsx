'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import { apiClient, ApiError } from '@/lib/api-client'
import { useAuth } from '@/context/AuthContext'
import type { JobStatusResponse } from '@shared/types/api'

export default function IndexPage() {
  const { apiKey, updateRateLimitInfo, isAuthenticated } = useAuth()
  const [repository, setRepository] = useState('')
  const [ref, setRef] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [jobDetails, setJobDetails] = useState<JobStatusResponse | null>(null)
  const [pollingActive, setPollingActive] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [pollingDelay, setPollingDelay] = useState(3000) // Start at 3s

  const pollJobStatus = async (jobId: string) => {
    try {
      const { response, headers } = await apiClient.getJobStatus(jobId, apiKey!)
      updateRateLimitInfo(headers)
      setJobDetails(response)

      // Stop polling if terminal state reached
      if (['completed', 'failed', 'skipped'].includes(response.status)) {
        setPollingActive(false)
        setPollingDelay(3000) // Reset for next job
        if (pollingIntervalRef.current) {
          clearTimeout(pollingIntervalRef.current as unknown as NodeJS.Timeout)
          pollingIntervalRef.current = null
        }
      }
    } catch (err) {
      // Don't crash UI on polling errors - just log them
      if (err instanceof Error) {
        process.stderr.write(`Polling error: ${err.message}\n`)
      }
    }
  }

  useEffect(() => {
    if (pollingActive && jobDetails?.id) {
      const timeout = setTimeout(() => {
        pollJobStatus(jobDetails.id)

        // Exponential backoff: multiply by 1.5, cap at 30s
        setPollingDelay((prevDelay) => Math.min(prevDelay * 1.5, 30000))
      }, pollingDelay)

      pollingIntervalRef.current = timeout as unknown as NodeJS.Timeout

      return () => {
        clearTimeout(timeout)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingActive, jobDetails?.id, pollingDelay])

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
      setSuccess(`Indexing job started successfully! Job ID: ${response.jobId}`)
      setRepository('')
      setRef('')

      // Start polling for job status
      setJobDetails({
        id: response.jobId,
        repository_id: '',
        status: response.status as JobStatusResponse['status'],
      })
      setPollingDelay(3000) // Reset delay for new job
      setPollingActive(true)
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

  function getStatusColorClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
      case 'processing':
        return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-200'
      case 'completed':
        return 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-200'
      case 'failed':
        return 'bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-200'
      case 'skipped':
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
      default:
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    }
  }

  function formatElapsedTime(startedAt: string): string {
    const elapsed = Date.now() - new Date(startedAt).getTime()
    const seconds = Math.floor(elapsed / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
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

      {jobDetails && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100">
              Indexing Progress
            </h3>
            <span
              className={`px-2 py-1 rounded text-sm font-medium ${getStatusColorClass(jobDetails.status)}`}
            >
              {jobDetails.status}
            </span>
          </div>

          {jobDetails.stats?.files_indexed !== undefined && (
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              Files indexed: {jobDetails.stats.files_indexed}
            </p>
          )}

          {jobDetails.started_at && (
            <p className="text-blue-700 dark:text-blue-300 text-sm mt-1">
              Elapsed: {formatElapsedTime(jobDetails.started_at)}
            </p>
          )}

          {jobDetails.status === 'completed' && (
            <p className="text-green-700 dark:text-green-300 text-sm mt-2 font-medium">
              ✓ Indexing completed successfully! You can now search this
              repository.
            </p>
          )}

          {jobDetails.status === 'failed' && jobDetails.error_message && (
            <p className="text-red-700 dark:text-red-300 text-sm mt-2">
              ✗ Error: {jobDetails.error_message}
            </p>
          )}

          {pollingActive && (
            <div className="flex items-center gap-2 mt-3 text-blue-600 dark:text-blue-400 text-sm">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Updating status...</span>
            </div>
          )}
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
