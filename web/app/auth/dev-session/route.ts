import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Dev-Mode Session Endpoint for Agent Authentication Bypass
 *
 * SECURITY: This endpoint is ONLY available in non-production environments.
 * It will return 403 Forbidden if both NODE_ENV and VERCEL_ENV are set to 'production'.
 *
 * Purpose: Generate authenticated Supabase sessions on-demand for Playwright agents
 * and automated workflows that cannot complete GitHub OAuth in headless environments.
 *
 * Request Schema:
 * POST /auth/dev-session
 * {
 *   "email": "test@example.com",    // Required: email for test user
 *   "tier": "free"                   // Optional: subscription tier (default: "free")
 * }
 *
 * Response Schema:
 * {
 *   "userId": "uuid",
 *   "email": "test@example.com",
 *   "session": {
 *     "access_token": "eyJhbGci...",
 *     "refresh_token": "refresh-token",
 *     "expires_in": 3600,
 *     "expires_at": 1234567890
 *   },
 *   "apiKey": "kota_free_...",      // Optional: may be undefined if generation fails
 *   "message": "Session created successfully"
 * }
 *
 * Cookie Format (for Playwright injection):
 * Cookie name: sb-{project-ref}-auth-token
 * - Supabase Local: sb-localhost-auth-token
 * - Production: sb-abcdefghijklmnop-auth-token
 *
 * Example Usage:
 * ```bash
 * # Create dev session
 * curl -X POST http://localhost:3001/auth/dev-session \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"test@local.dev","tier":"free"}'
 *
 * # Health check
 * curl http://localhost:3001/auth/dev-session
 * ```
 */

// Request validation schema
const DevSessionRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  tier: z.enum(['free', 'solo', 'team']).default('free')
})

// Response type definition
interface DevSessionResponse {
  userId: string
  email: string
  session: {
    access_token: string
    refresh_token: string
    expires_in: number      // seconds
    expires_at: number      // unix timestamp
  }
  apiKey?: string          // Optional (may fail to generate)
  message: string
}

/**
 * Check if running in production environment
 * Requires BOTH NODE_ENV and VERCEL_ENV to be 'production' for maximum safety
 */
function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  )
}

/**
 * GET /auth/dev-session
 * Health check endpoint showing availability status
 */
export async function GET() {
  const isProd = isProductionEnvironment()

  return NextResponse.json({
    available: !isProd,
    environment: process.env.NODE_ENV || 'development',
    vercelEnv: process.env.VERCEL_ENV || 'not-set',
    message: isProd
      ? 'Dev session endpoint not available in production'
      : 'Dev session endpoint available'
  })
}

/**
 * POST /auth/dev-session
 * Create authenticated session for test account
 */
export async function POST(request: NextRequest) {
  // Environment guard - block production requests
  if (isProductionEnvironment()) {
    return NextResponse.json(
      { error: 'Dev session endpoint not available in production' },
      { status: 403 }
    )
  }

  try {
    // Parse and validate request body
    const body = await request.json()
    const { email, tier } = DevSessionRequestSchema.parse(body)

    // Create Supabase admin client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Step 1: Create test user (idempotent via email uniqueness)
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,  // Skip email confirmation
      user_metadata: {
        test_account: true,
        tier,
        created_via: 'dev-session-endpoint'
      }
    })

    // Handle duplicate user gracefully (user already exists)
    if (createError && !createError.message.includes('User already registered')) {
      process.stderr.write(`[dev-session] User creation failed: ${createError.message}\n`)
      return NextResponse.json(
        { error: 'Failed to create test user', details: createError.message },
        { status: 500 }
      )
    }

    // Step 2: Generate session tokens via magic link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email
    })

    if (linkError || !linkData) {
      process.stderr.write(`[dev-session] Session token generation failed: ${linkError?.message}\n`)
      return NextResponse.json(
        { error: 'Failed to generate session tokens', details: linkError?.message },
        { status: 500 }
      )
    }

    // Extract session tokens
    // Note: TypeScript types may not include all properties, but they exist at runtime
    const properties = linkData.properties as any
    const access_token = properties.access_token as string
    const refresh_token = properties.refresh_token as string
    const userId = linkData.user.id

    // Calculate expiration (default 1 hour for access token)
    const expires_in = 3600
    const expires_at = Math.floor(Date.now() / 1000) + expires_in

    // Step 3: Generate API key via backend endpoint (non-blocking)
    let apiKey: string | undefined

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const keyResponse = await fetch(`${apiUrl}/api/keys/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`
        }
      })

      if (keyResponse.ok) {
        const keyData = await keyResponse.json()
        apiKey = keyData.apiKey || keyData.message
        process.stdout.write(`[dev-session] API key generated successfully for ${email}\n`)
      } else {
        const errorText = await keyResponse.text()
        process.stderr.write(`[dev-session] API key generation failed (${keyResponse.status}): ${errorText}\n`)
      }
    } catch (error) {
      process.stderr.write(`[dev-session] API key generation error: ${error}\n`)
      // Continue without API key - partial response still useful
    }

    // Step 4: Return complete session data
    const response: DevSessionResponse = {
      userId,
      email,
      session: {
        access_token,
        refresh_token,
        expires_in,
        expires_at
      },
      apiKey,
      message: 'Session created successfully'
    }

    process.stdout.write(`[dev-session] Created session for ${email} (tier: ${tier})\n`)
    return NextResponse.json(response)

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400 }
      )
    }

    process.stderr.write(`[dev-session] Unexpected error: ${error}\n`)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
