import type {
  IndexRequest,
  IndexResponse,
  SearchRequest,
  SearchResponse,
  RecentFilesResponse,
  HealthResponse,
  JobStatusResponse,
} from '@shared/types/api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public errorBody?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface FetchOptions {
  apiKey?: string
  signal?: AbortSignal
  timeout?: number
  skipRetry?: boolean
}

const DEFAULT_TIMEOUT = 30000 // 30 seconds
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000] // 1s, 2s, 4s

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit & FetchOptions = {},
): Promise<{ data: T; headers: Headers }> {
  const { apiKey, timeout = DEFAULT_TIMEOUT, skipRetry = false, ...fetchOptions } = options

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }

  // Only add Content-Type for non-GET requests
  if (fetchOptions.method && fetchOptions.method !== 'GET') {
    headers['Content-Type'] = 'application/json'
  }

  if (fetchOptions.headers) {
    Object.assign(headers, fetchOptions.headers)
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const url = `${API_BASE_URL}${endpoint}`

  // Dev-mode logging
  if (process.env.NODE_ENV === 'development') {
    process.stdout.write(
      `[API] ${fetchOptions.method || 'GET'} ${endpoint}\n`
    )
  }

  let lastError: Error | null = null
  const maxAttempts = skipRetry ? 1 : MAX_RETRIES

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Dev-mode logging
      if (process.env.NODE_ENV === 'development') {
        process.stdout.write(
          `[API] ${response.status} ${endpoint}\n`
        )
      }

      if (!response.ok) {
        let errorBody: unknown = null
        let errorMessage = response.statusText

        // Try to parse error response body
        try {
          errorBody = await response.json()
          if (errorBody && typeof errorBody === 'object' && 'error' in errorBody) {
            errorMessage = String(errorBody.error)
          }
        } catch {
          // Fallback to statusText if JSON parsing fails
          errorMessage = response.statusText || 'Request failed'
        }

        const apiError = new ApiError(
          errorMessage,
          response.status,
          response.statusText,
          errorBody,
        )

        // Retry only on 5xx errors (not 4xx client errors)
        if (response.status >= 500 && response.status < 600 && attempt < maxAttempts - 1) {
          lastError = apiError
          const delay = RETRY_DELAYS[attempt]
          if (process.env.NODE_ENV === 'development') {
            process.stderr.write(
              `[API] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms (${response.status} ${endpoint})\n`
            )
          }
          await sleep(delay)
          continue
        }

        throw apiError
      }

      const data = await response.json()
      return { data, headers: response.headers }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }

      // Handle timeout and network errors
      lastError = error instanceof Error ? error : new Error('Unknown error')

      if (attempt < maxAttempts - 1) {
        const delay = RETRY_DELAYS[attempt]
        if (process.env.NODE_ENV === 'development') {
          process.stderr.write(
            `[API] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms (network error on ${endpoint})\n`
          )
        }
        await sleep(delay)
        continue
      }

      throw new ApiError(
        lastError.message || 'Network request failed',
        0,
        'Network Error',
      )
    }
  }

  // Should never reach here, but TypeScript requires it
  throw lastError || new Error('Request failed')
}

export const apiClient = {
  /**
   * Check API health status
   */
  async health(): Promise<HealthResponse> {
    const { data } = await fetchApi<HealthResponse>('/health')
    return data
  },

  /**
   * Search indexed code
   */
  async search(
    request: SearchRequest,
    apiKey?: string,
  ): Promise<{ response: SearchResponse; headers: Headers }> {
    const queryParams = new URLSearchParams()
    queryParams.set('term', request.term)

    if (request.repository) {
      queryParams.set('repository', request.repository)
    }

    if (request.limit) {
      queryParams.set('limit', request.limit.toString())
    }

    const { data, headers } = await fetchApi<SearchResponse>(
      `/search?${queryParams.toString()}`,
      { apiKey },
    )

    return { response: data, headers }
  },

  /**
   * Index a repository
   */
  async index(
    request: IndexRequest,
    apiKey?: string,
  ): Promise<{ response: IndexResponse; headers: Headers }> {
    const { data, headers } = await fetchApi<IndexResponse>('/index', {
      method: 'POST',
      body: JSON.stringify(request),
      apiKey,
    })

    return { response: data, headers }
  },

  /**
   * Get recently indexed files
   */
  async recentFiles(
    limit: number = 20,
    apiKey?: string,
  ): Promise<{ response: RecentFilesResponse; headers: Headers }> {
    const { data, headers } = await fetchApi<RecentFilesResponse>(
      `/files/recent?limit=${limit}`,
      { apiKey },
    )

    return { response: data, headers }
  },

  /**
   * Get index job status by job ID
   */
  async getJobStatus(
    jobId: string,
    apiKey?: string,
  ): Promise<{ response: JobStatusResponse; headers: Headers }> {
    const { data, headers } = await fetchApi<JobStatusResponse>(
      `/jobs/${jobId}`,
      { apiKey },
    )

    return { response: data, headers }
  },
}

export { ApiError }
export type { FetchOptions }
