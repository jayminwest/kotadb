# Chore Plan: Integrate KotaDB MCP Tools into Agent Workflow Commands for Dogfooding

## Context

KotaDB agents are not systematically using KotaDB's own MCP tools for code discovery, dependency analysis, and impact assessment. The `.claude/commands/` directory contains 64 command files, but only 1 references KotaDB MCP tools (`mcp__kotadb__*`). Instead, agents primarily rely on Glob/Grep for discovery, missing opportunities to:

- Validate KotaDB's value proposition through daily dogfooding
- Leverage indexed search for faster planning decisions
- Use dependency graphs for refactoring impact analysis
- Create feedback loops for improving MCP tool UX

This chore closes the dogfooding gap by integrating KotaDB MCP tools into workflow command templates, establishing KotaDB as the primary code intelligence layer for agent operations.

**Why this matters now:**
- Issue #400 recently added `analyze_change_impact` and `validate_implementation_spec` MCP tools that are not yet referenced in workflow commands
- Issue #146 (slash command MCP overhaul) and #172 (JSON output standardization) share the goal of promoting MCP tool usage
- Daily agent development provides immediate validation of MCP tool improvements

**Constraints:**
- Preserve Glob/Grep as fallback for MCP failures (graceful degradation)
- Minimize command template verbosity
- Ensure local MCP server setup is documented for developers

## Relevant Files

- `.claude/commands/workflows/plan.md` — Planning workflow that uses Glob/Grep for codebase exploration (line 18)
- `.claude/commands/workflows/implement.md` — Implementation workflow that could benefit from dependency analysis
- `.claude/commands/issues/feature.md` — Feature planning that uses manual file searches for context gathering
- `.claude/commands/issues/bug.md` — Bug planning that could use impact analysis
- `.claude/commands/issues/chore.md` — Chore planning that lacks dependency discovery guidance
- `.claude/commands/issues/refactor.md` — Refactor planning that should mandate dependency analysis
- `.claude/commands/docs/mcp-usage-guidance.md` — Existing MCP usage guidance (needs expansion for agent-specific patterns)
- `.claude/commands/docs/conditional_docs/app.md` — Conditional doc loader (needs KotaDB usage recommendation)

### New Files

- `.claude/commands/docs/kotadb-agent-usage.md` — Agent-specific KotaDB MCP usage patterns with discovery examples and local server setup
- `docs/specs/chore-432-integrate-kotadb-mcp-agent-workflows.md` — This plan document

## Work Items

### Preparation
1. Audit current Glob/Grep usage patterns across `.claude/commands/` (2 occurrences confirmed via grep)
2. Review existing KotaDB MCP tool capabilities: `search_code`, `search_dependencies`, `analyze_change_impact`, `validate_implementation_spec`, `list_recent_files`
3. Confirm local MCP server connection pattern and configuration requirements

### Execution

#### Phase 1: Documentation Foundation
1. Create `.claude/commands/docs/kotadb-agent-usage.md` with:
   - Local vs production MCP server guidance
   - Common search patterns for KotaDB development (authentication, indexing, rate limiting, validation)
   - Dependency analysis workflows (refactoring preparation, test scope discovery)
   - Impact analysis integration (pre-implementation planning)
   - Examples: "Finding authentication code", "Analyzing refactor impact", "Discovering test coverage"
   - Local MCP server connection setup (assume available via Claude Code)

#### Phase 2: Update Workflow Commands
1. **Update `.claude/commands/workflows/plan.md`**:
   - Replace line 18 ("Research the codebase: Use Glob and Grep to explore relevant files") with KotaDB MCP-first approach
   - Add section: "## Step 1: Discover Relevant Files with KotaDB"
   - Provide MCP tool guidance: use `search_code` for initial discovery, `search_dependencies` for impact analysis
   - Preserve Glob/Grep as fallback: "If MCP tools are unavailable, fall back to Glob/Grep"

2. **Update `.claude/commands/workflows/implement.md`**:
   - Add pre-implementation step: "Query dependencies using `search_dependencies` before modifying shared modules"
   - Reference `.claude/commands/docs/kotadb-agent-usage.md` for dependency analysis patterns

3. **Update `.claude/commands/issues/feature.md`**:
   - Add context gathering step using `search_code` before manual file operations
   - Reference impact analysis tool for large features

4. **Update `.claude/commands/issues/bug.md`**:
   - Add discovery step: "Use `search_code` to find related error handling code"
   - Reference dependency analysis for bug impact assessment

5. **Update `.claude/commands/issues/chore.md`**:
   - Add discovery guidance for maintenance tasks (config files, test infrastructure)

6. **Update `.claude/commands/issues/refactor.md`**:
   - Mandate `search_dependencies` and `analyze_change_impact` before refactoring execution
   - Document minimum depth=2 for dependency traversal

#### Phase 3: Update Conditional Documentation
1. **Modify `.claude/commands/docs/conditional_docs/app.md`**:
   - Add condition for `.claude/commands/docs/kotadb-agent-usage.md`:
     - "When performing code discovery, dependency analysis, or impact assessment in any workflow command"
     - "When planning features, bugs, chores, or refactors that require codebase exploration"
     - "When understanding best practices for using KotaDB MCP tools in agent contexts"

