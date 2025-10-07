# KotaDB Database Schema

This document describes the PostgreSQL/Supabase database schema for KotaDB, a multi-tenant SaaS platform for code intelligence and repository indexing.

## Overview

The schema consists of 8 core tables organized into four functional domains:

1. **Authentication & API Keys**: User authentication and API key management
2. **Organizations**: Team workspaces and multi-user collaboration
3. **Repository Management**: Git repository tracking and indexing jobs
4. **Code Intelligence**: File indexing, symbol extraction, and dependency graphs

All tables use UUID primary keys and timestamptz timestamps. Row Level Security (RLS) policies ensure data isolation between users and organizations.

## Table Relationships

```
auth.users (Supabase Auth)
    ↓
├── api_keys (user API keys)
│   └── rate_limit_counters (usage tracking)
├── organizations (team ownership)
│   └── user_organizations (membership)
├── repositories (user/org repos)
    ├── index_jobs (indexing status)
    ├── indexed_files (source files)
    │   ├── symbols (functions, classes, types)
    │   └── references (imports, calls)
    └── dependencies (npm, python, etc.)
```

## Core Tables

### api_keys

Stores API keys for authentication and rate limiting. Keys are hashed using bcrypt before storage.

**Format**: `kota_<tier>_<key_id>_<secret>`
- `tier`: `free`, `solo`, or `team`
- `key_id`: 16 hex characters (public identifier)
- `secret`: 32 hex characters (hashed before storage)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| key_id | text | Public key identifier (unique) |
| secret_hash | text | Bcrypt hash of secret portion |
| tier | text | Rate limit tier (free/solo/team) |
| rate_limit_per_hour | integer | Requests per hour (default: 100) |
| enabled | boolean | Active status |
| created_at | timestamptz | Creation timestamp |
| last_used_at | timestamptz | Last API call timestamp |
| metadata | jsonb | Additional metadata |

**Indexes**:
- `idx_api_keys_user_id` on `user_id`
- `idx_api_keys_key_id` on `key_id`
- `idx_api_keys_enabled` on `enabled` (partial, WHERE enabled = true)

**RLS Policies**:
- Users can only SELECT/INSERT/UPDATE/DELETE their own keys

---

### organizations

Team workspaces for multi-user collaboration.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Organization display name |
| slug | text | URL-safe identifier (unique) |
| owner_id | uuid | FK to auth.users (creator) |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |
| metadata | jsonb | Additional metadata |

**Indexes**:
- `idx_organizations_owner_id` on `owner_id`
- `idx_organizations_slug` on `slug` (unique)

**RLS Policies**:
- Users can SELECT orgs they own or are members of
- Users can INSERT orgs where they are the owner
- Users can UPDATE orgs they own or admin
- Users can DELETE only orgs they own

---

### user_organizations

Many-to-many relationship between users and organizations with role-based access.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| org_id | uuid | FK to organizations |
| role | text | Access role (owner/admin/member) |
| joined_at | timestamptz | Membership timestamp |

**Constraints**:
- UNIQUE(user_id, org_id)

**Indexes**:
- `idx_user_organizations_user_id` on `user_id`
- `idx_user_organizations_org_id` on `org_id`

**RLS Policies**:
- Users can SELECT memberships for themselves or orgs they admin
- Org owners/admins can INSERT new members
- Org owners/admins can DELETE members

---

### rate_limit_counters

Tracks API request counts per key per hour.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| key_id | text | FK to api_keys.key_id |
| window_start | timestamptz | Hourly window start time |
| request_count | integer | Requests in this window |
| created_at | timestamptz | Creation timestamp |

**Constraints**:
- UNIQUE(key_id, window_start)

**Indexes**:
- `idx_rate_limit_counters_key_id` on `key_id`
- `idx_rate_limit_counters_window` on `window_start`

**RLS Policies**:
- Only accessible via `increment_rate_limit()` function
- Service role has full access for cleanup jobs

---

### repositories

