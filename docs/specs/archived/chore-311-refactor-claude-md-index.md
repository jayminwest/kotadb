# Chore Plan: Refactor CLAUDE.md into Index with Detailed Docs

## Context
The `CLAUDE.md` file has grown to 701 lines, making it difficult to maintain and navigate. This refactoring will transform it into a high-level index (<150 lines) with detailed documentation organized in the `.claude/commands/` directory structure. This improves maintainability, reduces duplication, and aligns with Claude Code's command system architecture.

**Why this matters now:**
- Current 701-line monolithic file is difficult to update and navigate
- Information duplicated across `CLAUDE.md` and `.claude/commands/docs/` files
- Agents need clearer guidance on when to use MCP servers for programmatic operations
- Documentation structure doesn't leverage Claude Code's selective loading patterns

**Constraints:**
- No information loss - all content must be preserved in new locations
- `CLAUDE.md` must remain functional as entry point with clear navigation
- Existing `.claude/commands/` files must be updated to avoid duplication
- MCP server usage patterns must be documented for agent guidance

## Relevant Files

### Files to Modify
- `CLAUDE.md` — Reduce from 701 to <150 lines, convert to navigation index
- `.claude/commands/docs/conditional_docs/app.md` — Add new documentation references with loading conditions

### Existing Files to Update (Avoid Duplication)
- `.claude/commands/docs/issue-relationships.md` — Already covers issue management, remove duplication from CLAUDE.md
- `.claude/commands/beads/*.md` — Already covers Beads workflow, consolidate content
- `.claude/commands/app/start.md` — Already covers dev-start.sh, may need enhancement

### New Files
- `.claude/commands/app/dev-commands.md` — Development commands, server startup, quick start
- `.claude/commands/app/environment.md` — Environment variables reference
- `.claude/commands/app/pre-commit-hooks.md` — Pre-commit hooks installation and usage
- `.claude/commands/testing/testing-guide.md` — Testing philosophy, migration sync, test commands
- `.claude/commands/testing/logging-standards.md` — TypeScript/Python logging standards
- `.claude/commands/docs/architecture.md` — Path aliases, shared types, core components
- `.claude/commands/docs/database.md` — Database schema, RLS policies, Supabase architecture
- `.claude/commands/docs/mcp-integration.md` — MCP architecture, tools, SDK behavior notes
- `.claude/commands/docs/mcp-usage-guidance.md` — **NEW**: When/how to use MCP tools vs direct operations
- `.claude/commands/docs/workflow.md` — API workflows (auth, indexing, search, validation)
- `.claude/commands/ci/ci-configuration.md` — GitHub Actions workflows, parallelization, caching
- `.claude/commands/workflows/adw-architecture.md` — ADW system architecture, phases, resilience
- `.claude/commands/workflows/adw-observability.md` — ADW metrics analysis, log analysis, CI integration

## Work Items

### Preparation
1. Backup current `CLAUDE.md` (git ensures this, but verify branch is clean)
2. Review existing `.claude/commands/` structure for duplication targets
3. Create content migration map with line number ranges
4. Verify no active work depends on current CLAUDE.md structure

### Execution
1. **Create new documentation files** (in order of dependencies)
   - Core reference files (dev-commands, environment, architecture, database)
   - Testing and standards files (testing-guide, logging-standards)
   - Integration files (mcp-integration, mcp-usage-guidance, workflow)
   - Workflow files (adw-architecture, adw-observability)
   - CI/CD files (ci-configuration)

2. **Extract and migrate content** from CLAUDE.md to new files
   - Lines 9-155: Development commands → `app/dev-commands.md`, `app/environment.md`, `app/pre-commit-hooks.md`
   - Lines 70-123: Logging standards → `testing/logging-standards.md`
   - Lines 39-68: Testing philosophy → `testing/testing-guide.md`
   - Lines 157-199: Path aliases, shared types → `docs/architecture.md`
   - Lines 200-336: Core components → `docs/architecture.md`, `docs/database.md`, `docs/mcp-integration.md`
   - Lines 247-293: MCP SDK behavior → `docs/mcp-integration.md`
   - Lines 337-373: Workflows → `docs/workflow.md`
   - Lines 374-383: Environment variables → `app/environment.md`
   - Lines 385-456: ADW workflows → `workflows/adw-architecture.md`, `workflows/adw-observability.md`
   - Lines 458-520: Issue management → Update existing `docs/issue-relationships.md`
   - Lines 522-635: Beads workflow → Update existing `beads/*.md` files
   - Lines 637-701: CI/CD infrastructure → `ci/ci-configuration.md`

