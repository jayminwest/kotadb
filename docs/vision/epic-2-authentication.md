# Epic 2: Authentication Infrastructure

**Status**: Not Started
**Priority**: Critical (Blocks all API work)
**Estimated Duration**: 1 week

## Overview

Implement API key generation, validation, and tier-based rate limiting. This authentication system protects both REST and MCP endpoints.

## Issues

### Issue #4: API key generation and storage system

**Priority**: P0 (Critical)
**Depends on**: #1 (needs `api_keys` table), #2 (Supabase client)
**Blocks**: #5, #6

#### Description
Build API key generation, hashing, and validation system with support for three tiers (free, solo, team).

#### Acceptance Criteria
- [ ] Generate keys with format `kota_<env>_<keyId>.<secret>`
- [ ] Persist `key_id` separately from the hashed secret (`secret_hash`)
- [ ] Hash secret portion with bcrypt before storage
- [ ] Store tier information (free/solo/team)
- [ ] Associate keys with `user_id` and optional `org_id`
- [ ] Set rate limits based on tier
- [ ] Validate keys via single-row lookup on `key_id`
- [ ] Track `last_used_at` timestamp
- [ ] Support key revocation (set `enabled = false`)

#### Technical Notes
- Use `bcryptjs` for hashing (rounds: 10)
- Generate `keyId` as a collision-resistant slug (e.g., 12 base32 chars)
- Secret segment: `crypto.randomBytes(18).toString('hex')`
- Store `key_id` and `secret_hash`; never persist full keys after creation
- Rate limits: free=100/hr, solo=1000/hr, team=10000/hr

#### Files to Create
- `src/auth/keys.ts` - Key generation and validation
- `src/auth/types.ts` - Tier types and interfaces

#### Example Implementation
```typescript
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { supabase } from '@db/client'

export type Tier = 'free' | 'solo' | 'team'

const RATE_LIMITS: Record<Tier, number> = {
  free: 100,
  solo: 1000,
  team: 10000,
}

export async function generateApiKey(
  userId: string,
  tier: Tier,
  orgId?: string
): Promise<{ key: string; id: string }> {
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev'
  const keyId = crypto.randomBytes(9).toString('base64url') // ~12 chars
  const secret = crypto.randomBytes(18).toString('base64url')
  const key = `kota_${env}_${keyId}.${secret}`
  const secretHash = await bcrypt.hash(secret, 10)

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      key_id: keyId,
      secret_hash: secretHash,
      tier,
      org_id: orgId,
      rate_limit_per_hour: RATE_LIMITS[tier],
    })
    .select()
    .single()

  if (error || !data) throw error

  return { key, id: data.id } // Return plain key only once
}

export async function validateApiKey(key: string): Promise<{
  userId: string
  tier: Tier
  orgId?: string
  keyId: string
  rateLimitPerHour: number
} | null> {
  if (!key?.startsWith('kota_') || !key.includes('.')) {
    return null
  }

  const [prefix, secret] = key.split('.')
  const keyId = prefix.split('_').at(-1)

  if (!keyId || !secret) {
    return null
  }

  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_id', keyId)
    .eq('enabled', true)
    .single()

  if (error || !data) {
    return null
  }

  const match = await bcrypt.compare(secret, data.secret_hash)
  if (!match) {
    return null
  }

  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    userId: data.user_id,
    tier: data.tier,
    orgId: data.org_id ?? undefined,
    keyId: data.key_id,
    rateLimitPerHour: data.rate_limit_per_hour,
  }
}
```

---

### Issue #5: Authentication middleware

**Priority**: P0 (Critical)
**Depends on**: #4
**Blocks**: All REST and MCP endpoints

#### Description
Create authentication middleware that validates API keys, extracts user context, and enforces RLS via Supabase client configuration.

#### Acceptance Criteria
- [ ] Extract API key from `Authorization: Bearer <key>` header
- [ ] Validate key using `validateApiKey()`
- [ ] Inject user context into request object
- [ ] Configure Supabase client with RLS for user
- [ ] Return 401 for missing/invalid keys
- [ ] Return 403 for disabled keys
- [ ] Log authentication attempts (success/failure)

#### Technical Notes
- Middleware runs before all protected routes
- Produce an `AuthContext` object (`userId`, `tier`, `orgId`, `keyId`, `rateLimitPerHour`)
- Use Supabase `auth.setSession()` or row level security helpers to impersonate the user
- Cache validation results briefly (5 sec) to reduce database load

