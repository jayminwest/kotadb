import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin

  const supabase = createClient()
  await supabase.auth.signOut()

  return NextResponse.redirect(`${origin}/`)
}
