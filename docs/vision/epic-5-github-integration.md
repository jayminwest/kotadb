# Epic 5: GitHub Integration

**Status**: Not Started
**Priority**: High (Enables auto-indexing)
**Estimated Duration**: 1 week

## Overview

Integrate GitHub App for repository access and webhooks. Enable auto-indexing on every push to tracked repositories.

## Issues

### Issue #15: Document GitHub App setup

**Priority**: P2 (Medium)
**Depends on**: None (documentation only)
**Blocks**: None (but needed for #16)

#### Description
Create comprehensive documentation for registering and configuring the KotaDB GitHub App.

#### Acceptance Criteria
- [ ] Step-by-step registration guide
- [ ] Required permissions list
- [ ] Webhook configuration instructions
- [ ] Environment variables documentation
- [ ] Development vs production app setup
- [ ] Screenshots for clarity

#### Required Permissions
- **Repository permissions:**
  - Contents: Read (clone repos)
  - Metadata: Read (repo info)
- **Account permissions:**
  - None
- **Events (webhooks):**
  - Push

#### Files to Create
- `docs/github-app-setup.md` - Complete setup guide

#### GitHub App Settings
```
Name: KotaDB (or KotaDB Dev for development)
Homepage URL: https://kotadb.io
Callback URL: https://app.kotadb.io/auth/github/callback
Webhook URL: https://api.kotadb.io/webhooks/github
Webhook secret: <generated, store in secrets>

Permissions:
  - Repository contents: Read-only
  - Repository metadata: Read-only

Subscribe to events:
  - Push

Installation:
  - Any account (for open-source) or Only this account (for private beta)
```

#### Environment Variables
```
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=<random secret>
```

---

### Issue #16: GitHub App token generation

**Priority**: P1 (High)
**Depends on**: #15 (needs app credentials), #2 (Supabase client)
**Blocks**: #14 (worker needs tokens to clone)

#### Description
Implement GitHub App installation token generation for accessing private repositories.

#### Acceptance Criteria
- [ ] Generate JWT for GitHub App authentication
- [ ] Fetch installation access tokens
- [ ] Cache tokens (expire after 55 min, refresh before expiry)
- [ ] Handle token generation failures gracefully
- [ ] Support multiple installations (different users/orgs)
- [ ] Store `installation_id` in `repositories` table

#### Technical Notes
- Use `@octokit/rest` for GitHub API
- Installation tokens valid for 1 hour
- Cache in memory (regenerate on worker startup)
- Private key from environment variable

#### Files to Create
- `src/github/app-auth.ts` - App authentication and token generation
- `src/github/client.ts` - Octokit client factory

#### Example Implementation
```typescript
import { App } from '@octokit/app'
import { Octokit } from '@octokit/rest'

const app = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
})

const tokenCache = new Map<number, { token: string; expiresAt: number }>()

export async function getInstallationToken(installationId: number): Promise<string> {
  const now = Date.now()
  const cached = tokenCache.get(installationId)

  // Return cached token if still valid (with 5 min buffer)
  if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
    return cached.token
  }

  // Generate new token
  const { token, expiresAt } = await app.octokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
  })

  tokenCache.set(installationId, {
    token,
    expiresAt: new Date(expiresAt).getTime(),
  })

  return token
}

export async function getOctokitForInstallation(installationId: number): Promise<Octokit> {
  const token = await getInstallationToken(installationId)
  return new Octokit({ auth: token })
}
```

---

### Issue #17: Webhook receiver with verification

**Priority**: P1 (High)
**Depends on**: #5 (auth middleware pattern), #15 (webhook secret)
**Blocks**: #18

#### Description
Implement webhook endpoint that receives GitHub events, verifies signatures, and logs requests.

#### Acceptance Criteria
- [ ] POST /webhooks/github endpoint
- [ ] Verify HMAC signature using webhook secret
- [ ] Return 401 for invalid signatures
- [ ] Parse push events
- [ ] Log all webhook requests (headers + payload)
- [ ] Return 200 for valid requests
- [ ] Handle other event types gracefully (ignore for now)

#### Technical Notes
- Signature in `X-Hub-Signature-256` header
- Verify with HMAC-SHA256 using webhook secret
- Event type in `X-GitHub-Event` header
- Only process `push` events initially

#### Files to Create
- `src/github/webhook-handler.ts` - Webhook verification and parsing
- `src/api/webhooks.ts` - Webhook endpoint

#### Example Implementation
```typescript
import crypto from 'crypto'

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export async function handleWebhook(request: Request): Promise<Response> {
  const signature = request.headers.get('x-hub-signature-256') ?? ''
  const event = request.headers.get('x-github-event') ?? ''
  const payload = await request.text()

  if (!verifyWebhookSignature(payload, signature, process.env.GITHUB_WEBHOOK_SECRET!)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  console.log(`Received GitHub webhook: ${event}`)

  if (event === 'push') {
    const body = JSON.parse(payload)
    const { repository, ref, after: commitSha } = body
    // Process in #18
  } else {
    console.log(`Ignoring event type: ${event}`)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
```

---

### Issue #18: Integrate webhooks with job queue

**Priority**: P1 (High)
**Depends on**: #17, #12 (queue), #13 (job tracking)
**Blocks**: Auto-indexing

#### Description
Connect webhook receiver to job queue. Queue indexing jobs when repos are pushed.

#### Acceptance Criteria
- [ ] Parse push event payload
- [ ] Lookup repository in database by `full_name`
- [ ] Only queue job if repo is tracked by a user
- [ ] Extract commit SHA and ref (branch)
- [ ] Queue indexing job via `createIndexJob()`
- [ ] Update repository `last_push_at` timestamp
- [ ] Handle edge cases: force pushes, deleted branches
- [ ] Log all queued jobs

#### Technical Notes
- Ignore pushes to untracked repositories (return 200, no action)
- Only index default branch or explicitly tracked branches
- Deduplicate: don't queue if job already pending for same commit

#### Files to Create
- `src/github/webhook-processor.ts` - Webhook to queue bridge

#### Example Implementation
```typescript
export async function processPushEvent(payload: any) {
  const { repository, ref, after: commitSha } = payload
  const fullName = repository.full_name // "owner/repo"
  const branch = ref.replace('refs/heads/', '')

  // Lookup repository
  const { data: repo, error } = await supabase
    .from('repositories')
    .select('*')
    .eq('full_name', fullName)
    .single()

  if (error || !repo) {
    console.log(`Ignoring push to untracked repo: ${fullName}`)
    return
  }

  // Only index default branch (for now)
  if (branch !== repo.default_branch) {
    console.log(`Ignoring push to non-default branch: ${branch}`)
    return
  }

  // Check for existing pending job
  const { data: existingJob } = await supabase
    .from('index_jobs')
    .select('id')
    .eq('repository_id', repo.id)
    .eq('commit_sha', commitSha)
    .eq('status', 'pending')
    .single()

  if (existingJob) {
    console.log(`Job already queued for ${fullName}@${commitSha}`)
    return
  }

  // Queue new indexing job
  const jobId = await createIndexJob(repo.id, commitSha)
  console.log(`Queued indexing job ${jobId} for ${fullName}@${commitSha}`)

  // Update last push timestamp
  await supabase
    .from('repositories')
    .update({ last_push_at: new Date().toISOString() })
    .eq('id', repo.id)
}
```

---

## Success Criteria

- [ ] GitHub App is registered and configured
- [ ] Installation tokens are generated successfully
- [ ] Webhooks are received and verified
- [ ] Push events trigger indexing jobs
- [ ] Only tracked repositories are indexed
- [ ] Duplicate jobs are prevented

## Dependencies for Other Epics

This epic enables:
- Automatic indexing on push (core workflow)
- Epic 4 worker can clone private repos
- Epic 6 REST API can manage repo tracking
