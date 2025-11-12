# Chore Plan: Update /mcp Page to Document All 6 MCP Tools

## Context
The `/mcp` page frontend documentation is out of sync with the backend implementation. The page currently documents only 4/6 available MCP tools, missing the two advanced planning tools (`analyze_change_impact` and `validate_implementation_spec`) that were added in #400. This creates confusion for users who may not be aware of the full capabilities available through the MCP integration.

This chore addresses the documentation gap by adding the missing tools to the frontend display with accurate descriptions and parameters extracted from the backend definitions.

## Relevant Files
- `web/components/mcp/ToolReference.tsx` — Frontend component displaying MCP tool documentation (currently shows 4/6 tools)
- `app/src/mcp/tools.ts` — Backend tool definitions (lines 162-286 contain the two missing tools)

### New Files
None (this is a documentation update to existing frontend component)

## Work Items

### Preparation
- Verify current state of `ToolReference.tsx` component
- Extract complete metadata from `ANALYZE_CHANGE_IMPACT_TOOL` (app/src/mcp/tools.ts:162-204)
- Extract complete metadata from `VALIDATE_IMPLEMENTATION_SPEC_TOOL` (app/src/mcp/tools.ts:209-286)

### Execution
1. Add `analyze_change_impact` tool entry to the `tools` array in `ToolReference.tsx`
   - Name: `analyze_change_impact`
   - Description: "Analyze the impact of proposed code changes by examining dependency graphs, test scope, and potential conflicts. Returns comprehensive analysis including affected files, test recommendations, architectural warnings, and risk assessment. Useful for planning implementations and avoiding breaking changes."
   - Parameters: `files_to_modify (optional), files_to_create (optional), files_to_delete (optional), change_type (required), description (required), breaking_changes (optional), repository (optional)`

2. Add `validate_implementation_spec` tool entry to the `tools` array in `ToolReference.tsx`
   - Name: `validate_implementation_spec`
   - Description: "Validate an implementation specification against KotaDB conventions and repository state. Checks for file conflicts, naming conventions, path alias usage, test coverage, and dependency compatibility. Returns validation errors, warnings, and approval conditions checklist."
   - Parameters: `feature_name (required), files_to_create (optional), files_to_modify (optional), migrations (optional), dependencies_to_add (optional), breaking_changes (optional), repository (optional)`

3. Update example usage section to include sample queries for the new tools:
   - "Analyze the impact of modifying auth/middleware.ts"
   - "Validate my implementation spec for the new feature"

4. Verify all tool descriptions match backend definitions in `tools.ts:292-299`

### Follow-up
- Manually verify the `/mcp` page renders correctly with all 6 tools
- Confirm example usage section includes representative queries for all tool types

## Step by Step Tasks

### Preparation Phase
1. Read `web/components/mcp/ToolReference.tsx` to understand current structure
2. Read `app/src/mcp/tools.ts:162-204` to extract `analyze_change_impact` metadata
3. Read `app/src/mcp/tools.ts:209-286` to extract `validate_implementation_spec` metadata

### Implementation Phase
1. Edit `web/components/mcp/ToolReference.tsx` to add `analyze_change_impact` tool entry with accurate description and parameters
2. Edit `web/components/mcp/ToolReference.tsx` to add `validate_implementation_spec` tool entry with accurate description and parameters
3. Edit example usage section to add queries: "Analyze the impact of modifying auth/middleware.ts" and "Validate my implementation spec for the new feature"

### Validation Phase
1. Run `bun run typecheck` to verify TypeScript compilation
2. Run `bun run lint` to verify code style compliance
3. Run `bun run build` (web build) to ensure component renders without errors
4. Push branch: `git add -A && git commit -m "chore(docs): document all 6 MCP tools on /mcp page (#434)" && git push -u origin chore/434-update-mcp-docs`

## Risks
- **Risk**: Tool descriptions may drift out of sync with future backend changes
  - **Mitigation**: Consider adding a comment in `tools.ts` referencing the frontend component to remind maintainers to update both locations
- **Risk**: Parameter formatting may not match user expectations for complex nested objects
  - **Mitigation**: Use simplified parameter summaries that match the existing pattern (e.g., "files_to_modify (optional)" rather than full JSON schema)

## Validation Commands
- `bun run typecheck` — Verify TypeScript compilation
- `bun run lint` — Verify code style
- `bun run build` — Verify Next.js build (web directory)

Manual validation:
1. Navigate to `http://localhost:3001/mcp` after authentication
2. Scroll to "Available MCP Tools" section
3. Verify all 6 tools are documented with accurate descriptions and parameters
4. Verify example usage reflects all tool capabilities

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(docs): document all 6 MCP tools on /mcp page (#434)` not `Based on the plan, this commit should document the tools`

## Deliverables
- Updated `web/components/mcp/ToolReference.tsx` with all 6 MCP tools documented
- Enhanced example usage section demonstrating advanced planning tool queries
- All validation checks passing (typecheck, lint, build)
