# Feature Plan: GitHub Webhook Receiver with HMAC Signature Verification

## Metadata
- **Issue**: #260
- **Title**: feat: implement webhook receiver with HMAC signature verification
- **Status**: In Progress
- **Priority**: High (MVP Blocker)
- **Effort**: Medium (1-3 days)
- **Component**: Backend/API

## Issue Relationships
- **Child Of**: #257 (Epic 5 - GitHub App Integration)
- **Depends On**:
  - #5 (Authentication middleware pattern) - closed, provides middleware architecture
  - #258 (Document GitHub App setup) - provides webhook secret configuration
- **Blocks**: #261 (Integrate webhooks with job queue)
- **Related To**: #259 (GitHub App token generation)

## Overview

### Problem
KotaDB currently requires manual repository indexing via POST /index API calls. To enable automated code intelligence workflows, the system needs to respond to repository push events from GitHub automatically. Without webhook integration, users must manually trigger re-indexing after every code change, creating friction and reducing the value of continuous code intelligence.

### Desired Outcome
Implement a secure webhook endpoint that receives GitHub push events, verifies HMAC-SHA256 signatures to ensure request authenticity, and logs incoming requests for debugging. This provides the foundation for automated repository indexing triggered by push events, enabling zero-friction code intelligence updates.

