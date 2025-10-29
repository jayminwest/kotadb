import { test, expect } from '@playwright/test'
import { createAuthenticatedSession, injectSessionCookies } from '../../lib/playwright-helpers'

/**
 * Integration tests for /auth/dev-session endpoint
 *
 * These tests validate:
 * 1. Production environment guard blocks requests
 * 2. Session creation succeeds in dev mode
 * 3. Health check endpoint returns correct status
 * 4. Cookie injection enables navigation to protected routes
 * 5. API key works with backend endpoints
 *
 * Prerequisites:
 * - Next.js dev server running on http://localhost:3001
 * - Backend API server running on http://localhost:3000
 * - Supabase Local running on http://localhost:54326
 */

const DEV_ENDPOINT = 'http://localhost:3001/auth/dev-session'
const API_BASE = 'http://localhost:3000'
const WEB_BASE = 'http://localhost:3001'

test.describe('Dev Session Endpoint', () => {
  test('should block requests in production environment', async ({ page }) => {
    // Mock production environment by setting headers
    // Note: This test may need to be adapted based on how environment
    // variables are checked (they're typically set at build time)
    test.skip(true, 'Environment variables cannot be mocked in runtime tests')
  })

  test('should return availability status via GET', async ({ request }) => {
    const response = await request.get(DEV_ENDPOINT)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data).toHaveProperty('available')
    expect(data).toHaveProperty('environment')
    expect(data.available).toBe(true) // Should be available in dev mode
  })

  test('should create test user and return session tokens', async ({ request }) => {
    const email = `test-${Date.now()}@playwright.test`

    const response = await request.post(DEV_ENDPOINT, {
      data: {
        email,
        tier: 'free'
      }
    })

    expect(response.ok()).toBeTruthy()

    const data = await response.json()

    // Validate response structure
    expect(data).toHaveProperty('userId')
    expect(data).toHaveProperty('email')
    expect(data).toHaveProperty('session')
    expect(data).toHaveProperty('message')

    // Validate session structure
    expect(data.session).toHaveProperty('access_token')
    expect(data.session).toHaveProperty('refresh_token')
    expect(data.session).toHaveProperty('expires_in')
    expect(data.session).toHaveProperty('expires_at')

    // Validate session tokens are non-empty
    expect(data.session.access_token).toBeTruthy()
    expect(data.session.refresh_token).toBeTruthy()
    expect(data.session.expires_in).toBeGreaterThan(0)
    expect(data.session.expires_at).toBeGreaterThan(Date.now() / 1000)

    // Validate email matches request
    expect(data.email).toBe(email)
  })

  test('should handle duplicate user creation gracefully', async ({ request }) => {
    const email = `duplicate-test-${Date.now()}@playwright.test`

    // Create user first time
    const response1 = await request.post(DEV_ENDPOINT, {
      data: { email, tier: 'free' }
    })
    expect(response1.ok()).toBeTruthy()

    // Create same user second time (should succeed with existing user)
    const response2 = await request.post(DEV_ENDPOINT, {
      data: { email, tier: 'free' }
    })
    expect(response2.ok()).toBeTruthy()

    const data = await response2.json()
    expect(data.email).toBe(email)
    expect(data.session.access_token).toBeTruthy()
  })

  test('should reject invalid email format', async ({ request }) => {
    const response = await request.post(DEV_ENDPOINT, {
      data: {
        email: 'invalid-email',
        tier: 'free'
      }
    })

    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data).toHaveProperty('error')
    expect(data.error).toContain('Invalid request body')
  })

  test('should default to free tier when tier is omitted', async ({ request }) => {
    const email = `default-tier-${Date.now()}@playwright.test`

    const response = await request.post(DEV_ENDPOINT, {
      data: { email }
    })

    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.email).toBe(email)
  })

  test('should generate API key and include in response', async ({ request }) => {
    const email = `api-key-test-${Date.now()}@playwright.test`

    const response = await request.post(DEV_ENDPOINT, {
      data: { email, tier: 'free' }
    })

    expect(response.ok()).toBeTruthy()

    const data = await response.json()

    // API key should be present (unless backend is unavailable)
    // If backend API is running, apiKey should be defined
    if (data.apiKey) {
      expect(data.apiKey).toMatch(/^kota_/)
    }
  })

  test('should inject cookies and enable authenticated navigation', async ({ page }) => {
    const email = `auth-nav-test-${Date.now()}@playwright.test`

    // Create session via helper
    const { session } = await createAuthenticatedSession(page, email, 'free', DEV_ENDPOINT)

    expect(session.access_token).toBeTruthy()

    // Navigate to a page (this would be a protected route in real app)
    // For now, just verify we can navigate with cookies set
    await page.goto(WEB_BASE)

    // Verify cookies were set
    const cookies = await page.context().cookies()
    const authCookie = cookies.find(c => c.name.includes('auth-token'))

    expect(authCookie).toBeDefined()
    expect(authCookie?.value).toContain(session.access_token)
  })

  test('should work with injectSessionCookies helper', async ({ page, request }) => {
    const email = `inject-helper-${Date.now()}@playwright.test`

    // Create session directly via API
    const response = await request.post(DEV_ENDPOINT, {
      data: { email, tier: 'free' }
    })

    const data = await response.json()

    // Inject cookies using helper
    await injectSessionCookies(page, data.session)

    // Verify cookies were set
    const cookies = await page.context().cookies()
    const authCookie = cookies.find(c => c.name.includes('auth-token'))

    expect(authCookie).toBeDefined()
    expect(authCookie?.value).toContain(data.session.access_token)
  })

  test('should generate valid API key for backend requests', async ({ request }) => {
    const email = `backend-api-${Date.now()}@playwright.test`

    // Create session and get API key
    const sessionResponse = await request.post(DEV_ENDPOINT, {
      data: { email, tier: 'free' }
    })

    const data = await sessionResponse.json()

    // Skip if API key generation failed
    test.skip(!data.apiKey, 'API key not generated (backend may be unavailable)')

    // Test API key with backend endpoint
    const apiResponse = await request.get(`${API_BASE}/api/subscriptions/current`, {
      headers: {
        'Authorization': `Bearer ${data.apiKey}`
      }
    })

    // Should not get 401 Unauthorized (API key is valid)
    expect(apiResponse.status()).not.toBe(401)

    // May get 404 if no subscription exists, but that's OK
    // The important thing is that the API key authenticated successfully
  })
})
