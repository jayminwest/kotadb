# Feature Plan: Project/Workspace Management for Multi-Repo Grouping

## Metadata

- **Issue**: #431
- **Title**: feat: add project/workspace management for multi-repo grouping and auto-reindex
- **Type**: Feature
- **Priority**: High
- **Effort**: Large
- **Components**: Backend, API, Database
- **Status**: Needs Investigation

## Overview

### Problem

Currently, KotaDB mixes search results across all repositories a user has indexed, making it difficult to scope searches to relevant codebases. Users working with multi-repository projects (e.g., monorepos split across multiple Git repos) lack a way to:
- Group related repositories into logical projects
- Automatically reindex repositories when starting new Claude Code sessions
- Configure repository indexing via `.mcp.json` for seamless integration
- Search within specific project scopes

### Desired Outcome

Add project/workspace management capabilities that enable:
1. **Client-side repo configuration** - `.mcp.json` includes GitHub URL(s) for automatic indexing when Claude Code opens
2. **Auto-reindex on auth ping** - When authenticated client pings API, trigger reindex for configured repositories (with throttling to prevent spam)
3. **Web UI CRUD operations** - Full repository management interface (create, read, update, delete indexed repos)
4. **Multi-repo groups (Projects)** - Group multiple repositories into logical projects for unified search scope

### Non-Goals

- Real-time synchronization (WebSocket/SSE) - use periodic polling instead
- Git submodule integration (out of scope)
- Project templates or shared configurations (follow-up feature)
- Organization-level project sharing (team features deferred to follow-up)

## Technical Approach

### Architecture Notes

- **Database Layer**: Add `projects` and `project_repositories` tables with many-to-many relationship
- **RLS Policies**: Follow existing patterns from `repositories` and `organizations` tables for multi-tenant isolation
- **API Routes**: RESTful endpoints under `/api/projects` and `/api/repositories`
- **Auto-reindex**: Middleware hook on authenticated requests to detect session start and trigger reindex
- **MCP Integration**: Server reads `.mcp.json` on startup and upserts projects via API

### Key Modules to Touch

- `app/src/db/migrations/` - Add new schema for projects
- `app/src/api/routes.ts` - Add project and repository management endpoints (app/src/api/routes.ts:48-1020)
- `app/src/api/queries.ts` - Add project CRUD functions and search scoping logic
- `app/src/auth/middleware.ts` - Add auto-reindex detection logic
- `app/src/mcp/tools.ts` - Update search_code tool to accept project parameter (app/src/mcp/tools.ts:1-500)
- `shared/types/` - Add Project and ProjectRepository entity types

### Data/API Impacts

- **Breaking Changes**: None (backward compatible - existing single-repo workflows continue to work)
- **New Tables**: `projects`, `project_repositories`
- **New Endpoints**:
  - `POST /api/projects` - Create project
  - `GET /api/projects` - List projects
  - `GET /api/projects/:id` - Get project details
  - `PATCH /api/projects/:id` - Update project
  - `DELETE /api/projects/:id` - Delete project
  - `POST /api/projects/:id/reindex` - Trigger reindex for all repos
  - `GET /api/repositories` - List indexed repos
  - `POST /api/repositories` - Add repository
  - `PATCH /api/repositories/:id` - Update repository
  - `DELETE /api/repositories/:id` - Remove repository
- **Schema Changes**: New `project_id` column in search queries (optional, for scoping)
- **MCP Changes**: `search_code` tool accepts optional `project` parameter

## Relevant Files

### Existing Files (Modification Required)

- `app/src/db/migrations/20241001000001_initial_schema.sql` - Reference for RLS policy patterns (lines 1-525)
- `app/src/api/routes.ts` - Add project/repository endpoints (lines 48-1020)
- `app/src/api/queries.ts` - Add project CRUD functions and update searchFiles() (lines 1-100)
- `app/src/auth/middleware.ts` - Add auto-reindex detection
- `app/src/mcp/tools.ts` - Update search_code tool (lines 1-500)
- `shared/types/entities.ts` - Reference for entity type patterns (lines 1-253)
- `app/src/indexer/repos.ts` - Trigger reindex for projects
- `app/tests/api/routes.test.ts` - Add project endpoint tests
- `app/tests/mcp/tools.test.ts` - Update search_code tests

### New Files

