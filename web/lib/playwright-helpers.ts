import type { Page, BrowserContext } from '@playwright/test'

/**
 * Playwright Helper Utilities for Dev Session Authentication
 *
 * These utilities enable automated cookie injection for Playwright tests,
 * allowing agents to authenticate without completing GitHub OAuth flow.
 */

/**
 * Session data structure returned from /auth/dev-session endpoint
 */
export interface DevSession {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
}

/**
 * Cookie structure for Playwright
 */
interface PlaywrightCookie {
  name: string
  value: string
  domain: string
  path: string
  expires?: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

/**
 * Generate Playwright-compatible cookies for Supabase SSR authentication
 *
 * Cookie name pattern: sb-{project-ref}-auth-token
 * - Supabase Local: sb-localhost-auth-token
 * - Production: sb-{16-char-project-ref}-auth-token
 *
 * @param session - Session data from /auth/dev-session endpoint
 * @param projectRef - Supabase project reference (default: 'localhost' for local dev)
 * @param domain - Cookie domain (default: 'localhost')
 * @param secure - Use secure flag (default: false for local dev)
 * @returns Array of Playwright cookie objects
 */
export function generatePlaywrightCookies(
  session: DevSession,
  projectRef: string = 'localhost',
  domain: string = 'localhost',
  secure: boolean = false
): PlaywrightCookie[] {
  const cookieName = `sb-${projectRef}-auth-token`

  // Supabase SSR cookie value format (JSON string)
  const cookieValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: 'bearer'
  })

  return [
    {
      name: cookieName,
      value: cookieValue,
      domain,
      path: '/',
      expires: session.expires_at,
      httpOnly: false,  // Required for SSR client access
      secure,
      sameSite: 'Lax'
    }
  ]
}

/**
 * Inject session cookies into Playwright page context
 *
 * This helper automatically detects the Supabase project ref from environment
 * variables and injects the appropriate cookies for authentication.
 *
 * @param page - Playwright page object
 * @param session - Session data from /auth/dev-session endpoint
 * @param options - Optional configuration for cookie generation
 * @returns Promise that resolves when cookies are injected
 *
 * @example
 * ```typescript
 * // Fetch session from dev endpoint
 * const response = await fetch('http://localhost:3001/auth/dev-session', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ email: 'test@example.com' })
 * })
 * const { session } = await response.json()
 *
 * // Inject cookies into Playwright context
 * await injectSessionCookies(page, session)
 *
 * // Navigate to protected route
 * await page.goto('http://localhost:3001/dashboard')
 * ```
 */
export async function injectSessionCookies(
  page: Page,
  session: DevSession,
  options?: {
    projectRef?: string
    domain?: string
    secure?: boolean
  }
): Promise<void> {
  const projectRef = options?.projectRef ||
    extractProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    'localhost'

  const domain = options?.domain || 'localhost'
  const secure = options?.secure || false

  const cookies = generatePlaywrightCookies(session, projectRef, domain, secure)

  await page.context().addCookies(cookies)
}

/**
 * Inject session cookies into Playwright browser context
 *
 * Alternative to injectSessionCookies that operates at the context level
 * instead of page level. Useful for setting cookies before navigating.
 *
 * @param context - Playwright browser context
 * @param session - Session data from /auth/dev-session endpoint
 * @param options - Optional configuration for cookie generation
 * @returns Promise that resolves when cookies are injected
 */
export async function injectSessionCookiesIntoContext(
  context: BrowserContext,
  session: DevSession,
  options?: {
    projectRef?: string
    domain?: string
    secure?: boolean
  }
): Promise<void> {
  const projectRef = options?.projectRef ||
    extractProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    'localhost'

  const domain = options?.domain || 'localhost'
  const secure = options?.secure || false

  const cookies = generatePlaywrightCookies(session, projectRef, domain, secure)

  await context.addCookies(cookies)
}

/**
 * Extract Supabase project reference from Supabase URL
 *
 * Examples:
 * - http://localhost:54326 → 'localhost'
 * - https://abcdefghijklmnop.supabase.co → 'abcdefghijklmnop'
 *
 * @param supabaseUrl - Supabase URL from environment variable
 * @returns Project reference string or null if extraction fails
 */
function extractProjectRefFromUrl(supabaseUrl?: string): string | null {
  if (!supabaseUrl) return null

  try {
    const url = new URL(supabaseUrl)

    // Local development (localhost or 127.0.0.1)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return 'localhost'
    }

    // Production Supabase URL pattern: https://{project-ref}.supabase.co
    const supabasePattern = /^([a-z0-9]+)\.supabase\.co$/
    const match = url.hostname.match(supabasePattern)

    if (match) {
      return match[1]
    }

    return null
  } catch {
    return null
  }
}

/**
 * Create authenticated session via dev endpoint and inject into Playwright
 *
 * Convenience function that combines session creation and cookie injection
 * into a single call. This is the recommended way to set up authenticated
 * Playwright tests.
 *
 * @param page - Playwright page object
 * @param email - Email for test user
 * @param tier - Subscription tier (default: 'free')
 * @param devEndpointUrl - URL of dev-session endpoint (default: http://localhost:3001)
 * @returns Promise resolving to session data including API key
 *
 * @example
 * ```typescript
 * // Create session and inject cookies in one call
 * const { session, apiKey } = await createAuthenticatedSession(
 *   page,
 *   'test@example.com',
 *   'free'
 * )
 *
 * // Navigate to protected route (already authenticated)
 * await page.goto('http://localhost:3001/dashboard')
 *
 * // Use API key for backend requests
 * const response = await fetch('http://localhost:3000/api/subscriptions/current', {
 *   headers: { 'Authorization': `Bearer ${apiKey}` }
 * })
 * ```
 */
export async function createAuthenticatedSession(
  page: Page,
  email: string,
  tier: 'free' | 'solo' | 'team' = 'free',
  devEndpointUrl: string = 'http://localhost:3001/auth/dev-session'
): Promise<{
  userId: string
  email: string
  session: DevSession
  apiKey?: string
  message: string
}> {
  // Call dev-session endpoint
  const response = await fetch(devEndpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, tier })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create dev session: ${response.status} ${errorText}`)
  }

  const data = await response.json()

  // Inject session cookies into page context
  await injectSessionCookies(page, data.session)

  return data
}