#### Files to Create
- `src/auth/middleware.ts` - Authentication middleware
- `src/auth/context.ts` - User context types

#### Example Implementation
```typescript
export interface AuthContext {
  userId: string
  tier: Tier
  orgId?: string
  keyId: string
  rateLimitPerHour: number
}

export async function authenticateRequest(
  request: Request
): Promise<{ context?: AuthContext; response?: Response }> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      response: new Response(JSON.stringify({ error: 'Missing API key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    }
  }

  const key = authHeader.slice(7)
  const result = await validateApiKey(key)

  if (!result) {
    return {
      response: new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    }
  }

  const context: AuthContext = {
    userId: result.userId,
    tier: result.tier,
    orgId: result.orgId,
    keyId: result.keyId,
    rateLimitPerHour: result.rateLimitPerHour,
  }

  // Configure Supabase RLS for this user (auth token or impersonation)

  return { context }
}

// Usage inside fetch handler
export async function handleProtectedRoute(request: Request): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (auth.response) {
    return auth.response
  }

  const { context } = auth
  // Route logic here, context is guaranteed
  return new Response(JSON.stringify({ userId: context!.userId }))
}
```

---

### Issue #6: Rate limiting middleware

**Priority**: P1 (High)
**Depends on**: #5
**Blocks**: Production deployment

#### Description
Implement tier-based rate limiting to prevent abuse and enforce plan limits.

#### Acceptance Criteria
- [ ] Track requests per user per hour using the `rate_limit_counters` table
- [ ] Enforce tier-specific limits (free=100, solo=1000, team=10000)
- [ ] Return 429 with `Retry-After` header when limit exceeded
- [ ] Reset counters every hour via atomic updates
- [ ] Handle concurrent requests safely (row-level locking or `ON CONFLICT` semantics)
- [ ] Exclude health check endpoint from rate limiting

#### Technical Notes
- Store counters in Postgres (`rate_limit_counters`) addressed by `key_id`
- Use `ON CONFLICT` upsert (or Supabase RPC) to increment counters atomically
- Reset window by comparing `window_start` with current hour; when expired, write a fresh row with `request_count = 1`
- Include current usage in response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`

#### Files to Create
- `src/auth/rate-limit.ts` - Rate limiting middleware

#### Example Implementation
```typescript
import { supabase } from '@db/client'

const ONE_HOUR_MS = 60 * 60 * 1000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number
}

export async function enforceRateLimit(
  keyId: string,
  rateLimitPerHour: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / ONE_HOUR_MS) * ONE_HOUR_MS).toISOString()

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    key_id: keyId,
    window_start: windowStart,
  })

  if (error) {
    throw error
  }

  const { request_count: requestCount, reset_at: resetAt } = data as {
    request_count: number
    reset_at: string
  }

  const remaining = Math.max(0, rateLimitPerHour - requestCount)
  const allowed = requestCount <= rateLimitPerHour
  const retryAfter = allowed
    ? undefined
    : Math.ceil((new Date(resetAt).getTime() - now) / 1000)

  return { allowed, remaining, retryAfter }
}

export async function withRateLimiting(
  context: { keyId: string; rateLimitPerHour: number },
  handler: () => Promise<Response>
): Promise<Response> {
  const result = await enforceRateLimit(context.keyId, context.rateLimitPerHour)

  const headers = new Headers({
    'X-RateLimit-Limit': context.rateLimitPerHour.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
  })

  if (!result.allowed) {
    if (result.retryAfter !== undefined) {
      headers.set('Retry-After', result.retryAfter.toString())
    }

    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers,
    })
  }

  const response = await handler()
  const finalResponse = new Response(response.body, response)
  headers.forEach((value, key) => finalResponse.headers.set(key, value))
  return finalResponse
}
```

---

## Success Criteria

- [ ] API keys can be generated and stored securely
- [ ] Keys validate correctly with bcrypt comparison
- [ ] Authentication middleware protects all endpoints
- [ ] Rate limiting enforces tier-specific limits
- [ ] 401/403/429 responses are clear and actionable
- [ ] User context is available in all authenticated requests

## Dependencies for Other Epics

This epic must be completed before:
- Epic 6 (REST API needs auth)
- Epic 7 (MCP API needs auth)
- Any endpoint that requires user context