3. **Create MCP usage guidance document** (`docs/mcp-usage-guidance.md`)
   - When to use MCP tools vs direct file operations
   - Available MCP servers and their capabilities (kotadb, playwright, beads)
   - Usage examples for common agent tasks
   - Performance considerations and rate limiting

4. **Rewrite CLAUDE.md as navigation index**
   - Brief project overview (3-4 sentences max)
   - Quick reference section with common commands
   - Navigation directory organized by category
   - Critical project-specific conventions only
   - MCP server availability and usage guidance reference

5. **Update conditional docs loader** (`.claude/commands/docs/conditional_docs/app.md`)
   - Add loading conditions for new documentation files
   - Example: Load `testing/logging-standards.md` when task involves logging or console usage
   - Example: Load `docs/mcp-usage-guidance.md` when agent needs to perform file operations or queries

6. **Cross-link related documents**
   - Ensure bidirectional links between related topics
   - Testing guide references architecture for database setup
   - MCP integration references mcp-usage-guidance for best practices
   - ADW architecture references workflow for API patterns

### Follow-up
1. **Validate navigation paths** - verify all links resolve correctly
2. **Test workflow execution** - run dev-start, tests, issue creation using only docs
3. **Verify completeness** - diff old vs new content to catch missing sections
4. **Monitor agent behavior** - ensure agents can find relevant docs and use MCP tools appropriately
5. **Update CONTRIBUTING.md** if it references old CLAUDE.md structure

## Step by Step Tasks

### 1. Content Migration Preparation
- Verify working directory is clean (`git status`)
- Create content extraction script or manual mapping spreadsheet
- Identify all code examples, commands, and critical warnings to preserve

### 2. Create Core Reference Files
- Write `app/dev-commands.md` with development commands and quick start
- Write `app/environment.md` with environment variables reference
- Write `app/pre-commit-hooks.md` with hooks installation/troubleshooting
- Write `docs/architecture.md` with path aliases, shared types, core components
- Write `docs/database.md` with database schema and Supabase architecture

### 3. Create Testing and Standards Files
- Write `testing/testing-guide.md` with antimocking philosophy, migration sync
- Write `testing/logging-standards.md` with TypeScript/Python logging rules

### 4. Create Integration Files
- Write `docs/mcp-integration.md` with MCP architecture and SDK behavior
- Write `docs/mcp-usage-guidance.md` with agent usage patterns and best practices
- Write `docs/workflow.md` with API workflows and rate limiting

### 5. Create Workflow Files
- Write `workflows/adw-architecture.md` with 3-phase architecture, atomic agents, resilience
- Write `workflows/adw-observability.md` with metrics analysis and CI integration

### 6. Create CI/CD Files
- Write `ci/ci-configuration.md` with GitHub Actions workflows and caching strategy

### 7. Update Existing Files
- Update `docs/issue-relationships.md` with any missing GitHub issue management content
- Update `beads/*.md` files with Beads workflow consolidation (avoid duplication)

### 8. Rewrite CLAUDE.md
- Create new high-level index structure (<150 lines)
- Include brief project overview
- Add quick reference section
- Add navigation directory by category
- Add critical conventions (migration sync, logging standards, path aliases)
- Add MCP server availability notice with link to usage guidance

### 9. Update Conditional Docs Loader
- Edit `.claude/commands/docs/conditional_docs/app.md`
- Add loading conditions for new documentation files
- Document when to load each new file (keywords, task types)

### 10. Validation and Testing
- Run `bun run lint` to check for any broken references
- Run `bunx tsc --noEmit` to verify type consistency
- Execute navigation test: find dev-start instructions, test commands, MCP architecture
- Execute completeness test: diff old CLAUDE.md against new file contents
- Execute workflow test: start server, run tests, create issue using only docs
- Verify all cross-references resolve correctly
- Test MCP usage guidance by simulating agent task (e.g., file search)

### 11. Finalize and Push
- Stage all changes (`git add` new files, modified files)
- Commit with conventional format: `chore(docs): refactor CLAUDE.md into index with detailed docs (#311)`
- Run pre-commit hooks validation
- Push branch (`git push -u origin chore/311-refactor-claude-md-index`)

## Risks

**Risk:** Information loss during migration
**Mitigation:** Use git diff to compare old vs new content byte-by-byte before deletion. Create validation checklist of all sections and verify each is preserved.

**Risk:** Broken cross-references between documents
**Mitigation:** Grep for all markdown links `\[.*\]\(.*\.md\)` and verify targets exist. Test navigation paths manually.

**Risk:** Agents cannot find relevant documentation after refactoring
**Mitigation:** Update conditional docs loader with comprehensive keyword triggers. Test with sample agent tasks before merging.

**Risk:** MCP usage guidance is too prescriptive or too vague
**Mitigation:** Include concrete examples with code snippets. Document decision criteria (performance, rate limits, API availability).