### Non-Goals
- Job queue integration (handled in #261)
- Processing other event types beyond logging (installation, pull_request, etc.)
- Rate limiting webhook endpoint (deferred to production hardening)
- Webhook retry logic (GitHub handles retries)
- Webhook event filtering by branch or commit author (deferred)

## Technical Approach

### Architecture Notes
- Follow existing Express middleware pattern established in `app/src/api/routes.ts`
- Webhook endpoint is **unauthenticated** (no API key required) - signature verification provides security
- Signature verification uses timing-safe comparison to prevent timing attacks
- Raw request body required for signature verification (must compute HMAC before JSON parsing)
- Event type routing via `X-GitHub-Event` header for future extensibility
- Structured logging for webhook debugging and audit trail

### Key Modules to Touch
- `app/src/api/routes.ts` - Register webhook route (no auth middleware)
- New module: `app/src/github/webhook-handler.ts` - Signature verification and event parsing
- New types: `app/src/github/types.ts` - Add webhook payload types

### Data/API Impacts
- **New endpoint**: `POST /webhooks/github` (public, signature-verified)
- **New environment variable**: `GITHUB_WEBHOOK_SECRET` (required for production)
- **Response codes**:
  - 200 OK - Valid signature, event processed
  - 400 Bad Request - Malformed payload
  - 401 Unauthorized - Invalid or missing signature
  - 500 Internal Server Error - Server-side error
- **Headers required**:
  - `X-Hub-Signature-256` - HMAC-SHA256 signature (required)
  - `X-GitHub-Event` - Event type (required)
  - `X-GitHub-Delivery` - Unique delivery ID (optional, for logging)

### Security Model
- **Signature Verification**: Compute HMAC-SHA256 of raw request body using webhook secret, compare with `X-Hub-Signature-256` header
- **Timing-Safe Comparison**: Use `crypto.timingSafeEqual()` to prevent timing attacks that could leak signature information
- **Raw Body Handling**: Preserve raw request body for signature verification before Express JSON parsing
- **Secret Storage**: Load `GITHUB_WEBHOOK_SECRET` from environment, never log or expose
- **Audit Logging**: Log all webhook requests (event type, delivery ID, repository) for security monitoring

## Relevant Files

### Existing Files
- `app/src/api/routes.ts` - Express route registration, understand middleware pattern
- `app/src/auth/middleware.ts` - Reference for error response patterns (401/403 format)
- `app/src/github/app-auth.ts` - Existing GitHub module structure
- `app/src/github/types.ts` - Add webhook payload types
- `docs/github-app-setup.md` - Webhook configuration documentation

### New Files
- `app/src/github/webhook-handler.ts` - Core webhook verification and event parsing logic
  - `verifyWebhookSignature()` - HMAC-SHA256 verification with timing-safe comparison
  - `parseWebhookPayload()` - Type-safe payload parsing with error handling
  - `logWebhookRequest()` - Structured logging for debugging

- `app/tests/github/webhook-handler.test.ts` - Unit tests for signature verification
  - Valid signature verification
  - Invalid signature rejection
  - Timing-safe comparison behavior
  - Missing signature handling
  - Malformed signature format handling

- `app/tests/api/webhooks.test.ts` - Integration tests for webhook endpoint
  - POST /webhooks/github with valid signature returns 200
  - POST /webhooks/github with invalid signature returns 401
  - POST /webhooks/github with missing signature returns 401
  - Push event payload parsing
  - Other event types gracefully ignored
  - Webhook logging verification

## Task Breakdown

### Phase 1: Core Signature Verification
- Add webhook payload types to `app/src/github/types.ts`
  - `GitHubWebhookEvent` - Base event interface
  - `GitHubPushEvent` - Push event payload structure
  - `WebhookHeaders` - Header type definitions
- Implement `verifyWebhookSignature()` in `app/src/github/webhook-handler.ts`
  - HMAC-SHA256 computation using `crypto.createHmac()`
  - Timing-safe comparison using `crypto.timingSafeEqual()`
  - Input validation (signature format, secret presence)
- Write unit tests for signature verification edge cases
  - Valid signature with correct secret
  - Invalid signature with wrong secret
  - Missing signature header
  - Malformed signature format (not sha256=...)
  - Empty payload handling
  - Buffer encoding edge cases

### Phase 2: Webhook Endpoint Implementation
- Implement `parseWebhookPayload()` for type-safe parsing
  - Extract event type from `X-GitHub-Event` header
  - Parse push event fields: repository, ref, commit SHA
  - Validation error handling with descriptive messages
- Implement `logWebhookRequest()` for structured logging
  - Log event type, delivery ID, repository name
  - Redact sensitive data (installation tokens if present)
  - Include timestamp and request metadata
- Add webhook route handler in `app/src/api/routes.ts`
  - Configure Express raw body parser for signature verification
  - Route: `POST /webhooks/github`
  - Skip authentication middleware (use signature verification)
  - Call verification, parsing, logging functions
  - Return appropriate response codes

### Phase 3: Integration Testing and Documentation
- Write integration tests for webhook endpoint
  - Generate valid HMAC signatures using test secret
  - Test push event payload parsing
  - Verify logging output contains expected fields
  - Test graceful handling of unknown event types
- Add environment variable validation
  - Check `GITHUB_WEBHOOK_SECRET` on server startup
  - Warn if missing in development (non-fatal)
  - Fail if missing in production
- Update documentation
  - Add webhook endpoint to API documentation
  - Document required environment variables
  - Add example webhook payload for manual testing
  - Link to GitHub webhook setup docs

## Step by Step Tasks

### Environment Setup
- Add `GITHUB_WEBHOOK_SECRET` to `app/.env.example` with placeholder value
- Document webhook secret generation in `docs/github-app-setup.md` (already exists)
- Add environment variable check in `app/src/index.ts` server bootstrap
  - Log warning if `GITHUB_WEBHOOK_SECRET` is missing
  - Validate format (non-empty string, minimum 16 characters recommended)

### Type Definitions
- Extend `app/src/github/types.ts` with webhook types:
  ```typescript
  export interface WebhookHeaders {
    "x-hub-signature-256": string;
    "x-github-event": string;
    "x-github-delivery": string;
  }

  export interface GitHubPushEvent {
    ref: string; // refs/heads/main
    after: string; // commit SHA
    repository: {
      id: number;
      name: string;
      full_name: string; // owner/repo
      private: boolean;
      default_branch: string;
    };
    sender: {
      login: string;
      id: number;
    };
  }
  ```

### Core Implementation
- Create `app/src/github/webhook-handler.ts`:
  - Import Node.js `crypto` module
  - Implement `verifyWebhookSignature(payload: string, signature: string, secret: string): boolean`
    - Compute HMAC: `crypto.createHmac('sha256', secret).update(payload).digest('hex')`
    - Format digest: `'sha256=' + digest`
    - Compare using `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))`
    - Return boolean result
  - Implement `parseWebhookPayload(body: unknown, event: string): GitHubPushEvent | null`
    - Type guard for push event structure
    - Extract repository, ref, commit SHA
    - Return null for unsupported event types
  - Implement `logWebhookRequest(event: string, delivery: string, payload: any): void`
    - Structured console.log with timestamp
    - Log event type, delivery ID, repository name
    - Sanitize sensitive fields

### Route Registration
- Update `app/src/api/routes.ts`:
  - Import webhook handler functions
  - Add webhook route BEFORE authentication middleware:
    ```typescript
    // Webhook endpoint (public, signature-verified)
    app.post('/webhooks/github', express.raw({ type: 'application/json' }), async (req, res) => {
      // Implementation here
    });
    ```
  - Extract headers: `X-Hub-Signature-256`, `X-GitHub-Event`, `X-GitHub-Delivery`
  - Convert raw body to string for verification
  - Call `verifyWebhookSignature()`
  - Parse JSON body after verification
  - Call `parseWebhookPayload()` and `logWebhookRequest()`
  - Return 200 with `{ received: true }`

### Unit Tests
- Create `app/tests/github/webhook-handler.test.ts`:
  - Test `verifyWebhookSignature()`:
    - Valid signature with correct secret returns true
    - Invalid signature with wrong secret returns false
    - Missing signature returns false
    - Malformed signature format (no 'sha256=' prefix) returns false
    - Empty payload handling
    - Unicode payload handling
  - Test `parseWebhookPayload()`:
    - Valid push event returns parsed object
    - Invalid event type returns null
    - Malformed payload returns null
    - Missing required fields returns null
  - Test `logWebhookRequest()`:
    - Verify log output format
    - Check sensitive data redaction

### Integration Tests
- Create `app/tests/api/webhooks.test.ts`:
  - Setup: Start Supabase Local stack (not required for webhook tests, but for consistency)
  - Test valid webhook request:
    - Generate valid HMAC signature using test secret
    - POST to /webhooks/github with signature header
    - Expect 200 response with `{ received: true }`
  - Test invalid signature:
    - POST with wrong signature
    - Expect 401 response with error message
  - Test missing signature:
    - POST without `X-Hub-Signature-256` header
    - Expect 401 response
  - Test push event parsing:
    - POST valid push event payload
    - Verify parsed fields in logs
  - Test unknown event type:
    - POST with `X-GitHub-Event: installation`
    - Expect 200 response (gracefully ignored)
  - Teardown: Clean up test containers

### Validation and Cleanup
- Run Level 2 validation (integration gate):
  - `cd app && bun run lint`
  - `cd app && bunx tsc --noEmit`
  - `cd app && bun test:setup`
  - `cd app && bun test --filter integration`
  - `cd app && bun test:teardown || true`
- Fix any lint or type errors
- Verify all tests pass
- Commit changes with conventional commit message:
  - `feat(webhooks): implement GitHub webhook receiver with HMAC verification`
- Push branch: `git push -u origin interactive-260-implement-webhook-receiver`

## Risks & Mitigations

### Risk: Timing attack on signature comparison
**Mitigation**: Use `crypto.timingSafeEqual()` for constant-time comparison. All tests verify this function is used correctly.

### Risk: Raw body parsing breaks Express JSON middleware
**Mitigation**: Use `express.raw({ type: 'application/json' })` middleware specifically for webhook route to preserve raw body. Manually parse JSON after signature verification.

### Risk: Webhook secret exposure in logs
**Mitigation**: Never log webhook secret or computed signatures. Audit all log statements to ensure only safe metadata is logged (event type, delivery ID, repository name).

### Risk: Replay attacks using captured webhook requests
**Mitigation**: Document as known limitation for MVP. Deferred to production hardening with delivery ID tracking (issue #261 follow-up).

### Risk: Missing or misconfigured webhook secret
**Mitigation**: Add server startup validation for `GITHUB_WEBHOOK_SECRET`. Fail fast in production, warn in development.

### Risk: Malformed webhook payloads cause crashes
**Mitigation**: Comprehensive input validation in `parseWebhookPayload()` with graceful error handling. Return 400 for malformed payloads, log error details.

## Validation Strategy

### Automated Tests
- **Unit tests**: `app/tests/github/webhook-handler.test.ts` (5-10 test cases)
  - Signature verification edge cases (valid, invalid, missing, malformed)
  - Payload parsing edge cases (valid, invalid, missing fields)
  - Timing-safe comparison verification
  - Test against real Supabase Local (antimocking compliance)
- **Integration tests**: `app/tests/api/webhooks.test.ts` (5-8 test cases)
  - End-to-end webhook request flow with valid/invalid signatures
  - Push event parsing verification
  - Unknown event type handling
  - Test against real Supabase Local (antimocking compliance)
  - Log output verification (structured logging format)

### Manual Checks
- **Webhook delivery testing**:
  - Configure GitHub App webhook URL (via ngrok for local testing)
  - Trigger test webhook from GitHub App settings
  - Verify signature verification passes
  - Check server logs for structured webhook request entry
  - Test push event to installed repository
- **Security validation**:
  - Verify timing-safe comparison is used (code review)
  - Confirm webhook secret is never logged or exposed
  - Test invalid signature rejection
  - Test missing signature rejection
- **Error handling**:
  - Test malformed JSON payload (expect 400)
  - Test missing required headers (expect 401)
  - Verify descriptive error messages in response

### Release Guardrails
- **Monitoring**: Add logging for webhook request rate and signature verification failures
- **Alerting**: Monitor for high rate of 401 responses (indicates misconfigured secret or attack)
- **Rollback**: Webhook endpoint is additive (no breaking changes), can be disabled by removing GitHub App webhook URL
- **Evidence**: CI logs show all tests passing with real Supabase Local integration
- **Documentation**: Webhook endpoint documented in API reference with example payloads

## Validation Commands

### Level 2 - Integration Gate (required for this feature)
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test:setup
cd app && bun test --filter integration
cd app && bun test:teardown || true
```

### Additional Domain-Specific Checks
```bash
# Verify webhook types compile correctly
cd app && bunx tsc --noEmit app/src/github/types.ts

# Run webhook-specific tests in isolation
cd app && bun test webhook

# Test signature verification function standalone
cd app && bun test webhook-handler
```

### Manual Verification
```bash
# Generate test webhook signature (for manual testing)
echo -n '{"test": "payload"}' | openssl dgst -sha256 -hmac "test-secret" | awk '{print "sha256="$2}'

# Test webhook endpoint locally (requires server running)
curl -X POST http://localhost:3000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=<computed-signature>" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: test-delivery-123" \
  -d '{"test": "payload"}'
```

## References
- GitHub webhook documentation: https://docs.github.com/en/webhooks
- Securing webhooks: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- Push event payload: https://docs.github.com/en/webhooks/webhook-events-and-payloads#push
- Node.js crypto module: https://nodejs.org/api/crypto.html
- Issue #257 (Epic 5 - GitHub Integration)
- Issue #259 (GitHub App token generation)
- Issue #261 (Integrate webhooks with job queue)
- `docs/github-app-setup.md` (webhook configuration guide)