- `app/src/db/migrations/20251111000000_add_projects_and_project_repositories.sql` - Project schema migration
- `app/src/api/projects.ts` - Project CRUD operations (helper functions for routes.ts)
- `app/src/api/repositories.ts` - Repository CRUD operations (helper functions for routes.ts)
- `app/tests/integration/projects.test.ts` - Integration tests for project CRUD
- `app/tests/integration/auto-reindex.test.ts` - Auto-reindex workflow tests
- `app/tests/integration/project-search-scoping.test.ts` - Search scoping tests
- `shared/types/projects.ts` - Project and ProjectRepository entity types

## Task Breakdown

### Phase 1: Database Schema & RLS Policies

1. Create migration `20251111000000_add_projects_and_project_repositories.sql` with:
   - `projects` table (id, user_id, org_id, name, description, created_at, updated_at, metadata)
   - `project_repositories` join table (project_id, repository_id, added_at)
   - Indexes for performance (user_id, org_id, project_id, repository_id)
   - RLS policies following `repositories` patterns for multi-tenant isolation
   - Unique constraint on project names per user/org
2. Add entity types in `shared/types/projects.ts` (Project, ProjectRepository interfaces)
3. Sync migration to `app/supabase/migrations/` directory
4. Validate with `bun run test:validate-migrations`

### Phase 2: API Endpoints - Projects

1. Create `app/src/api/projects.ts` with helper functions:
   - `createProject(supabase, userId, name, description, repoIds)`
   - `listProjects(supabase, userId)`
   - `getProject(supabase, userId, projectId)`
   - `updateProject(supabase, userId, projectId, updates)`
   - `deleteProject(supabase, userId, projectId)`
   - `addRepositoryToProject(supabase, userId, projectId, repoId)`
   - `removeRepositoryFromProject(supabase, userId, projectId, repoId)`
2. Add routes in `app/src/api/routes.ts`:
   - `POST /api/projects` - Create project with repo list
   - `GET /api/projects` - List user/org projects
   - `GET /api/projects/:id` - Get project with repos
   - `PATCH /api/projects/:id` - Update project metadata
   - `DELETE /api/projects/:id` - Delete project (cascade to join table)
   - `POST /api/projects/:id/reindex` - Trigger reindex for all repos in project
3. Add rate limit headers to all new endpoints

### Phase 3: API Endpoints - Repositories

1. Create `app/src/api/repositories.ts` with helper functions:
   - `listRepositories(supabase, userId, projectId?)`
   - `getRepository(supabase, userId, repoId)`
   - `updateRepository(supabase, userId, repoId, updates)`
   - `deleteRepository(supabase, userId, repoId)`
2. Add routes in `app/src/api/routes.ts`:
   - `GET /api/repositories?project_id=<uuid>` - List repos (optionally filtered by project)
   - `PATCH /api/repositories/:id` - Update repo metadata (name, description)
   - `DELETE /api/repositories/:id` - Remove repo from index (soft delete or hard delete based on policy)
3. Ensure backward compatibility with existing `/index` endpoint

### Phase 4: Search Scoping by Project

1. Update `searchFiles()` in `app/src/api/queries.ts`:
   - Accept optional `projectId` parameter
   - Join with `project_repositories` to filter by project's repos
   - Maintain backward compatibility (no project filter = search all repos)
2. Add `project_id` query parameter to `GET /search` endpoint in `app/src/api/routes.ts`
3. Update MCP `search_code` tool in `app/src/mcp/tools.ts`:
   - Accept optional `project` parameter (project name or ID)
   - Resolve project name to ID via database lookup
   - Pass `projectId` to `searchFiles()`
4. Update `shared/types/mcp-tools.ts` with `project?: string` in SearchCodeInput

### Phase 5: Auto-Reindex on Auth Ping

1. Add session tracking logic in `app/src/auth/middleware.ts`:
   - Detect first auth ping per session (use JWT `iat` claim or track last-seen in database)
   - Query user's projects and their repositories
   - Check `repositories.last_indexed_at` for each repo
   - Enqueue indexing jobs for repos not indexed in last hour (configurable threshold)
   - Track reindex triggers in metadata to prevent spam (max 1 auto-reindex per hour per user)
2. Add configuration:
   - `AUTO_REINDEX_ENABLED` env var (default: false, opt-in)
   - `AUTO_REINDEX_THRESHOLD_HOURS` env var (default: 1)
3. Return `X-Auto-Reindex-Triggered` header with job count on auth responses
4. Add logging for observability (`[Auto-Reindex] Triggered for user ${userId}: ${jobCount} jobs`)

