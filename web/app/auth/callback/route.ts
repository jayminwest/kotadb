import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      process.stderr.write(`[OAuth] Failed to exchange code for session: ${error.message}\n`)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }
  }

  // Simple redirect - user will generate API key manually from dashboard
  return NextResponse.redirect(`${origin}/dashboard`)
}