2. **Update `.claude/commands/docs/mcp-usage-guidance.md`**:
   - Add reference to `.claude/commands/docs/kotadb-agent-usage.md` for agent-specific patterns
   - Clarify decision matrix: "Prefer KotaDB MCP for discovery, direct file operations for execution"

### Follow-up
1. Monitor ADW workflow logs for KotaDB MCP tool usage after command template updates
2. Track MCP tool failure rates and fallback scenarios
3. Collect feedback on search result relevance and dependency graph accuracy
4. Update `kotadb-agent-usage.md` with discovered patterns and common queries

## Step by Step Tasks

### Phase 1: Documentation Foundation
1. Create `.claude/commands/docs/kotadb-agent-usage.md` with agent-specific MCP patterns
2. Document local vs production MCP server usage
3. Provide concrete examples for authentication, indexing, rate limiting searches
4. Document dependency analysis workflows with depth recommendations
5. Include impact analysis integration guidance for large changes

### Phase 2: Update Workflow Commands
1. Update `.claude/commands/workflows/plan.md`: replace Glob/Grep with KotaDB MCP-first approach
2. Update `.claude/commands/workflows/implement.md`: add dependency analysis pre-implementation step
3. Update `.claude/commands/issues/feature.md`: add `search_code` context gathering step
4. Update `.claude/commands/issues/bug.md`: add discovery and impact assessment guidance
5. Update `.claude/commands/issues/chore.md`: add discovery guidance for maintenance tasks
6. Update `.claude/commands/issues/refactor.md`: mandate dependency and impact analysis tools

### Phase 3: Update Conditional Documentation
1. Update `.claude/commands/docs/conditional_docs/app.md`: add condition for `kotadb-agent-usage.md`
2. Update `.claude/commands/docs/mcp-usage-guidance.md`: cross-reference agent-specific patterns

### Validation and Completion
1. Run `bun run lint` to validate markdown formatting
2. Run `bunx tsc --noEmit` to ensure no TypeScript issues (not applicable to markdown, but validate repo health)
3. Test updated `/plan` command on a future issue to verify MCP tool usage
4. Verify that agents successfully use `search_code`, `search_dependencies`, `analyze_change_impact` in planning phase
5. Confirm local MCP server handles agent requests correctly
6. Review command template changes for clarity and conciseness
7. Ensure fallback guidance is clear for MCP tool failures
8. Stage changes: `git add docs/specs/chore-432-integrate-kotadb-mcp-agent-workflows.md .claude/commands/`
9. Commit changes with conventional commit message
10. Push branch: `git push -u origin chore/432-integrate-kotadb-mcp-agent-workflows`

## Risks

- **Risk**: Agents may not prefer KotaDB MCP tools if guidance is ambiguous
  - **Mitigation**: Provide clear "PREFER MCP for discovery" language in command templates; preserve Glob/Grep as explicit fallback

- **Risk**: Local MCP server may not be configured by all developers
  - **Mitigation**: Document setup in `kotadb-agent-usage.md`; graceful degradation to Glob/Grep ensures unblocked workflows

- **Risk**: MCP tool failures could slow down planning workflows
  - **Mitigation**: Explicit fallback guidance in all updated commands; monitor failure rates post-deployment

- **Risk**: Command template verbosity could increase, reducing readability
  - **Mitigation**: Keep MCP guidance concise; reference `kotadb-agent-usage.md` for detailed patterns instead of inline expansion

- **Risk**: Agents may not understand when to use local vs production MCP server
  - **Mitigation**: Document "use local for KotaDB development, production for external projects" in `kotadb-agent-usage.md`

## Validation Commands

- `bun run lint` (validate markdown formatting and code style)
- `bunx tsc --noEmit` (ensure TypeScript health)
- Manual validation: Test updated `/plan` command on test issue
- Manual validation: Verify MCP tool usage in agent logs
- Manual validation: Confirm local MCP server connection

**Validation Level**: Level 1 (Quick) — Documentation-only changes, no code execution required beyond linting.

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `docs: add KotaDB MCP agent usage patterns` not `Based on the plan, this commit adds KotaDB usage patterns`

Example commit messages:
- `docs: create kotadb-agent-usage.md with MCP patterns`
- `docs: update plan.md to use KotaDB MCP for discovery`
- `docs: add conditional doc entry for kotadb-agent-usage.md`

## Deliverables

1. **New Documentation**:
   - `.claude/commands/docs/kotadb-agent-usage.md` (agent-specific KotaDB MCP usage patterns)

2. **Updated Workflow Commands**:
   - `.claude/commands/workflows/plan.md` (KotaDB MCP-first discovery)
   - `.claude/commands/workflows/implement.md` (dependency analysis step)
   - `.claude/commands/issues/feature.md` (context gathering with `search_code`)
   - `.claude/commands/issues/bug.md` (discovery and impact assessment)
   - `.claude/commands/issues/chore.md` (maintenance discovery guidance)
   - `.claude/commands/issues/refactor.md` (mandated dependency and impact analysis)

3. **Updated Documentation References**:
   - `.claude/commands/docs/conditional_docs/app.md` (condition for `kotadb-agent-usage.md`)
   - `.claude/commands/docs/mcp-usage-guidance.md` (cross-reference to agent patterns)

4. **Validation Evidence**:
   - Lint output (pass/fail)
   - Manual test results from `/plan` command execution
   - MCP server logs showing agent requests
