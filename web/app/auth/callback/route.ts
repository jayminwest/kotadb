import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[OAuth] Failed to exchange code for session:', error)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    // Auto-generate API key on first login
    if (data.session && data.user) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
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
          console.error('[OAuth] API key generation failed:', await response.text())
          // Continue to dashboard even if key generation fails
          return NextResponse.redirect(`${origin}/dashboard?key_error=true`)
        }
      } catch (error) {
        console.error('[OAuth] API key generation error:', error)
        // Continue to dashboard even if key generation fails
        return NextResponse.redirect(`${origin}/dashboard?key_error=true`)
      }
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}/dashboard`)
}