**Risk:** Existing workflows break due to CLAUDE.md structure changes
**Mitigation:** Keep CLAUDE.md functional as navigation index. Ensure ADW agents can still bootstrap from CLAUDE.md entry point.

## Validation Commands

```bash
# Standard validation
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test

# Documentation-specific validation
# Verify all markdown links resolve
find .claude/commands -name "*.md" -exec grep -H '\[.*\](.*\.md)' {} \; | while read line; do
  # Extract file and link target, verify target exists
  echo "Checking: $line"
done

# Verify CLAUDE.md is <150 lines
wc -l CLAUDE.md | awk '{if($1>150){print "FAIL: "$1" lines";exit 1}else{print "PASS: "$1" lines"}}'

# Check for duplicate content between old and new
# (Manual review of extracted sections)

# Verify conditional docs references exist
grep -E '\\.claude/commands/' .claude/commands/docs/conditional_docs/app.md | while read path; do
  test -f "$path" || echo "Missing: $path"
done
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `chore(docs): <subject>`
- Use direct statements: `chore(docs): refactor CLAUDE.md into index with detailed docs`
- AVOID meta-commentary: "based on", "the commit should", "here is", "this commit"

## Deliverables

### Code Changes
- Reduced `CLAUDE.md` to <150 lines (navigation index)
- 12 new documentation files in `.claude/commands/` directory
- Updated `.claude/commands/docs/conditional_docs/app.md` with loading conditions

### Documentation Updates
- **Core Reference** (3 files): dev-commands, environment, architecture
- **Testing** (2 files): testing-guide, logging-standards
- **Integration** (4 files): database, mcp-integration, mcp-usage-guidance, workflow
- **Workflows** (2 files): adw-architecture, adw-observability
- **CI/CD** (1 file): ci-configuration
- **Pre-commit** (1 file): pre-commit-hooks

### Navigation Structure
- Clear category-based organization
- Bidirectional cross-links between related topics
- MCP usage guidance integrated into agent workflow
- Conditional loading patterns for selective documentation access

## MCP Usage Guidance Content (Key Sections)

The new `docs/mcp-usage-guidance.md` file should include:

### 1. When to Use MCP Tools
- **Use MCP tools when:**
  - Performing programmatic queries (search_code, list_recent_files)
  - Querying dependency graphs (search_dependencies)
  - Managing issues/tasks (beads MCP tools)
  - Interacting with browser automation (playwright MCP tools)
  - Operations requiring rate limiting and authentication

- **Use direct file operations when:**
  - Reading specific known file paths (Read tool is faster)
  - Editing files with exact changes (Edit tool is more precise)
  - Writing new files (Write tool is straightforward)
  - Single-file operations in current context

### 2. Available MCP Servers
- **kotadb MCP** (`mcp__kotadb__*`): Code search, indexing, dependency analysis
- **beads MCP** (`mcp__plugin_beads_beads__*`): Issue tracking, dependency management
- **playwright MCP** (`mcp__playwright__*`): Browser automation, web testing
- **sequential-thinking MCP** (`mcp__sequential-thinking__*`): Complex reasoning tasks

### 3. Usage Examples
```typescript
// PREFER: MCP for code search across repository
const results = await mcp.call("kotadb__search_code", {
  term: "authenticateRequest",
  limit: 20
});

// PREFER: Direct Read for known file paths
const content = await tools.Read({ file_path: "app/src/auth/middleware.ts" });

// PREFER: MCP for dependency analysis
const deps = await mcp.call("kotadb__search_dependencies", {
  file_path: "app/src/api/routes.ts",
  direction: "both",
  depth: 2
});

// PREFER: Direct Edit for specific changes
await tools.Edit({
  file_path: "app/src/auth/middleware.ts",
  old_string: "return 429",
  new_string: "return 503"
});
```

### 4. Performance Considerations
- MCP calls have authentication overhead (API key validation)
- MCP search operations are rate-limited per tier
- Direct file operations bypass rate limits for known paths
- Use MCP for discovery, direct tools for execution

### 5. Decision Matrix
| Task Type | Recommended Approach | Rationale |
|-----------|---------------------|-----------|
| Find files containing "AuthContext" | MCP search_code | Full-text search across repo |
| Read app/src/auth/middleware.ts | Direct Read | Known path, faster |
| Find all files importing middleware.ts | MCP search_dependencies | Dependency graph query |
| Update import statement in routes.ts | Direct Edit | Precise change |
| List recently indexed files | MCP list_recent_files | Database query |
| Create new file app/src/utils/helper.ts | Direct Write | Simple file creation |

This guidance should be referenced in CLAUDE.md index and loaded conditionally when agents perform file operations or repository queries.
