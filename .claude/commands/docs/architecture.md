# Architecture

**Template Category**: Message-Only
**Prompt Level**: 4 (Contextual)

Overview of KotaDB's architectural patterns, path aliases, shared types, and core components.

## Path Aliases

The project uses TypeScript path aliases defined in `app/tsconfig.json`:

- `@api/*` → `src/api/*`
- `@auth/*` → `src/auth/*`
- `@db/*` → `src/db/*`
- `@indexer/*` → `src/indexer/*`
- `@shared/*` → `../shared/*` (shared types for monorepo)
- `@mcp/*` → `src/mcp/*`
- `@validation/*` → `src/validation/*`
- `@queue/*` → `src/queue/*`

**Always use these aliases for imports, not relative paths.** All paths are relative to the `app/` directory.

## Shared Types Infrastructure

The `shared/` directory at repository root contains TypeScript types shared across all projects in the monorepo (backend, frontend, CLI tools). This provides a single source of truth for API contracts, database entities, and authentication types.

### When to use `@shared/types`

- API request/response types (e.g., `IndexRequest`, `SearchResponse`)
- Database entity types (e.g., `Repository`, `IndexedFile`, `Symbol`)
- Authentication types (e.g., `AuthContext`, `Tier`, `ApiKey`)
- Rate limiting types (e.g., `RateLimitResult`, `RateLimitHeaders`)
- Validation types (e.g., `ValidationRequest`, `ValidationResponse`)

### When to keep types in `app/src/types`

- Application-specific types (e.g., `ApiContext` with Supabase client)
- Internal implementation details not exposed via API
- Types that depend on app-specific runtime globals (e.g., Bun's `Request` type)

### Import examples

```typescript
// Import shared types for API contracts
import type { IndexRequest, SearchResponse } from "@shared/types";
import type { AuthContext, Tier } from "@shared/types/auth";
import type { Repository, IndexedFile } from "@shared/types/entities";

// Import app-specific types
import type { ApiContext } from "@shared/index";
```

### Breaking changes

When modifying shared types, use TypeScript compiler errors to identify all affected consumers and update them in the same PR. Shared types follow semantic versioning (breaking changes require major version bump in `shared/package.json`).

## Core Components

All application code is located in the `app/` directory.

### Entry Point (app/src/index.ts)

- Bootstraps the HTTP server using Express (runs on Bun runtime)
- Initializes Supabase client and verifies database connection
- Creates Express app and starts listening on configured port
- Handles graceful shutdown via SIGTERM

### API Layer (app/src/api/)

- **`routes.ts`**: Express app factory with middleware and route handlers
  - Body parser middleware for JSON requests
  - Authentication middleware (converts Express→Bun Request for existing auth logic)
  - REST endpoints: `/health`, `/index`, `/search`, `/files/recent`, `/validate-output`
  - MCP endpoint: `/mcp` (POST only, using SDK StreamableHTTPServerTransport)
- **`queries.ts`**: Database query functions for indexed files and search

### Authentication & Rate Limiting (app/src/auth/)

- **`middleware.ts`**: Authentication middleware and rate limit enforcement
- **`validator.ts`**: API key validation and tier extraction
- **`keys.ts`**: API key generation with bcrypt hashing
- **`rate-limit.ts`**: Tier-based rate limiting logic (free=100/hr, solo=1000/hr, team=10000/hr)
- **`context.ts`**: Auth context passed to handlers (includes user, tier, rate limit status)
- **`cache.ts`**: In-memory caching for API key lookups (reduces database load)

### Indexer (app/src/indexer/)

- **`repos.ts`**: Git repository management (clone, fetch, checkout)
  - Clones repositories to `data/workspace/` directory
  - Supports local paths or auto-cloning from GitHub (or custom git base via `KOTA_GIT_BASE_URL`)
  - Handles ref/branch resolution with fallback to default branch (main/master)
- **`parsers.ts`**: File discovery and parsing
  - Supported: `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`
  - Ignores: `.git`, `node_modules`, `dist`, `build`, `out`, `coverage`
- **`extractors.ts`**: Dependency extraction and snippet generation

### Validation (app/src/validation/)

- **`schemas.ts`**: Core validation logic using Zod for command output validation
  - Converts JSON schema objects to Zod schemas
  - Validates strings (with pattern/length constraints), numbers, booleans, arrays, objects
  - Returns structured validation errors with path and message
- **`types.ts`**: TypeScript types for validation API (ValidationRequest, ValidationResponse, ValidationError)
- **`common-schemas.ts`**: Reusable schema helpers for common patterns
  - `FilePathOutput(extension?)`: Validates relative file paths (no leading slash)
  - `JSONBlockOutput(schema)`: Validates JSON structure (with markdown extraction)
  - `MarkdownSectionOutput(sections)`: Validates markdown with required sections
  - `PlainTextOutput(options)`: Validates plain text with length/format constraints
- Integration with Express:
  - POST `/validate-output` endpoint validates command outputs against schemas
  - Requires authentication (API key via Bearer token)
  - Rate limiting applied (consumes user's hourly quota)
  - Returns `{valid: true}` or `{valid: false, errors: [{path, message}]}`

### Queue (app/src/queue/)

- **`client.ts`**: pg-boss job queue lifecycle management
  - Singleton pattern for queue instance (`getQueue()` accessor)
  - `startQueue()`: Initializes pg-boss with Supabase Postgres connection
  - `stopQueue()`: Graceful shutdown with in-flight job draining
  - `checkQueueHealth()`: Database connectivity verification for monitoring
  - Automatic `pgboss` schema creation on first start (separate from `public` schema)
  - Password redaction in logs for security
- **`config.ts`**: Queue behavior configuration constants
  - Retry policy: 3 attempts with exponential backoff (60s, 120s, 180s)
  - Job expiration: 24 hours (automatic cleanup of stale jobs)
  - Archive completed jobs after 1 hour
  - Worker concurrency: 3 concurrent workers (for future worker implementation)
- **`types.ts`**: TypeScript job payload interfaces
  - `IndexRepoJobPayload`: Repository indexing job data (indexJobId, repositoryId, commitSha)
  - `JobResult`: Worker completion result (success, filesProcessed, symbolsExtracted, error)
- Integration with server bootstrap (`app/src/index.ts`):
  - Queue starts after successful database health check
  - SIGTERM handler calls `stopQueue()` before HTTP server shutdown
  - Ensures graceful shutdown drains in-flight jobs before process exit

## Related Documentation

- [Database Schema](./.claude/commands/docs/database.md)
- [MCP Integration](./.claude/commands/docs/mcp-integration.md)
- [API Workflow](./.claude/commands/docs/workflow.md)
