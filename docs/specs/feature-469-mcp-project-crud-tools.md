# Feature Plan: MCP Project CRUD Tools

## Metadata

- **Issue**: #469
- **Title**: feat: add MCP tools for project CRUD operations
- **Component**: Backend, API
- **Priority**: Medium
- **Effort**: Small (~1 day)
- **Status**: Needs Investigation

## Overview

### Problem

Currently, KotaDB's MCP integration supports project-scoped code search via the `search_code` tool's `project` parameter (implemented in #446), but lacks MCP tools for creating and managing projects. This forces users to:
1. Use REST API endpoints to create projects
2. Use REST API endpoints to associate repositories with projects
3. Only then use MCP `search_code` with project scoping

This breaks the agent-native workflow where Claude Code should be able to discover, create, and manage projects entirely through MCP tools without manual API calls.

### Desired Outcome

Add seven MCP tools (`create_project`, `list_projects`, `get_project`, `update_project`, `delete_project`, `add_repository_to_project`, `remove_repository_from_project`) that wrap existing project API layer functions, enabling complete project lifecycle management through MCP.

### Business Value

- **Agent-native workflow**: Claude Code can discover, create, and manage projects entirely through MCP tools
- **Self-service project setup**: Users can ask Claude to "create a project for my frontend repos" without manual API calls
- **Improved discoverability**: Agents can list available projects and suggest relevant scopes for searches
- **Complete MCP coverage**: Matches REST API capabilities (all `/api/projects` endpoints accessible via MCP)

### Non-Goals

- Auto-reindexing repositories when added to projects (covered by #467 Phase 3)
- `.mcp.json` configuration file support (covered by #467 Phase 3)
- Project workspace UI enhancements (frontend work, separate effort)
- Organization-level project management (future enhancement)

## Technical Approach

### Architecture

All seven MCP tools will be **thin wrappers** around existing API layer functions in `app/src/api/projects.ts`:

```typescript
// Existing API functions (already implemented in #446)
- createProject(client, userId, request)
- listProjects(client, userId)
- getProject(client, userId, projectId)
- updateProject(client, userId, projectId, updates)
- deleteProject(client, userId, projectId)
- addRepositoryToProject(client, userId, projectId, repositoryId)
- removeRepositoryFromProject(client, userId, projectId, repositoryId)
```

**Key Design Decisions**:

1. **Project Identifier Resolution**: Support both UUID and name-based lookups (case-insensitive)
   - Example: `project: "my-frontend"` or `project: "550e8400-e29b-41d4-a716-446655440000"`
   - Reuse existing pattern from `executeSearchCode()` (lines 392-443 in `app/src/mcp/tools.ts`)

2. **Idempotent Operations**:
   - `add_repository_to_project`: Duplicate associations return success (no error)
   - `remove_repository_from_project`: Non-existent associations return success (no error)

3. **RLS Enforcement**: All operations respect Supabase Row-Level Security policies
   - Users can only access/modify their own projects
   - Cross-user access attempts return "Project not found" errors

### Key Modules to Touch

1. **`app/src/mcp/tools.ts`**: Add tool definitions, validation, and execution functions (~300-400 lines)
2. **`app/src/mcp/server.ts`**: No changes required (tool registration happens via `getToolDefinitions()`)
3. **`app/tests/mcp/project-crud.test.ts`**: New integration test file (~250-300 lines)
4. **Documentation**: MCP integration guide, tool reference, conditional docs

### Data/API Impacts

- **No database changes**: All schema exists from #446 (PR merged)
- **No REST API changes**: All endpoints exist from #446
- **MCP tool definitions**: 7 new tools registered via `getToolDefinitions()`
- **Authentication**: All tools require valid API key via `Authorization` header

## Relevant Files

### Existing Files to Modify

- **`app/src/mcp/tools.ts`** — Add 7 tool definitions, validation, and execution functions; update `getToolDefinitions()` and `handleToolCall()`
- **`.claude/commands/docs/mcp-integration.md`** — Document new project CRUD tools with examples
- **`.claude/commands/docs/conditional_docs/app.md`** — Add project CRUD MCP tools entry
- **`README.md`** (or `docs/api/mcp-tools.md`) — Update MCP tool list with project CRUD operations

### New Files

- **`app/tests/mcp/project-crud.test.ts`** — Integration tests for all 7 project CRUD tools

### Related Context

- **`app/src/api/projects.ts`** — API layer functions being wrapped
- **`shared/types/projects.ts`** — Type definitions for project entities
- **`app/tests/mcp/tools.test.ts`** — Existing MCP tool tests (pattern reference)
- **`docs/specs/feature-431-project-workspace-management.md`** — Original project management spec

## Task Breakdown

### Phase 1: Tool Definitions and Helper Functions

**Goal**: Define all 7 MCP tools and implement project identifier resolution helper.

1. Add `CREATE_PROJECT_TOOL` definition to `app/src/mcp/tools.ts`
   - Input schema: `name` (required), `description` (optional), `repository_ids` (optional array)
   - Description: "Create a new project with optional repository associations"

2. Add `LIST_PROJECTS_TOOL` definition
   - Input schema: `limit` (optional number, default 20)
   - Description: "List all projects for the authenticated user with repository counts"

3. Add `GET_PROJECT_TOOL` definition
   - Input schema: `project` (required, UUID or name)
   - Description: "Get project details with full repository list"

4. Add `UPDATE_PROJECT_TOOL` definition
   - Input schema: `project` (required), `name` (optional), `description` (optional), `repository_ids` (optional array)
   - Description: "Update project name, description, and/or repository associations"

5. Add `DELETE_PROJECT_TOOL` definition
   - Input schema: `project` (required, UUID or name)
   - Description: "Delete project (cascade deletes associations, repositories remain indexed)"

6. Add `ADD_REPOSITORY_TO_PROJECT_TOOL` definition
   - Input schema: `project` (required), `repository_id` (required UUID)
   - Description: "Add a repository to a project (idempotent)"

7. Add `REMOVE_REPOSITORY_FROM_PROJECT_TOOL` definition
   - Input schema: `project` (required), `repository_id` (required UUID)
   - Description: "Remove a repository from a project (idempotent)"

8. Implement `resolveProjectId()` helper function
   - Try UUID regex match first: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
   - Fallback to case-insensitive name lookup: `.ilike("name", projectIdentifier)`
   - Return project UUID or throw "Project not found" error
   - Respect RLS via `user_id` filter

9. Update `getToolDefinitions()` to include all 7 new tools

### Phase 2: Tool Execution Functions

**Goal**: Implement execution functions for all 7 tools with parameter validation.

10. Implement `executeCreateProject(supabase, params, requestId, userId)`
    - Validate required `name` parameter
    - Validate optional `description` and `repository_ids` parameters
    - Call `createProject()` from `@api/projects`
    - Return `{ projectId: string, name: string }`

11. Implement `executeListProjects(supabase, params, requestId, userId)`
    - Validate optional `limit` parameter (default 20)
    - Call `listProjects()` from `@api/projects`
    - Return `{ projects: ProjectListItem[] }`

12. Implement `executeGetProject(supabase, params, requestId, userId)`
    - Validate required `project` parameter
    - Resolve project identifier via `resolveProjectId()`
    - Call `getProject()` from `@api/projects`
    - Return `ProjectWithRepos` or "Project not found" error

13. Implement `executeUpdateProject(supabase, params, requestId, userId)`
    - Validate required `project` parameter
    - Validate at least one update field present (`name`, `description`, or `repository_ids`)
    - Resolve project identifier via `resolveProjectId()`
    - Call `updateProject()` from `@api/projects`
    - Return `{ success: true, message: "Project updated" }`

14. Implement `executeDeleteProject(supabase, params, requestId, userId)`
    - Validate required `project` parameter
    - Resolve project identifier via `resolveProjectId()`
    - Call `deleteProject()` from `@api/projects`
    - Return `{ success: true, message: "Project deleted" }`

15. Implement `executeAddRepositoryToProject(supabase, params, requestId, userId)`
    - Validate required `project` and `repository_id` parameters
    - Resolve project identifier via `resolveProjectId()`
    - Verify repository exists and belongs to user
    - Call `addRepositoryToProject()` from `@api/projects`
    - Return `{ success: true, message: "Repository added to project" }` (idempotent)

16. Implement `executeRemoveRepositoryFromProject(supabase, params, requestId, userId)`
    - Validate required `project` and `repository_id` parameters
    - Resolve project identifier via `resolveProjectId()`
    - Call `removeRepositoryFromProject()` from `@api/projects`
    - Return `{ success: true, message: "Repository removed from project" }` (idempotent)

17. Update `handleToolCall()` switch statement to include all 7 new tools

### Phase 3: Integration Tests and Documentation

**Goal**: Comprehensive testing and documentation for all MCP project CRUD tools.

18. Create `app/tests/mcp/project-crud.test.ts` with test suite structure
    - Test setup: import helpers from `../helpers/db`, `../helpers/mcp`, `../helpers/server`
    - Use `startTestServer()` and `stopTestServer()` from test helpers
    - Use `createAuthHeader("free")` for authentication

19. Write `create_project` tool tests
    - Test: Create project with name only (returns UUID)
    - Test: Create project with description
    - Test: Create project with repository associations
    - Test: Duplicate project name returns error
    - Test: Missing `name` parameter returns error

20. Write `list_projects` tool tests
    - Test: List projects returns array with repository counts
    - Test: Empty list for new user
    - Test: Respects `limit` parameter
    - Test: RLS enforcement (user B cannot see user A's projects)

21. Write `get_project` tool tests
    - Test: Get project by UUID returns details
    - Test: Get project by name (case-insensitive)
    - Test: Project not found returns helpful error
    - Test: RLS enforcement (cross-user access blocked)

22. Write `update_project` tool tests
    - Test: Update project name
    - Test: Update project description
    - Test: Replace repository associations (full list replacement)
    - Test: Update multiple fields simultaneously
    - Test: RLS enforcement

23. Write `delete_project` tool tests
    - Test: Delete project removes from database
    - Test: Cascade deletes `project_repositories` associations
    - Test: Repositories remain indexed after project deletion
    - Test: RLS enforcement

24. Write `add_repository_to_project` tool tests
    - Test: Add repository to project succeeds
    - Test: Idempotent behavior (adding twice returns success)
    - Test: Invalid repository ID returns error
    - Test: RLS enforcement (cannot add to other user's project)

25. Write `remove_repository_from_project` tool tests
    - Test: Remove repository from project succeeds
    - Test: Idempotent behavior (removing non-existent association returns success)
    - Test: RLS enforcement

26. Write end-to-end workflow test
    - Test: Create project → Add repositories → Search with project scope → Delete project
    - Verify `search_code` respects project scoping after associations

27. Update `.claude/commands/docs/mcp-integration.md`
    - Add "Project Management Tools" section
    - Document all 7 tools with parameter schemas
    - Add usage examples (create project, list projects, project-scoped search)

28. Update `.claude/commands/docs/conditional_docs/app.md`
    - Add entry for MCP project CRUD tools: conditions, files, rationale

29. Update `README.md` or create `docs/api/mcp-tools.md`
    - List all MCP tools with brief descriptions
    - Include project CRUD tools in tool catalog

30. Run validation commands and push branch
    - Execute: `bun run lint`
    - Execute: `bun run typecheck`
    - Execute: `bun test --filter mcp` (run all MCP tests)
    - Execute: `bun test` (full test suite)
    - Execute: `bun run build`
    - Push branch: `git push -u origin feat/469-mcp-project-crud-tools`

## Risks & Mitigations

### Risk: Project Identifier Resolution Ambiguity

**Description**: UUID vs. name lookup could cause confusion if a user has a project named with a UUID-like string.

**Mitigation**:
- UUID regex match takes precedence (exact match first)
- Case-insensitive name lookup only triggers if UUID regex fails
- Document behavior clearly in tool descriptions
- Low probability: UUID-like project names are rare

### Risk: RLS Policy Gaps

**Description**: RLS policies might not fully protect cross-user project access in all MCP tool operations.

**Mitigation**:
- RLS policies already implemented and tested in #446
- Integration tests include cross-user access checks (Phase 3, task 20, 21, 22, 23, 25)
- `user_id` filter applied in all database queries
- Existing project API layer functions enforce RLS correctly

### Risk: Breaking Changes to Existing `search_code` Tool

**Description**: Adding project CRUD tools might inadvertently break existing `search_code` project parameter functionality.

**Mitigation**:
- No changes to `executeSearchCode()` function
- New tools are isolated additions (separate execution functions)
- Existing MCP integration tests continue to pass
- Regression test: verify `search_code` with `project` parameter still works (task 26)

### Risk: Performance Impact of Project Identifier Resolution

**Description**: Name-based project lookups add database queries to every operation.

**Mitigation**:
- UUID lookups are instant (indexed primary key)
- Name lookups use indexed `name` column (unique constraint)
- Impact negligible: single database query per tool call
- Projects table expected to have low row count per user (<100 projects typical)

## Validation Strategy

### Automated Tests

**Coverage**: All 7 MCP tools with parameter validation, RLS enforcement, and error handling.

**Test File**: `app/tests/mcp/project-crud.test.ts`

**Test Categories**:

1. **Tool Registration**: Verify all 7 tools appear in `tools/list` response
2. **Parameter Validation**: Missing required params, invalid types, out-of-range values
3. **CRUD Operations**: Create, read, update, delete with valid inputs
4. **Idempotency**: `add_repository_to_project` and `remove_repository_from_project` duplicate calls
5. **RLS Enforcement**: Cross-user access blocked for all operations
6. **Project Identifier Resolution**: UUID vs. name lookup (case-insensitive)
7. **Integration**: End-to-end workflow with `search_code` project scoping

**Antimocking Compliance**: All tests use real Supabase Local database (no mocks, per `/anti-mock` philosophy).

### Manual Validation Scenarios

**Scenario 1: Agent-Native Project Creation**
1. Start Claude Code with KotaDB MCP server configured
2. Ask Claude: "Create a project called 'frontend-repos' with description 'All React and Next.js repositories'"
3. Verify Claude uses `create_project` MCP tool
4. Verify project created via REST API: `GET /api/projects`
5. Verify response includes project UUID and name

**Scenario 2: Project-Scoped Search Workflow**
1. Index two repositories via `index_repository` MCP tool
2. Create project "test-project" via `create_project`
3. Add first repository via `add_repository_to_project`
4. Search via `search_code` with `project: "test-project"`
5. Verify results only include files from first repository
6. Add second repository to project
7. Re-run search, verify results now include both repositories

**Scenario 3: List and Get Projects**
1. Create 3 projects with different names
2. Ask Claude: "What projects do I have?"
3. Verify Claude uses `list_projects` MCP tool
4. Verify all 3 projects returned with repository counts
5. Ask Claude: "Show me details for 'frontend-repos' project"
6. Verify Claude uses `get_project` MCP tool
7. Verify response includes full repository list

**Scenario 4: Update and Delete Projects**
1. Create project "old-name"
2. Ask Claude: "Rename 'old-name' project to 'new-name'"
3. Verify Claude uses `update_project` MCP tool
4. Verify name changed via `get_project`
5. Ask Claude: "Delete 'new-name' project"
6. Verify Claude uses `delete_project` MCP tool
7. Verify project no longer appears in `list_projects`

**Scenario 5: RLS Enforcement**
1. User A creates project "private-project"
2. User B attempts `get_project` with User A's project UUID
3. Verify "Project not found" error returned (RLS blocks access)
4. User B attempts `update_project` on User A's project
5. Verify operation fails silently (RLS blocks update)

## Validation Commands

Run these commands in sequence to validate implementation:

```bash
# Lint check
bun run lint

# Type check
bun run typecheck

# Run MCP integration tests only
bun test --filter mcp

# Run full test suite
bun test

# Build check
bun run build
```

**Domain-Specific Checks**:
- Verify test database seed has project data: `bun run test:seed`
- Validate Supabase Local running: `curl http://localhost:54322/rest/v1/`
- Check MCP tool registration: Start server and call `tools/list` method

**Success Criteria**:
- All validation commands pass (exit code 0)
- New `project-crud.test.ts` file has 100% pass rate
- Existing MCP tests continue to pass (no regressions)
- Test coverage includes all 7 tools with positive and negative cases

## Commit Message Validation

All commits for this feature will be validated against Conventional Commits format:

**Valid Patterns**:
```
feat(mcp): add create_project tool
feat(mcp): add list_projects and get_project tools
test(mcp): add project CRUD integration tests
docs(mcp): document project management tools
```

**Invalid Patterns to Avoid**:
- ❌ "Based on the plan, this commit adds project tools"
- ❌ "The commit should implement create_project"
- ❌ "I can see that we need to add MCP tools"
- ❌ "Looking at the code, this commit updates tools.ts"
- ❌ "Here is the implementation for project CRUD"

**Commit Scope**: Use `mcp` scope for all commits (e.g., `feat(mcp):`, `test(mcp):`, `docs(mcp):`)

## Report

```
docs/specs/feature-469-mcp-project-crud-tools.md
```
