# Feature #540: Phase 2A - Authentication Migration (Local-First MVP)

**Issue**: #540  
**Type**: Feature  
**Parent**: #532 (Local-First SQLite Architecture)  
**Status**: Phase 2A Complete  
**Priority**: Critical  
**Created**: 2025-12-15  

## BLUF (Bottom Line Up Front)

Enable local-first KotaDB operation by bypassing authentication for local mode. After issue #543 simplified the SQLite schema to remove users/api_keys tables, the local-first tier now operates with **ZERO authentication**. This spec implements the minimal viable approach to enable local development and testing without network dependencies.

**Scope**: Local-first MVP (NO cloud sync, NO multi-user)  
**Files Affected**: 6 core files  
**Risk Level**: LOW - Isolated to local mode detection  
**Timeline**: 2-3 days

---

## 1. Context and Dependencies

### 1.1 Completed Work

- [x] **Issue #543**: SQLite schema simplified to local-first essentials
  - Removed `users` and `api_keys` tables from SQLite
  - Made `user_id` fields nullable in all tables
  - 6 core tables only: repositories, indexed_files, indexed_symbols, indexed_references, projects, project_repositories

- [x] **Issue #538**: SQLite client infrastructure
  - `KotaDatabase` class with WAL mode
  - Connection pooling
  - FTS5 support verified
  - JSONL export/import layer

### 1.2 Current State

**Authentication Flow (Supabase Required)**:
```
Request → authenticateRequest() → Supabase RPC lookup → AuthContext → Handler
                 ↓
            BLOCKS local mode (always requires network)
```

**Blocking Code Locations**:
1. `app/src/api/routes.ts:429` - Auth middleware enforced on all routes
2. `app/src/auth/middleware.ts:38-179` - Requires Authorization header
3. `app/src/db/client.ts` - Only provides Supabase clients
4. `app/src/mcp/tools.ts` - All tools expect SupabaseClient

### 1.3 Target State

**Local-First Flow (No Authentication)**:
```
Request → detectLocalMode() → Skip auth OR AuthContext (local user) → Handler
                                                  ↓
                                         Use SQLite directly
```

**Environment Detection**:
```bash
# Local mode (no auth)
KOTA_LOCAL_MODE=true

# Cloud mode (auth required)
KOTA_LOCAL_MODE=false  # or unset
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

---

## 2. Implementation Plan

### 2.1 Environment Detection

**File**: `app/src/config/environment.ts` (NEW)

Create a central configuration module for environment detection:

```typescript
/**
 * Environment configuration for KotaDB.
 * Detects local-first vs cloud-sync mode.
 */

export interface EnvironmentConfig {
  mode: 'local' | 'cloud';
  localDbPath?: string;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  supabaseAnonKey?: string;
}

/**
 * Detect current operating mode from environment variables.
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const localMode = process.env.KOTA_LOCAL_MODE === 'true';
  
  if (localMode) {
    return {
      mode: 'local',
      localDbPath: process.env.KOTADB_PATH || undefined,
    };
  }
  
  // Cloud mode - require Supabase credentials
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Cloud mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY. ' +
      'Set KOTA_LOCAL_MODE=true for local operation.'
    );
  }
  
  return {
    mode: 'cloud',
    supabaseUrl,
    supabaseServiceKey,
    supabaseAnonKey,
  };
}

/**
 * Check if running in local-first mode.
 */
export function isLocalMode(): boolean {
  return getEnvironmentConfig().mode === 'local';
}
```

**Rationale**: Centralized configuration prevents scattered env var checks and provides clear error messages.

---

### 2.2 Database Client Abstraction

**File**: `app/src/db/client.ts` (MODIFY)

Add local mode support while preserving cloud mode compatibility:

```typescript
/**
 * Unified database client for local and cloud modes.
 */

import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { getGlobalDatabase, type KotaDatabase } from "@db/sqlite/sqlite-client";
import { getEnvironmentConfig, isLocalMode } from "@config/environment";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "db-client" });

/**
 * Database client type (union of Supabase and SQLite)
 */
export type DatabaseClient = SupabaseClient | KotaDatabase;

