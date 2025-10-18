import type {
  IndexRequest,
  IndexResponse,
  SearchRequest,
  SearchResponse,
  RecentFilesResponse,
  HealthResponse,
} from '@shared/types/api'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface FetchOptions {
  apiKey?: string
  signal?: AbortSignal
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit & FetchOptions = {},
): Promise<{ data: T; headers: Headers }> {
  const { apiKey, ...fetchOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (fetchOptions.headers) {
    Object.assign(headers, fetchOptions.headers)
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  })

  if (!response.ok) {
    throw new ApiError(
      `API request failed: ${response.statusText}`,
      response.status,
      response.statusText,
    )
  }

  const data = await response.json()
  return { data, headers: response.headers }
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
}

export { ApiError }
export type { FetchOptions }