Git repositories owned by users or organizations.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users (nullable) |
| org_id | uuid | FK to organizations (nullable) |
| full_name | text | Repository name (e.g., "owner/repo") |
| git_url | text | Clone URL |
| default_branch | text | Default branch (default: "main") |
| last_indexed_at | timestamptz | Last successful index |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |
| metadata | jsonb | Additional metadata |

**Constraints**:
- CHECK: Exactly one of user_id or org_id must be NOT NULL
- UNIQUE(user_id, full_name) where user_id IS NOT NULL
- UNIQUE(org_id, full_name) where org_id IS NOT NULL

**Indexes**:
- `idx_repositories_user_id` on `user_id`
- `idx_repositories_org_id` on `org_id`
- `idx_repositories_full_name` on `full_name`
- `idx_repositories_user_full_name` on (user_id, full_name) [partial]
- `idx_repositories_org_full_name` on (org_id, full_name) [partial]

**RLS Policies**:
- Users can SELECT repos they own or org repos they're members of
- Users can INSERT repos for themselves or their orgs
- Users/org admins can UPDATE repos they own
- Users/org admins can DELETE repos they own

---

### index_jobs

Tracks indexing job status and statistics.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| repository_id | uuid | FK to repositories |
| ref | text | Git ref (branch, tag, commit) |
| status | text | Job status (pending/running/completed/failed/skipped) |
| started_at | timestamptz | Job start time |
| completed_at | timestamptz | Job completion time |
| error_message | text | Error details if failed |
| stats | jsonb | { files_indexed, symbols_extracted, ... } |
| created_at | timestamptz | Creation timestamp |

**Indexes**:
- `idx_index_jobs_repository_id` on `repository_id`
- `idx_index_jobs_status` on `status`
- `idx_index_jobs_created_at` on `created_at DESC`

**RLS Policies**:
- Users can SELECT jobs for repos they own/access
- Users can INSERT jobs for repos they own/access

---

### indexed_files

Source files extracted from repositories.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| repository_id | uuid | FK to repositories |
| path | text | File path relative to repo root |
| content | text | File content |
| language | text | Programming language |
| size_bytes | integer | File size in bytes |
| indexed_at | timestamptz | Indexing timestamp |
| metadata | jsonb | Additional metadata |

**Constraints**:
- UNIQUE(repository_id, path)

**Indexes**:
- `idx_indexed_files_repository_id` on `repository_id`
- `idx_indexed_files_path` on `path`
- `idx_indexed_files_language` on `language`
- `idx_indexed_files_content_fts` using gin(to_tsvector('english', content))

**RLS Policies**:
- Users can SELECT files from repos they own/access
- Users can INSERT files into repos they own/access

---

### symbols

Functions, classes, types, and other code symbols extracted from files.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| file_id | uuid | FK to indexed_files |
| name | text | Symbol name |
| kind | text | Symbol type (function/class/interface/type/variable/constant/method/property) |
| line_start | integer | Start line number |
| line_end | integer | End line number |
| signature | text | Function/method signature |
| documentation | text | Docstring/comments |
| metadata | jsonb | Additional metadata |
| created_at | timestamptz | Creation timestamp |

**Indexes**:
- `idx_symbols_file_id` on `file_id`
- `idx_symbols_name` on `name`
- `idx_symbols_kind` on `kind`

**RLS Policies**:
- Users can SELECT symbols from files they own/access

---

### references

Cross-file symbol references (imports, function calls, etc.).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| source_file_id | uuid | FK to indexed_files (source) |
| target_symbol_id | uuid | FK to symbols (nullable) |
| target_file_path | text | Fallback if symbol not extracted |
| line_number | integer | Reference line number |
| reference_type | text | Type (import/call/extends/implements) |
| metadata | jsonb | Additional metadata |
| created_at | timestamptz | Creation timestamp |

**Indexes**:
- `idx_references_source_file_id` on `source_file_id`
- `idx_references_target_symbol_id` on `target_symbol_id`
- `idx_references_reference_type` on `reference_type`

**RLS Policies**:
- Users can SELECT references from files they own/access

---

### dependencies

