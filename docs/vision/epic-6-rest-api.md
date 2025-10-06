# Epic 6: REST API Migration

**Status**: Not Started
**Priority**: High (Frontend dependency)
**Estimated Duration**: 1 week

## Overview

Migrate existing REST API to Supabase, add repository management endpoints, create OpenAPI specification for frontend coordination.

## Issues

### Issue #19: Create OpenAPI specification

**Priority**: P1 (High)
**Depends on**: None (can start early)
**Blocks**: Frontend integration

#### Description
Document all REST API endpoints in OpenAPI 3.0 format. Generate TypeScript types for frontend consumption.

#### Acceptance Criteria
- [ ] OpenAPI 3.0 spec covering all endpoints
- [ ] Request/response schemas defined
- [ ] Authentication requirements documented
- [ ] Error responses documented (400, 401, 403, 404, 429, 500)
- [ ] TypeScript types generated via `openapi-typescript`
- [ ] Hosted spec for frontend access (in git or endpoint)

#### Technical Notes
- Use OpenAPI 3.0 or 3.1
- Store spec in `docs/openapi.yaml`
- CI validates implementation matches spec (future)
- Frontend runs `openapi-typescript docs/openapi.yaml -o types/api.ts`

#### Files to Create
- `docs/openapi.yaml` - Complete OpenAPI specification
- `scripts/generate-types.sh` - Type generation script

#### Endpoints to Document
```yaml
paths:
  /health:
    get: # Health check
  /api/search:
    get: # Search indexed files
  /api/files/recent:
    get: # Recent indexed files
  /api/repositories:
    get: # List user's repositories
    post: # Add repository to track
  /api/repositories/{id}:
    get: # Get repository details
    patch: # Update repository settings
    delete: # Stop tracking repository
  /api/jobs:
    get: # List indexing jobs
  /api/jobs/{id}:
    get: # Get job status
```

---

### Issue #20: Migrate existing endpoints to Supabase

**Priority**: P0 (Critical)
**Depends on**: #2 (Supabase client), #5 (auth), #11 (indexed data)
**Blocks**: Frontend UX

#### Description
Migrate `/search`, `/files/recent`, and `/index` endpoints to use Supabase instead of SQLite.

#### Acceptance Criteria
- [ ] GET /search queries `indexed_files` with full-text search
- [ ] GET /files/recent queries `indexed_files` ordered by `indexed_at`
- [ ] POST /index creates repository and queues job
- [ ] All endpoints require authentication
- [ ] Responses match OpenAPI spec
- [ ] Maintain backward compatibility during transition

#### Technical Notes
- Use Supabase `.textSearch()` for full-text search
- Apply RLS automatically via authenticated client
- Filter by `user_id` implicitly (RLS handles it)
- Pagination via `limit` and `offset` parameters

#### Files to Update
- `src/api/queries.ts` - Query functions
- `src/api/routes.ts` - Route handlers

#### Example: Search Endpoint
```typescript
// GET /api/search?term=foo&limit=20
export async function searchCode(
  request: Request,
  context: AuthContext
): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const term = searchParams.get('term')
  const limit = Number(searchParams.get('limit') ?? '20')
  const project = searchParams.get('project')

  if (!term) {
    return new Response(JSON.stringify({ error: 'Missing term parameter' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  let query = supabase
    .from('indexed_files')
    .select('id, path, content, language, repository_id, repositories(full_name)')
    .textSearch('content', term)
    .limit(limit)

  if (project) {
    query = query.eq('repositories.full_name', project)
  }

  const { data, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ results: data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
```

---

### Issue #21: Add repository management endpoints

**Priority**: P1 (High)
**Depends on**: #5 (auth), #16 (GitHub tokens)
**Blocks**: Frontend repo selection

#### Description
Build endpoints for adding, listing, updating, and removing tracked repositories.

#### Acceptance Criteria
- [ ] POST /api/repositories adds new repository
  - Validates user has access via GitHub App
  - Stores `installation_id` and `full_name`
  - Triggers initial indexing job
- [ ] GET /api/repositories lists user's repos with status
- [ ] GET /api/repositories/:id returns details with latest job
- [ ] PATCH /api/repositories/:id updates settings (e.g., branch to index)
- [ ] DELETE /api/repositories/:id stops tracking (soft delete or hard?)
- [ ] All endpoints enforce user ownership (RLS)

#### Technical Notes
- Verify user access via GitHub API before adding repo
- Store GitHub `installation_id` for token generation
- Initial index job queued on POST

#### Files to Create
- `src/api/repositories.ts` - Repository management handlers

#### Example: Add Repository
```typescript
// POST /api/repositories
// Body: { fullName: "owner/repo", installationId: 12345 }
export async function addRepository(
  request: Request,
  context: AuthContext
): Promise<Response> {
  const body = await request.json()
  const { fullName, installationId } = body

  if (!fullName || !installationId) {
    return new Response(JSON.stringify({ error: 'Missing fullName or installationId' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const [owner, repoName] = fullName.split('/')

  // Verify user has access via GitHub App
  const octokit = await getOctokitForInstallation(installationId)
  const { data: repo } = await octokit.rest.repos.get({ owner, repo: repoName })

  if (!repo) {
    return new Response(JSON.stringify({ error: 'Repository not found or no access' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  const { data: dbRepo, error } = await supabase
    .from('repositories')
    .insert({
      user_id: context.userId,
      full_name: fullName,
      installation_id: installationId,
      default_branch: repo.default_branch,
    })
    .select()
    .single()

  if (error || !dbRepo) {
    return new Response(JSON.stringify({ error: error?.message ?? 'Failed to persist repository' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Queue initial indexing job
  const jobId = await createIndexJob(dbRepo.id, repo.default_branch)

  return new Response(JSON.stringify({ repository: dbRepo, jobId }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  })
}
```

---

### Issue #22: Add job status polling endpoints

**Priority**: P1 (High)
**Depends on**: #13 (job tracking)
**Blocks**: Frontend status UX

#### Description
Expose indexing job status for frontend polling and progress displays.

#### Acceptance Criteria
- [ ] GET /api/jobs lists jobs for user's repositories
  - Filter by repository, status
  - Paginate results
  - Include job metadata and stats
- [ ] GET /api/jobs/:id returns single job details
  - Include progress, logs, errors
  - Include repository info
- [ ] Both endpoints enforce user ownership (RLS)

#### Technical Notes
- Join `index_jobs` with `repositories` to filter by user
- Return job stats (`filesProcessed`, `symbolsExtracted`)
- Frontend polls every 5 seconds while jobs are pending/processing

#### Files to Create
- `src/api/jobs.ts` - Job status handlers

#### Example: List Jobs
```typescript
// GET /api/jobs?repository_id=uuid&status=processing
export async function listJobs(
  request: Request,
  context: AuthContext
): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const repositoryId = searchParams.get('repository_id')
  const status = searchParams.get('status')
  const limit = Number(searchParams.get('limit') ?? '50')

  let query = supabase
    .from('index_jobs')
    .select('*, repositories!inner(*)')
    .eq('repositories.user_id', context.userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (repositoryId) {
    query = query.eq('repository_id', repositoryId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ jobs: data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
```

---

## Success Criteria

- [ ] OpenAPI spec is complete and accurate
- [ ] All existing endpoints migrated to Supabase
- [ ] Repository management endpoints functional
- [ ] Job status endpoints provide real-time visibility
- [ ] Frontend can generate types from OpenAPI spec
- [ ] All endpoints protected by authentication and RLS

## Dependencies for Other Epics

This epic enables:
- Frontend repository selection and status tracking
- User onboarding flow (add repo → index → query)