/**
 * Get the appropriate database client based on environment mode.
 * 
 * - Local mode: Returns KotaDatabase (SQLite)
 * - Cloud mode: Returns SupabaseClient (service role)
 */
export function getClient(): DatabaseClient {
  if (isLocalMode()) {
    logger.debug("Using local SQLite database");
    return getGlobalDatabase();
  }
  
  logger.debug("Using Supabase cloud database");
  return getServiceClient();
}

/**
 * Get Supabase service role client (cloud mode only).
 * Throws error if called in local mode.
 */
export function getServiceClient(): SupabaseClient {
  const config = getEnvironmentConfig();
  
  if (config.mode === 'local') {
    throw new Error('getServiceClient() called in local mode - use getClient() instead');
  }
  
  return createClient(config.supabaseUrl!, config.supabaseServiceKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ... keep existing getAnonClient(), setUserContext(), clearUserContext()
// These are only used in cloud mode
```

**Migration Strategy**: 
- Phase 1: Add `getClient()` alongside existing functions
- Phase 2: Update call sites to use `getClient()` where appropriate
- Phase 3: Remove direct Supabase calls from local-mode code paths

---

### 2.3 Authentication Middleware Bypass

**File**: `app/src/auth/middleware.ts` (MODIFY)

Add local mode bypass at the entry point:

```typescript
/**
 * Authentication middleware for KotaDB API.
 * Supports both cloud (API key) and local (no auth) modes.
 */

import { isLocalMode } from "@config/environment";
import type { AuthContext } from "@shared/types/auth";
import { createLogger } from "@logging/logger";

const logger = createLogger({ module: "auth-middleware" });

/**
 * Local mode authentication context (no real user).
 * Uses a placeholder user ID for local-only operations.
 */
const LOCAL_AUTH_CONTEXT: AuthContext = {
  userId: "local-user",
  tier: "enterprise", // Full access in local mode
  keyId: "local-key",
  rateLimitPerHour: Number.MAX_SAFE_INTEGER, // No rate limits locally
};

/**
 * Authenticate incoming request.
 * 
 * Local mode: Always succeeds with placeholder context
 * Cloud mode: Validates API key via Supabase
 */
export async function authenticateRequest(
  request: Request,
): Promise<AuthResult> {
  // BYPASS: Local mode - no authentication required
  if (isLocalMode()) {
    logger.debug("Local mode: Bypassing authentication");
    return { context: LOCAL_AUTH_CONTEXT };
  }
  
  // Cloud mode: Existing Supabase authentication logic
  const authHeader = request.headers.get("Authorization");
  
  if (!authHeader) {
    return {
      response: new Response(
        JSON.stringify({
          error: "Missing API key",
          code: "AUTH_MISSING_KEY",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    };
  }
  
  // ... rest of existing authentication logic (unchanged)
}
```

**Testing Considerations**:
- Local mode: `KOTA_LOCAL_MODE=true bun test` should skip auth validation
- Cloud mode: Existing tests continue to work with Supabase Local

---

### 2.4 Rate Limiting Bypass

**File**: `app/src/auth/rate-limit.ts` (MODIFY)

Skip rate limiting in local mode:

```typescript
import { isLocalMode } from "@config/environment";

/**
 * Enforce rate limits based on API key and tier.
 * 
 * Local mode: Always allows (no limits)
 * Cloud mode: Enforces hourly/daily limits via Supabase
 */
export async function enforceRateLimit(
  keyId: string,
  tier: string,
): Promise<RateLimitResult> {
  // BYPASS: Local mode - no rate limiting
  if (isLocalMode()) {
    return {
      allowed: true,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
      resetAt: Date.now() + 3600000, // 1 hour from now
    };
  }
  
  // Cloud mode: Existing rate limit logic (unchanged)
  // ...
}
```

---

### 2.5 Query Functions Adaptation

**File**: `app/src/api/queries.ts` (MODIFY - SELECTIVE)

Make `userId` optional for local-mode queries:

```typescript
import { isLocalMode } from "@config/environment";
import type { KotaDatabase } from "@db/sqlite/sqlite-client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure repository exists, creating if necessary.
 * 
 * Local mode: Uses SQLite with NULL user_id
 * Cloud mode: Uses Supabase with RLS
 */
export async function ensureRepository(
  client: SupabaseClient | KotaDatabase,
  fullName: string,
  userId?: string, // Optional for local mode
): Promise<string> {
  if (isLocalMode()) {
    const db = client as KotaDatabase;
    
    // Check if repository exists
    const existing = db.queryOne<{ id: string }>(
      "SELECT id FROM repositories WHERE full_name = ?",
      [fullName]
    );
    
    if (existing) {
      return existing.id;
    }
    
    // Create new repository with NULL user_id
    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO repositories (id, name, full_name, user_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, datetime('now'), datetime('now'))`,
      [id, fullName.split('/')[1] || fullName, fullName]
    );
    
    return id;
  }
  
  // Cloud mode: Existing Supabase logic (unchanged)
  const supabase = client as SupabaseClient;
  // ... existing code
}
```

**Pattern**: Use type guards and runtime checks to route to SQLite vs Supabase implementations.

---

### 2.6 MCP Tools Update

**File**: `app/src/mcp/tools.ts` (MODIFY)

Update MCP tool handlers to work in local mode:

```typescript
import { isLocalMode } from "@config/environment";
import { getClient } from "@db/client";
import type { KotaDatabase } from "@db/sqlite/sqlite-client";

/**
 * Execute search_code tool.
 * 
 * Local mode: Uses SQLite FTS5
 * Cloud mode: Uses Supabase textSearch RPC
 */
export async function executeSearchCode(
  args: { term: string; limit?: number },
  client?: SupabaseClient, // Optional in local mode
): Promise<SearchResult[]> {
  if (isLocalMode()) {
    const db = getClient() as KotaDatabase;
    
    // FTS5 search query
    const results = db.query<SearchResult>(`
      SELECT 
        f.id,
        f.path,
        f.repository_id,
        snippet(indexed_files_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet,
        bm25(indexed_files_fts) AS rank
      FROM indexed_files_fts
      JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid
      WHERE indexed_files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `, [args.term, args.limit || 20]);
    
    return results;
  }
  
  // Cloud mode: Existing Supabase implementation
  if (!client) {
    throw new Error('Supabase client required in cloud mode');
  }
  
  return searchFiles(client, args.term, { limit: args.limit });
}
```

**Migration Scope**: Update ~6-8 core MCP tools (search_code, index_repository, list_projects, etc.)

---

## 3. Testing Strategy

### 3.1 Test Environment Setup

Create test fixtures for both modes:

**File**: `app/src/__tests__/helpers/test-db.ts` (NEW)

```typescript
import { KotaDatabase } from "@db/sqlite/sqlite-client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Create in-memory SQLite database for testing.
 * Loads schema from sqlite-schema.sql.
 */
export function createTestDatabase(): KotaDatabase {
  const db = new KotaDatabase({
    path: ":memory:",
    readonly: false,
    wal: false, // In-memory DB doesn't need WAL
  });
  
  // Load schema
  const schemaPath = join(__dirname, "../../db/sqlite-schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);
  
  return db;
}

/**
 * Seed test database with sample data.
 */
export function seedTestDatabase(db: KotaDatabase): void {
  db.run(`
    INSERT INTO repositories (id, name, full_name, user_id)
    VALUES ('test-repo-1', 'test-repo', 'test-user/test-repo', NULL)
  `);
  
  db.run(`
    INSERT INTO indexed_files (id, repository_id, path, content, language)
    VALUES (
      'test-file-1',
      'test-repo-1',
      'src/main.ts',
      'export function hello() { return "world"; }',
      'typescript'
    )
  `);
}
```

### 3.2 Unit Tests

**File**: `app/src/auth/__tests__/middleware.test.ts` (NEW)

```typescript
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { authenticateRequest } from "@auth/middleware";

describe("authenticateRequest (local mode)", () => {
  beforeAll(() => {
    process.env.KOTA_LOCAL_MODE = "true";
  });
  
  afterAll(() => {
    delete process.env.KOTA_LOCAL_MODE;
  });
  
  it("should bypass authentication in local mode", async () => {
    const request = new Request("http://localhost:3000/api/search", {
      method: "GET",
      headers: {
        // No Authorization header
      },
    });
    
    const result = await authenticateRequest(request);
    
    expect(result.context).toBeDefined();
    expect(result.context?.userId).toBe("local-user");
    expect(result.context?.tier).toBe("enterprise");
    expect(result.response).toBeUndefined();
  });
  
  it("should not require Authorization header in local mode", async () => {
    const request = new Request("http://localhost:3000/api/search");
    
    const result = await authenticateRequest(request);
    
    expect(result.context).toBeDefined();
  });
});
```

### 3.3 Integration Tests

**File**: `app/src/api/__tests__/queries-local.test.ts` (NEW)

```typescript
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { ensureRepository } from "@api/queries";
import { createTestDatabase, seedTestDatabase } from "../__tests__/helpers/test-db";

describe("ensureRepository (local mode)", () => {
  let db: KotaDatabase;
  
  beforeAll(() => {
    process.env.KOTA_LOCAL_MODE = "true";
    db = createTestDatabase();
    seedTestDatabase(db);
  });
  
  afterAll(() => {
    db.close();
    delete process.env.KOTA_LOCAL_MODE;
  });
  
  it("should create repository with NULL user_id", async () => {
    const repoId = await ensureRepository(db, "user/new-repo");
    
    expect(repoId).toBeDefined();
    
    const repo = db.queryOne<{ user_id: string | null }>(
      "SELECT user_id FROM repositories WHERE id = ?",
      [repoId]
    );
    
    expect(repo?.user_id).toBeNull();
  });
  
  it("should find existing repository by full_name", async () => {
    const repoId = await ensureRepository(db, "test-user/test-repo");
    
    expect(repoId).toBe("test-repo-1");
  });
});
```

### 3.4 Validation Levels

**Level 1: Smoke Tests (Required)**
- ✅ Local mode detected from environment
- ✅ Authentication bypassed in local mode
- ✅ SQLite client initialized
- ✅ FTS5 search returns results
- ✅ Type-check passes: `bunx tsc --noEmit`

**Level 2: Feature Parity (Recommended)**
- ✅ All MCP tools work in local mode
- ✅ Repository creation with NULL user_id
- ✅ File indexing persists to SQLite
- ✅ Search returns correct results
- ✅ No Supabase calls in local mode

**Level 3: Production Readiness (Deferred)**
- ⏸️ Cloud sync authentication (Issue #541)
- ⏸️ Multi-user RLS replacement (Issue #542)
- ⏸️ Migration from Supabase to SQLite (Issue #545)

---

## 4. Files to Modify

### 4.1 New Files (3)

| File | Purpose | Lines |
|------|---------|-------|
| `app/src/config/environment.ts` | Environment detection and config | ~80 |
| `app/src/__tests__/helpers/test-db.ts` | Test database utilities | ~50 |
| `app/src/auth/__tests__/middleware.test.ts` | Auth middleware tests | ~60 |

**Total**: ~190 lines

### 4.2 Modified Files (6)

| File | Changes | Estimated Lines |
|------|---------|-----------------|
| `app/src/db/client.ts` | Add `getClient()` abstraction | +40 |
| `app/src/auth/middleware.ts` | Add local mode bypass | +15 |
| `app/src/auth/rate-limit.ts` | Skip rate limits locally | +10 |
| `app/src/api/queries.ts` | Make userId optional (2-3 functions) | +30 |
| `app/src/mcp/tools.ts` | Local mode handlers (6 tools) | +80 |
| `app/src/api/routes.ts` | Use `getClient()` instead of Supabase | +5 |

**Total**: ~180 lines modified

### 4.3 Configuration Files (2)

| File | Changes |
|------|---------|
| `app/.env` | Add `KOTA_LOCAL_MODE=true` |
| `app/.env.example` | Document local mode variables |

---

## 5. Implementation Steps

### Step 1: Environment Detection (Day 1 - 2 hours)

**Files**: `app/src/config/environment.ts` (NEW)

**Tasks**:
- [ ] Create `getEnvironmentConfig()` function
- [ ] Add `isLocalMode()` helper
- [ ] Add validation for cloud mode credentials
- [ ] Write unit tests for config detection

**Validation**:
```bash
# Test environment detection
KOTA_LOCAL_MODE=true bun run test:config
```

### Step 2: Database Client Abstraction (Day 1 - 3 hours)

**Files**: `app/src/db/client.ts`

**Tasks**:
- [ ] Add `getClient()` function
- [ ] Update `getServiceClient()` to error in local mode
- [ ] Add JSDoc comments
- [ ] Test with both modes

**Validation**:
```bash
# Should return KotaDatabase
KOTA_LOCAL_MODE=true bun run test:db-client

# Should return SupabaseClient
SUPABASE_URL=http://localhost:54322 bun run test:db-client
```

### Step 3: Authentication Bypass (Day 1 - 2 hours)

**Files**: `app/src/auth/middleware.ts`, `app/src/auth/rate-limit.ts`

**Tasks**:
- [ ] Add local mode check at start of `authenticateRequest()`
- [ ] Return `LOCAL_AUTH_CONTEXT` in local mode
- [ ] Update `enforceRateLimit()` to bypass in local mode
- [ ] Write tests for both modes

**Validation**:
```bash
# Should skip auth and rate limits
KOTA_LOCAL_MODE=true bun test src/auth/__tests__/middleware.test.ts
```

### Step 4: Query Function Updates (Day 2 - 4 hours)

**Files**: `app/src/api/queries.ts`

**Tasks**:
- [ ] Update `ensureRepository()` to handle NULL user_id
- [ ] Update `searchFiles()` to use FTS5 in local mode
- [ ] Update `listRecentFiles()` (if needed)
- [ ] Make `userId` parameter optional
- [ ] Add type guards for SQLite vs Supabase

**Validation**:
```bash
KOTA_LOCAL_MODE=true bun test src/api/__tests__/queries-local.test.ts
```

### Step 5: MCP Tools Migration (Day 2-3 - 6 hours)

**Files**: `app/src/mcp/tools.ts`

**Tasks**:
- [ ] Update `executeSearchCode()` with FTS5 implementation
- [ ] Update `executeIndexRepository()` to use SQLite storage
- [ ] Update `executeListProjects()` with SQLite query
- [ ] Update `executeGetProjectStats()` (if needed)
- [ ] Update ~2-4 additional tools as needed
- [ ] Write integration tests

**Validation**:
```bash
KOTA_LOCAL_MODE=true bun test src/mcp/__tests__/tools-local.test.ts
```

### Step 6: End-to-End Testing (Day 3 - 3 hours)

**Files**: Test helpers, integration tests

**Tasks**:
- [ ] Create `createTestDatabase()` helper
- [ ] Add `seedTestDatabase()` with sample data
- [ ] Write E2E test: index repo → search → get results
- [ ] Test API endpoints in local mode
- [ ] Document local mode usage

**Validation**:
```bash
# Full test suite in local mode
KOTA_LOCAL_MODE=true bun test

# Verify no Supabase connections
KOTA_LOCAL_MODE=true bun run dev
# Make API request - should work without Supabase
```

---

## 6. Acceptance Criteria

### 6.1 Functional Requirements

- [ ] **F1**: Application starts in local mode without Supabase credentials
- [ ] **F2**: Authentication is bypassed when `KOTA_LOCAL_MODE=true`
- [ ] **F3**: All API endpoints work with local SQLite database
- [ ] **F4**: MCP tools use FTS5 for code search (not Supabase RPC)
- [ ] **F5**: Repositories created with `user_id = NULL`
- [ ] **F6**: Rate limiting is disabled in local mode
- [ ] **F7**: No network calls to Supabase in local mode

### 6.2 Non-Functional Requirements

- [ ] **NF1**: Type-check passes: `bunx tsc --noEmit`
- [ ] **NF2**: All tests pass: `KOTA_LOCAL_MODE=true bun test`
- [ ] **NF3**: No breaking changes to cloud mode
- [ ] **NF4**: Documentation updated with local mode instructions
- [ ] **NF5**: Error messages guide users to set `KOTA_LOCAL_MODE`

### 6.3 Security Considerations

- [ ] **S1**: Local mode is opt-in (requires explicit env var)
- [ ] **S2**: Cloud mode still enforces authentication (unchanged)
- [ ] **S3**: No sensitive data logged in local mode
- [ ] **S4**: Clear separation between local and cloud code paths

---

## 7. Documentation Updates

### 7.1 README Updates

**File**: `app/README.md`

Add section:

```markdown
## Local-First Mode (No Authentication)

For local development and offline operation:

```bash
# Set environment
export KOTA_LOCAL_MODE=true

# Start server
bun run dev

# No API key required - all requests allowed
curl http://localhost:3000/api/search?term=hello
```

**Features**:
- No network dependencies (no Supabase)
- No authentication required
- All data stored in `~/.kotadb/kota.db`
- FTS5 full-text search
- JSONL export to `~/.kotadb/export/`

**Limitations**:
- Single-user only (no user_id tracking)
- No rate limiting
- No cloud sync
```

### 7.2 Environment Variables Documentation

**File**: `app/.env.example`

```bash
# ============================================================================
# Operating Mode
# ============================================================================

# Local-first mode (no authentication, no network)
# Set to 'true' for offline development and testing
KOTA_LOCAL_MODE=false

# Local SQLite database path (optional, defaults to ~/.kotadb/kota.db)
# KOTADB_PATH=/custom/path/to/kota.db

# ============================================================================
# Cloud Mode (Supabase) - IGNORED when KOTA_LOCAL_MODE=true
# ============================================================================

SUPABASE_URL=http://127.0.0.1:54322
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
```

---

## 8. Risks and Mitigations

### 8.1 High Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Accidental local mode in production** | CRITICAL | Low | Environment validation on startup; error if cloud mode but no credentials |
| **Type errors from union types** | Medium | Medium | Comprehensive TypeScript type guards; runtime checks |

### 8.2 Medium Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking cloud mode | Medium | Maintain all existing Supabase code paths; test both modes |
| Missing NULL user_id handling | Medium | Test all queries with NULL user_id; verify schema constraints |
| FTS5 performance | Medium | Benchmark against Supabase textSearch; optimize indexes |

### 8.3 Low Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Test coverage gaps | Low | Write tests for all modified functions; E2E tests |
| Documentation staleness | Low | Update docs in same PR as code changes |

---

## 9. Rollback Plan

If local mode causes issues:

1. **Immediate**: Set `KOTA_LOCAL_MODE=false` (reverts to cloud mode)
2. **Code Rollback**: `git revert <commit-hash>` (all changes in one PR)
3. **No Data Loss**: SQLite database preserved at `~/.kotadb/kota.db`

**Recovery Time**: < 5 minutes (env var change only)

---

## 10. Future Work (Out of Scope)

The following are **DEFERRED** to future issues:

- **Issue #541**: Cloud sync authentication with JWT
- **Issue #542**: Multi-user support (AuthContext pattern)
- **Issue #543**: RLS policy migration to application layer
- **Issue #544**: Migration tooling (Supabase → SQLite)
- **Issue #545**: Hybrid mode (local storage + cloud sync)

---

## 11. Success Metrics

### 11.1 Quantitative

- [ ] Local mode startup time < 2 seconds (vs 10s with Supabase)
- [ ] Zero network calls during local operation
- [ ] FTS5 search completes in < 50ms for 10K files
- [ ] Test suite runs in < 5 seconds (in-memory DB)

### 11.2 Qualitative

- [ ] Developers can run full stack without Docker
- [ ] MCP tools work offline (airplane mode test)
- [ ] Clear error messages guide configuration
- [ ] No regression in cloud mode functionality

---

**Estimated Timeline**: 3 days  
**Estimated Effort**: 1 developer (senior)  
**Dependencies**: Issues #538 (SQLite client) ✅ and #543 (schema simplification) ✅  
**Blocks**: Issues #541-545 (cloud sync features)

**Status**: Ready for Implementation  
**Approved By**: TBD  
**Date**: 2025-12-15