Package/module dependencies (npm, pip, go mod, cargo, etc.).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| repository_id | uuid | FK to repositories |
| name | text | Package name |
| version | text | Version constraint |
| dependency_type | text | Package manager (npm/python/go/rust/maven) |
| metadata | jsonb | Additional metadata |
| created_at | timestamptz | Creation timestamp |

**Constraints**:
- UNIQUE(repository_id, name, dependency_type)

**Indexes**:
- `idx_dependencies_repository_id` on `repository_id`
- `idx_dependencies_name` on `name`
- `idx_dependencies_type` on `dependency_type`

**RLS Policies**:
- Users can SELECT dependencies from repos they own/access

---

## Database Functions

### increment_rate_limit(p_key_id text, p_rate_limit integer)

Atomically increments the request counter for an API key and returns current rate limit status.

**Parameters**:
- `p_key_id`: API key identifier
- `p_rate_limit`: Rate limit threshold

**Returns**: jsonb
```json
{
  "request_count": 42,
  "window_start": "2025-10-07T10:00:00Z",
  "rate_limit": 100,
  "remaining": 58,
  "reset_at": "2025-10-07T11:00:00Z"
}
```

**Usage**:
```sql
SELECT increment_rate_limit('test_key_abc123', 100);
```

**Security**: Function is `SECURITY DEFINER` and bypasses RLS policies. Only accessible to authenticated and service_role users.

---

## Row Level Security (RLS)

All tables have RLS enabled with the following principles:

1. **User Isolation**: Users can only access data they own (via `user_id` match)
2. **Organization Sharing**: Users can access data from orgs they're members of
3. **Role-Based Access**: Admins/owners have additional UPDATE/DELETE privileges
4. **Service Role Bypass**: Service role has full access for background jobs

RLS context is set via `app.user_id` session variable:
```sql
SET LOCAL app.user_id = '<user-uuid>';
```

In application code, this is automatically injected by the authentication middleware based on the validated API key or JWT.

---

## Foreign Key Cascade Behavior

| Table | Foreign Key | On Delete Action |
|-------|-------------|------------------|
| api_keys | user_id → auth.users | CASCADE |
| organizations | owner_id → auth.users | CASCADE |
| user_organizations | user_id → auth.users | CASCADE |
| user_organizations | org_id → organizations | CASCADE |
| repositories | user_id → auth.users | CASCADE |
| repositories | org_id → organizations | CASCADE |
| index_jobs | repository_id → repositories | CASCADE |
| indexed_files | repository_id → repositories | CASCADE |
| symbols | file_id → indexed_files | CASCADE |
| references | source_file_id → indexed_files | CASCADE |
| references | target_symbol_id → symbols | SET NULL |
| dependencies | repository_id → repositories | CASCADE |

**Note**: Deleting a repository cascades to all indexed files, symbols, references, and dependencies. Consider implementing soft deletes for production.

---

## Migration Tracking

The `migrations` table tracks applied schema migrations:

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| name | text | Migration file name (unique) |
| applied_at | timestamptz | Application timestamp |

Migrations are managed by `src/db/migrate.ts` and `src/db/rollback.ts`.

---

## Performance Considerations

1. **Full-Text Search**: Use `idx_indexed_files_content_fts` for content search with `to_tsquery()`
2. **Rate Limiting**: `increment_rate_limit()` uses `INSERT ... ON CONFLICT` for atomic updates
3. **Connection Pooling**: Supabase provides automatic connection pooling (pgBouncer)
4. **Partial Indexes**: Enabled keys use partial index for faster lookups
5. **Cascade Deletes**: Be cautious with repository deletion in production (consider soft deletes)

---

## Security Best Practices

1. **API Key Storage**: Never store plaintext secrets; always use bcrypt hashing
2. **RLS Testing**: Test policies with multiple `app.user_id` contexts before deploying
3. **Service Role**: Use service role client only for admin operations and background jobs
4. **Rate Limiting**: Enforce rate limits at middleware level before database queries
5. **Input Validation**: Validate all user inputs before database queries to prevent injection

---

## Schema Version

Current schema version: **001** (initial migration)

Last updated: 2025-10-07
