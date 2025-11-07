import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 2000, 4000] // 1s, 2s, 4s

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      process.stderr.write(`[OAuth] Failed to exchange code for session: ${error.message}\n`)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    // Auto-generate API key on first login with retry logic
    if (data.session && data.user) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      let lastError: string | null = null

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(`${apiUrl}/api/keys/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.session.access_token}`,
            },
          })

          if (response.ok) {
            const keyData = await response.json() as {
              apiKey?: string
              keyId: string
              message?: string
            }

            // Store API key in cookie for client-side access
            // Note: This is a temporary solution until we implement secure key storage
            const dashboardUrl = new URL(`${origin}/dashboard`)
            dashboardUrl.searchParams.set('key_generated', 'true')

            if (keyData.apiKey) {
              // New key generated - pass to dashboard via query param
              dashboardUrl.searchParams.set('api_key', keyData.apiKey)
            } else if (keyData.message?.includes('already exists')) {
              // Existing key - inform user
              dashboardUrl.searchParams.set('existing_key', 'true')
            }

            return NextResponse.redirect(dashboardUrl.toString())
          } else {
            const errorText = await response.text()
            lastError = errorText
            process.stderr.write(`[OAuth] API key generation failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${errorText}\n`)

            // Retry on failure
            if (attempt < MAX_RETRIES - 1) {
              const delay = RETRY_DELAYS[attempt]
              process.stderr.write(`[OAuth] Retrying after ${delay}ms...\n`)
              await sleep(delay)
              continue
            }

            // Final failure - continue to dashboard with error
            return NextResponse.redirect(`${origin}/dashboard?key_error=true`)
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
          process.stderr.write(`[OAuth] API key generation error (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError}\n`)

          // Retry on exception
          if (attempt < MAX_RETRIES - 1) {
            const delay = RETRY_DELAYS[attempt]
            process.stderr.write(`[OAuth] Retrying after ${delay}ms...\n`)
            await sleep(delay)
            continue
          }

          // Final failure - continue to dashboard with error
          return NextResponse.redirect(`${origin}/dashboard?key_error=true`)
        }
      }
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/dashboard`)
}
