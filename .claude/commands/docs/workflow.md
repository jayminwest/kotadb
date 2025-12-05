# API Workflow

**Template Category**: Message-Only
**Prompt Level**: 4 (Contextual)

API workflows for authentication, rate limiting, indexing, search, and validation.

## Authentication & Rate Limiting Flow

All authenticated endpoints follow this flow:

1. Request arrives with `Authorization: Bearer <api_key>` header
2. `authenticateRequest()` middleware validates API key and extracts tier
3. `enforceRateLimit()` checks hourly request count via `increment_rate_limit()` DB function
4. If limit exceeded, return 429 with `Retry-After` header
5. If allowed, attach auth context (user, tier, rate limit status) to request
6. Handler executes with rate limit headers injected into response

## POST /index - Repository Indexing

Triggers repository indexing:

1. Ensures repository exists in `repositories` table (creates if new)
2. Records index job in `index_jobs` table (status: pending → completed/failed/skipped)
3. Queues asynchronous indexing via `queueMicrotask()`
4. Repository preparation: clones if needed, checks out ref
5. File discovery: walks project tree, filters by extension
6. Parsing: extracts content and dependencies
7. Storage: saves to `indexed_files` table with `UNIQUE (repository_id, path)` constraint

### Supported File Extensions

- `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`

### Ignored Directories

- `.git`, `node_modules`, `dist`, `build`, `out`, `coverage`

## GET /search - Code Search

Queries indexed files:

- Full-text search on content
- Optional filters: `project` (project_root), `limit`
- Returns results with context snippets

## POST /validate-output - Schema Validation

Validates command outputs against schemas:

1. Accepts JSON payload: `{schema: object, output: string}`
2. Schema format: JSON-compatible Zod schema (type, pattern, minLength, maxLength, etc.)
3. Returns validation result: `{valid: boolean, errors?: [{path, message}]}`

### Use Case

Automation layer validates slash command outputs before parsing.

Command templates include schemas in `## Output Schema` section.

## Rate Limit Response Headers

All authenticated endpoints include:

- **`X-RateLimit-Limit`**: Total requests allowed per hour for the tier
- **`X-RateLimit-Remaining`**: Requests remaining in current window
- **`X-RateLimit-Reset`**: Unix timestamp when the limit resets
- **`Retry-After`**: Seconds until retry (429 responses only)

## Rate Limit Tiers

### Hourly Limits
- **free**: 1,000 requests/hour
- **solo**: 5,000 requests/hour
- **team**: 25,000 requests/hour

### Daily Limits
- **free**: 5,000 requests/day
- **solo**: 25,000 requests/day
- **team**: 100,000 requests/day

Both hourly and daily limits are enforced. Whichever limit is reached first will block requests.

## Related Documentation

- [Architecture](./.claude/commands/docs/architecture.md)
- [Database Schema](./.claude/commands/docs/database.md)
- [MCP Integration](./.claude/commands/docs/mcp-integration.md)
- [Environment Variables](./.claude/commands/app/environment.md)