### Phase 6: `.mcp.json` Configuration Support

1. Document `.mcp.json` schema in `docs/mcp-configuration.md`:
   ```json
   {
     "mcpServers": {
       "kotadb": {
         "command": "bun",
         "args": ["run", "kotadb-mcp-server"],
         "env": { "KOTADB_API_KEY": "kota_..." },
         "projects": [
           {
             "name": "my-monorepo",
             "repositories": ["owner/repo-api", "owner/repo-web"]
           }
         ]
       }
     }
   }
   ```
2. Update MCP server initialization in `app/src/mcp/server.ts`:
   - Read `projects` config from environment or CLI args
   - On startup, call `POST /api/projects` for each project (idempotent upsert by name)
   - For each repository, call `POST /index` if not already indexed
   - Link repositories to project via join table
3. Add error handling for authentication failures, API errors, and malformed config
4. Add logging for observability

### Phase 7: Integration Tests

1. Create `app/tests/integration/projects.test.ts`:
   - Test project CRUD operations with RLS validation
   - Test adding/removing repositories from projects
   - Test project deletion (cascade behavior)
   - Test concurrent operations (race conditions, deadlocks)
2. Create `app/tests/integration/auto-reindex.test.ts`:
   - Test auto-reindex trigger on auth ping
   - Test threshold logic (don't reindex if recently indexed)
   - Test rate limiting (max 1 auto-reindex per hour per user)
   - Test error handling (queue failures, invalid repos)
3. Create `app/tests/integration/project-search-scoping.test.ts`:
   - Test search with project filter (returns only repos in project)
   - Test search without filter (returns all repos)
   - Test multi-repo project search
   - Test MCP `search_code` tool with project parameter
4. Update `app/tests/mcp/tools.test.ts`:
   - Add tests for `search_code` with `project` parameter
   - Test error handling for invalid project names/IDs

### Phase 8: Documentation & Validation

1. Update API documentation:
   - Add project endpoints to OpenAPI spec (if exists)
   - Document query parameters and request/response formats
   - Document error codes (404 for not found, 400 for validation)
2. Update MCP tool documentation:
   - Add `project` parameter to `search_code` examples
   - Document project resolution behavior (name vs ID)
3. Add user-facing documentation:
   - How to create projects via API
   - How to configure `.mcp.json` for auto-indexing
   - How to enable auto-reindex feature
4. Run validation commands:
   - `bun run lint`
   - `bun run typecheck`
   - `bun test --filter integration`
   - `bun test`
   - `bun run build`
   - `bun run test:validate-migrations`
5. Push branch for PR

## Step by Step Tasks

### Planning & Setup

1. Create feature branch `feat/431-project-workspace-management` from `develop`
2. Review existing database schema and RLS patterns in `app/src/db/migrations/20241001000001_initial_schema.sql`
3. Review existing API route patterns in `app/src/api/routes.ts`

### Database Schema Implementation

4. Create migration file `app/src/db/migrations/20251111000000_add_projects_and_project_repositories.sql`
5. Define `projects` table with RLS policies
6. Define `project_repositories` join table with indexes
7. Copy migration to `app/supabase/migrations/` directory
8. Run `bun run test:validate-migrations` to ensure sync
9. Create `shared/types/projects.ts` with Project and ProjectRepository interfaces

### API Implementation - Projects

10. Create `app/src/api/projects.ts` with CRUD helper functions
11. Add `POST /api/projects` endpoint in `app/src/api/routes.ts`
12. Add `GET /api/projects` endpoint
13. Add `GET /api/projects/:id` endpoint
14. Add `PATCH /api/projects/:id` endpoint
15. Add `DELETE /api/projects/:id` endpoint
16. Add `POST /api/projects/:id/reindex` endpoint

### API Implementation - Repositories

17. Create `app/src/api/repositories.ts` with helper functions
18. Add `GET /api/repositories` endpoint (with optional project filter)
19. Add `PATCH /api/repositories/:id` endpoint
20. Add `DELETE /api/repositories/:id` endpoint

### Search Scoping

21. Update `searchFiles()` in `app/src/api/queries.ts` to accept `projectId` parameter
22. Add project filtering logic to search query (join with project_repositories)
23. Add `project_id` query parameter to `GET /search` endpoint
24. Update MCP `search_code` tool to accept `project` parameter
25. Add project name-to-ID resolution logic

### Auto-Reindex Implementation

26. Add session detection logic in `app/src/auth/middleware.ts`
27. Add auto-reindex threshold check (last_indexed_at comparison)
28. Add rate limiting for auto-reindex (max 1 per hour per user)
29. Add configuration via environment variables
30. Add `X-Auto-Reindex-Triggered` response header

### MCP Configuration Support

31. Document `.mcp.json` schema in `docs/mcp-configuration.md`
32. Update MCP server to read `projects` config on startup
33. Add project upsert logic (idempotent by name)
34. Add repository indexing trigger for configured repos
35. Add error handling and logging

### Testing - Integration

36. Create `app/tests/integration/projects.test.ts` with CRUD tests
37. Create `app/tests/integration/auto-reindex.test.ts` with auto-reindex tests
38. Create `app/tests/integration/project-search-scoping.test.ts` with search tests
39. Update `app/tests/mcp/tools.test.ts` with project parameter tests
40. Run `bun test --filter integration` to validate

### Testing - Full Suite

41. Run `bun test` to execute all tests
42. Fix any failing tests or edge cases discovered
43. Add additional test coverage for error paths

### Documentation & Finalization

44. Update API documentation with new endpoints
45. Update MCP tool documentation with project parameter
46. Add user-facing documentation for `.mcp.json` configuration
47. Run `bun run lint` and fix any issues
48. Run `bun run typecheck` and fix any type errors
49. Run `bun run build` to ensure production build succeeds
50. Run `bun run test:validate-migrations` final check
51. Push branch with `git push -u origin feat/431-project-workspace-management`

## Risks & Mitigations

### Risk: Auto-reindex spam overwhelming queue

**Mitigation**:
- Implement strict rate limiting (max 1 auto-reindex per hour per user)
- Track last auto-reindex timestamp in user metadata
- Make auto-reindex opt-in via `AUTO_REINDEX_ENABLED` env var
- Add queue depth monitoring in `/health` endpoint

### Risk: Project name collisions

**Mitigation**:
- Enforce unique constraint on `(user_id, name)` and `(org_id, name)`
- Return 409 Conflict error on duplicate project creation
- Provide helpful error messages with resolution steps

### Risk: Cascading deletes orphaning repositories

**Mitigation**:
- Use soft delete for projects (add `deleted_at` column)
- OR document cascade behavior clearly in API docs
- Add confirmation prompt in Web UI for destructive operations
- Allow repositories to exist without projects (optional relationship)

### Risk: Search performance degradation with project joins

**Mitigation**:
- Add proper indexes on `project_repositories` (project_id, repository_id)
- Test search performance with large project sizes (>100 repos)
- Consider materialized view for frequently accessed project-repo mappings
- Add query logging to identify slow queries

### Risk: `.mcp.json` configuration parsing failures

**Mitigation**:
- Use schema validation (Zod) for config parsing
- Provide clear error messages for malformed config
- Add fallback to manual project creation if config fails
- Document config schema with examples

## Validation Strategy

### Automated Tests

**Unit Tests** (via `bun test`):
- Project CRUD operations with RLS validation
- Repository CRUD with project associations
- Search scoping logic (with and without project filter)
- Auto-reindex trigger logic (threshold checks, rate limiting)
- `.mcp.json` parsing and validation

**Integration Tests** (via `bun test --filter integration`):
- End-to-end project creation → repo addition → search scoping
- Auto-reindex on auth ping (real webhook simulation)
- Multi-repo search with project filter
- Concurrent project operations (race conditions, deadlocks)
- RLS policy enforcement (users can't access other users' projects)

**MCP Tests** (via `bun test --filter mcp`):
- MCP server reads `.mcp.json` and upserts projects
- `search_code` tool respects `project` parameter
- Error handling for invalid configuration

### Manual Checks

1. **Data Seeding**: Create test user with multiple projects and repositories
2. **Search Scoping**: Verify search results filtered by project contain only expected repos
3. **Auto-Reindex**: Simulate session start and verify reindex jobs enqueued
4. **MCP Configuration**: Test `.mcp.json` parsing with various config formats
5. **Failure Scenarios**: Test with invalid project IDs, missing repos, auth failures

### Release Guardrails

- **Monitoring**: Add metrics for auto-reindex job counts, project creation rate, search performance
- **Alerting**: Alert on high auto-reindex rate (>100 jobs/min), search query timeouts (>5s)
- **Rollback Plan**: Feature flag `AUTO_REINDEX_ENABLED` allows disabling auto-reindex if issues arise
- **Database Rollback**: Migration includes DROP statements for easy rollback if needed

## Validation Commands

```bash
# Linting
bun run lint

# Type checking
bun run typecheck

# Integration tests
bun test --filter integration

# Full test suite
bun test

# Production build
bun run build

# Migration sync validation
bun run test:validate-migrations

# Manual testing (requires Supabase Local running)
cd app && ./scripts/dev-start.sh
```

## Issue Relationships

- **Related To**: #418 (auto-reindexing with throttling) - Shares reindex logic and job queueing
- **Related To**: #384 (local repository indexing) - Local path repos need project support
- **Blocks**: Organization-level project sharing (team features)
- **Follow-Up**: Project templates, shared project configurations for teams

## Open Questions

1. **Auto-reindex threshold**: 1 hour? 6 hours? Should this be configurable per project?
   - **Decision**: Start with 1 hour, make configurable via `AUTO_REINDEX_THRESHOLD_HOURS` env var

2. **Session detection**: Use JWT `iat` claim, or track last-seen timestamps in database?
   - **Decision**: Use JWT `iat` claim for stateless detection, track last auto-reindex in user metadata

3. **GitHub URL format in `.mcp.json`**: Support both `owner/repo` and full HTTPS URLs?
   - **Decision**: Accept both formats, normalize to `owner/repo` in validation layer

4. **Default project**: Auto-assign repos to "Default Project" if not explicitly grouped?
   - **Decision**: No default project - repos can exist independently. Opt-in grouping only.

5. **Search behavior without project filter**: Mix all repos (current) or require explicit project selection?
   - **Decision**: Maintain backward compatibility - search all repos if no project filter specified

## Acceptance Criteria (from Issue)

### 1. Project Data Model ✓
- [x] Database schema supports Projects (id, name, user_id/org_id, created_at, updated_at, metadata)
- [x] Project-Repository join table (many-to-many relationship)
- [x] RLS policies for multi-tenant isolation
- [x] Migration adds tables with proper indexes and constraints

### 2. API Endpoints ✓
- [x] `POST /api/projects` - Create new project with repository list
- [x] `GET /api/projects` - List user/org projects
- [x] `GET /api/projects/:id` - Get project details with associated repos
- [x] `PATCH /api/projects/:id` - Update project (name, repo list)
- [x] `DELETE /api/projects/:id` - Delete project
- [x] `POST /api/projects/:id/reindex` - Trigger reindex for all repos in project
- [x] `GET /api/repositories` - List indexed repositories with project associations
- [x] `POST /api/repositories` - Add repository to index (existing `/index` endpoint)
- [x] `PATCH /api/repositories/:id` - Update repository metadata
- [x] `DELETE /api/repositories/:id` - Remove repository from index

### 3. Auto-Reindex on Auth Ping ✓
- [x] Detect first auth ping per session
- [x] Query configured repos for authenticated user
- [x] Enqueue indexing jobs for repos not indexed recently (1 hour threshold)
- [x] Return 202 Accepted with job IDs if reindex triggered
- [x] Add `X-Auto-Reindex-Triggered` header with job count

### 4. `.mcp.json` Configuration Support ✓
- [x] Document `.mcp.json` schema with `kotadb.projects` field
- [x] MCP server reads configuration on startup
- [x] Upsert projects via API during initialization
- [x] Handle authentication and error cases gracefully

### 5. Web UI Implementation (Deferred to Follow-Up)
- [ ] Projects page (`/projects`) - List, create, delete projects
- [ ] Project detail page (`/projects/:id`) - View/edit repos, trigger reindex
- [ ] Repositories page (`/repositories`) - List all indexed repos with project tags
- [ ] Add repository modal - Search GitHub repos, assign to project
- [ ] Edit repository modal - Update metadata, change project assignment
- [ ] Delete confirmation dialogs with cascade warnings

**Note**: Web UI implementation deferred to separate issue - this feature focuses on API foundation

### 6. Search Scoping ✓
- [x] Add `project_id` query parameter to `/search` endpoint
- [x] Update `searchFiles()` to filter by project's repositories
- [x] MCP `search_code` tool accepts optional `project` parameter
- [ ] Web UI search includes project filter dropdown (deferred with Web UI)
