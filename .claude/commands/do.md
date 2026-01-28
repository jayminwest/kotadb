---
description: Universal entry point - delegates to appropriate workflow
argument-hint: <requirement>
allowed-tools: Read, Glob, Grep, Task, AskUserQuestion
---

# `/do` - Universal Workflow Entry Point

Single command interface for all workflows. Analyzes requirements and directly orchestrates expert agents through plan-build-improve cycles.

## CRITICAL: Orchestration-First Approach

### ABSOLUTE RULE: DELEGATE EVERYTHING

**IMPORTANT: First and foremost, remember that you should delegate as much as possible to subagents. Even reading and writing single files MUST be delegated to subagents.**

This command exists to orchestrate workflows—NOT to do work directly. You are a dispatcher, not a worker.

**Your ONLY responsibilities:**
1. Parse and classify requirements
2. Select the appropriate pattern (A, B, or C)
3. Spawn expert agents via Task tool
4. Wait for results
5. Synthesize and report outcomes

**You MUST NOT:**
- Read files directly (delegate to agents)
- Write files directly (delegate to agents)
- Make code changes (delegate to agents)
- Make implementation decisions (delegate to plan-agent)
- Answer domain questions directly (delegate to question-agent)

**Why This Matters:**
- Expert agents have domain-specific context in their prompts
- Expert agents have access to expertise.yaml knowledge
- Direct work bypasses the plan-build-improve learning cycle
- Direct work doesn't update expertise for future improvements

### The Golden Rule

> **If you're about to use Read, Write, Edit, or Grep—STOP. Spawn an agent instead.**

The actual work happens in expert agents via the plan-build-improve cycle. You orchestrate. They execute.

## Purpose

The `/do` command is the universal orchestrator for all workflows. It analyzes your requirement, determines the appropriate workflow pattern, and directly orchestrates expert agents through plan-build-improve cycles with user approval gates.

## How It Works

1. **Parse Requirement**: Extract what you need done
2. **Classify Type**: Determine workflow (expert domain or simple operation)
3. **Route to Handler**:
   - For expert implementations: Spawn plan-agent - user approval - build-agent - improve-agent
   - For questions: Spawn question-agent
   - For simple workflows: Spawn specialized agent
4. **Orchestrate Workflow**: Manage plan-build-improve cycle with approval gates
5. **Report Results**: Synthesize and present outcomes

## CRITICAL: Execution Control Rules

**IMPORTANT: The base `/do` agent MUST wait for all subagent work to complete before responding. Premature exit causes incomplete results and user confusion.**

### Rule 1: Never Use Background Execution for Task Tool

**Task tool calls MUST NOT use `run_in_background: true`.**

The Task tool is inherently blocking—it waits for the subagent to complete before returning. There is no `run_in_background` parameter for Task (that's a Bash tool feature).

**Correct Task Usage:**
```
Task(
  subagent_type: "claude-config-plan-agent",
  prompt: |
    USER_PROMPT: {requirement}
)
```

**Incorrect (DO NOT USE):**
```
Task(
  subagent_type: "claude-config-plan-agent",
  prompt: |
    USER_PROMPT: {requirement}
  run_in_background: true  # NOT a valid Task parameter
)
```

### Rule 2: Wait for ALL Task Results Before Responding

**You MUST collect and process the full output from EVERY Task call before generating your final response.**

The Task tool blocks until the subagent completes. However, you must explicitly:
1. **Wait** for the Task call to return (don't interrupt or respond prematurely)
2. **Capture** the full output from the subagent
3. **Process** the results (synthesize, extract file paths, etc.)
4. **Only then** generate the final report

**Anti-Pattern:**
```
# WRONG: Responding before Task completes
Use Task(...) to spawn claude-config-plan-agent

## `/do` - Complete
Handler: claude-config
Results: Working on it...
```

**Correct Pattern:**
```
# CORRECT: Wait, collect, then respond
Use Task(...) to spawn claude-config-plan-agent
[WAIT for Task to complete and return results]
[CAPTURE the full output]
[EXTRACT file paths, status, next steps]

## `/do` - Complete
Handler: claude-config
Results: [synthesized from actual output]
Files Modified: [extracted from output]
Next Steps: [from handler recommendations]
```

### Rule 3: Parallel Execution Must Still Block

**For parallel subagent execution, spawn ALL agents in a SINGLE message, then wait for ALL to complete.**

**Parallel Pattern:**
```
# Spawn multiple in parallel (single message, multiple Task calls)
Use Task(subagent_type: "claude-config-question-agent", prompt: ...)
Use Task(subagent_type: "agent-authoring-question-agent", prompt: ...)

# Task tool executes these in parallel but blocks until ALL complete
# Now collect results from both:
[CAPTURE claude-config output]
[CAPTURE agent-authoring output]

# Now synthesize and respond
```

The Task tool handles parallelism automatically when you make multiple calls in one message. You don't need (and must not use) `run_in_background`.

### Why This Matters

**In `--print` mode and other execution contexts:**
- The base agent's output is the user's only feedback
- If you exit before subagents complete, their work is lost
- Results appear empty even though subagents ran successfully
- User sees "complete" but no actual results

**Always wait. Always collect. Always synthesize before reporting.**

### Rule 4: Orchestration Sequence for Expert Implementations

**For expert domain implementation requests, /do MUST orchestrate the plan-build-improve cycle directly.**

**Orchestration Pattern:**
```
# Step 1: Plan Phase
Use Task(subagent_type: "<domain>-plan-agent", prompt: "USER_PROMPT: {requirement}")
[WAIT for plan-agent to complete]
[EXTRACT spec_path from output]

# Step 2: User Approval Gate
Use AskUserQuestion(
  question: "Plan complete. Spec saved to {spec_path}. Proceed with implementation?",
  options: ["Yes, continue to build", "No, stop here - I'll review first"]
)
[WAIT for user response]

# If user says "No":
#   Report spec location, suggest resuming with /do "build from {spec_path}"
#   Exit gracefully

# Step 3: Build Phase (if approved)
Use Task(subagent_type: "<domain>-build-agent", prompt: "PATH_TO_SPEC: {spec_path}")
[WAIT for build-agent to complete]
[EXTRACT files modified from output]

# Step 4: Improve Phase (always run, but non-blocking on failure)
Use Task(subagent_type: "<domain>-improve-agent", prompt: "Review recent changes for domain expertise updates")
[WAIT for improve-agent to complete]
[CAPTURE expertise updates, but don't fail workflow if this fails]

# Step 5: Synthesize and Report
```

**Why This Pattern:**
- Plan must complete before user can approve
- Build must wait for approval (prevents unwanted implementations)
- Improve is opportunistic (workflow succeeds even if improve fails)
- All phases block on Task completion before proceeding

**Sequential Dependencies:**
Build depends on spec_path from plan. Improve depends on build completing (changes to analyze). User approval depends on spec being ready to review.

**Error Handling:**
- Plan fails - report error, exit (no spec to build from)
- User declines - save spec location, exit gracefully (valid outcome)
- Build fails - preserve spec, report error, skip improve
- Improve fails - log error, but workflow succeeds (improvement is bonus)

---

## Step 1: Parse Arguments

Extract requirement from `$ARGUMENTS`:
- Remove any flags (future: `--background`, `--plan-only`, etc.)
- Capture the core requirement description

## Step 2: Classify Requirement

Analyze the requirement to determine type and pattern. **Expert domains take priority** when implementation is needed.

---

### Expert Domain Requests (Priority - Check First)

**Claude Config Expert**
- Keywords: "slash command", "command", "hook", "settings.json", ".claude config", "settings", "frontmatter"
- Locations: References to .claude/commands/, .claude/hooks/, .claude/settings.json
- Indicators: Command creation, hook implementation, .claude/ directory organization
- Examples: "Create new slash command for X", "Add hook for Y event", "Configure settings"

**Agent Authoring Expert**
- Keywords: "create agent", "new agent", "agent config", "tool selection", "agent description", "agent frontmatter", "agent registry"
- Locations: References to .claude/agents/, agent creation, expert domain setup
- Indicators: Agent file creation, tool set decisions, model selection for agents
- Examples: "Create a new scout agent", "Configure tools for the build agent", "Add new expert domain"

**Database Expert**
- Keywords: "schema", "migration", "SQLite", "FTS5", "database", "query", "index", "table"
- Locations: References to app/src/db/, sqlite-schema.sql
- Indicators: Database schema changes, migrations, query optimization
- Examples: "Create migration for X", "Optimize query for Y", "Add FTS5 search"

**API Expert**
- Keywords: "endpoint", "route", "MCP tool", "API", "HTTP", "server", "OpenAPI"
- Locations: References to app/src/api/, app/src/mcp/
- Indicators: API endpoint creation, MCP tool implementation, server routes
- Examples: "Add endpoint for X", "Create MCP tool for Y", "Update OpenAPI spec"

**Testing Expert**
- Keywords: "test", "antimocking", "Bun test", "sqlite test", "test lifecycle"
- Locations: References to app/tests/, __tests__/
- Indicators: Test creation, test fixes, testing strategy
- Examples: "Write tests for X", "How do I test Y", "Add integration test"

**Indexer Expert**
- Keywords: "AST", "parser", "symbol", "reference", "indexing", "code analysis"
- Locations: References to app/src/indexer/
- Indicators: Code indexing, symbol extraction, AST parsing
- Examples: "Extract symbols from X", "Index repository", "Parse AST for Y"

**GitHub Expert**
- Keywords: "issue", "PR", "pull request", "branch", "commit", "gh CLI", "GitHub"
- Locations: References to .github/, issues commands
- Indicators: GitHub workflow operations, issue management, PR creation
- Examples: "Classify issue", "Create PR for X", "Branch naming for Y"

### Pattern Classification (After Domain Identified)

Once expert domain is identified, determine which pattern:

**Implementation Request (Pattern A):**
- Verbs: fix, add, create, implement, update, configure, refactor
- Objects: Concrete things to build/change
- Pattern: Use Pattern A (Plan-Build-Improve)

**Question Request (Pattern B):**
- Phrasing: "How do I...", "What is...", "Why...", "Explain...", "When should I..."
- Pattern: Use Pattern B (Question-Agent)

**Simple Operation (Pattern C):**
- Verbs: regenerate, format, lint, compile
- Objects: Single-purpose operations
- Pattern: Use Pattern C (Simple Workflow)
- Examples: "Format file X", "Run linter"

**Ambiguous** - Ask user for clarification
- Multiple possible interpretations
- Use AskUserQuestion to disambiguate

---

## Step 3: Determine Handler Type

Based on classification, determine which orchestration pattern to use:

**Pattern A: Expert Implementation (Plan-Build-Improve)**
- Triggers: Expert domain + implementation request
- Examples: "Create new slash command for X", "Add hook for logging", "Create new agent", "Create migration for X", "Add MCP tool for Y", "Write tests for X", "Index repository", "Create PR for X"
- Flow: Spawn plan-agent - user approval - build-agent - improve-agent

**Pattern B: Expert Question (Direct Answer)**
- Triggers: Expert domain + question phrasing
- Examples: "How do I structure frontmatter?", "What model for coordinators?", "How do I test Y?", "What is the indexing strategy?"
- Flow: Spawn question-agent - report answer

**Pattern C: Simple Workflow (Single Agent)**
- Triggers: Simple tasks, specialized operations
- Examples: "Format code in file X", "Run validation"
- Flow: Spawn specialized agent - report results

---

## Step 4: Execute Pattern

Execute the appropriate orchestration pattern based on Step 3 classification.

---

### Pattern A: Expert Implementation (Plan-Build-Improve)

**Used for:** Expert domain implementation requests (most common pattern)

**Phase 1 - Plan:**
```
Use Task tool:
  subagent_type: "<domain>-plan-agent"
  prompt: |
    USER_PROMPT: {requirement}

    Analyze this requirement and create a specification.
    Save spec to: .claude/.cache/specs/{domain}/{slug}-spec.md
    Return the spec path when complete.
```

Capture `spec_path` from plan-agent output.

**Phase 2 - User Approval:**
```
Use AskUserQuestion:
  question: "Plan complete. Specification saved to {spec_path}. Ready to proceed with implementation?"
  options:
    - "Yes, continue to build" (Recommended)
    - "No, stop here - I'll review the spec first"
```

**If user selects "No, stop here":**
- Skip to Report with status: "Plan Complete - User Review Requested"
- Include spec location in report
- Suggest resume command: `/do "build from {spec_path}"`
- Exit gracefully (this is NOT an error)

**If user selects "Yes, continue to build":**
- Proceed to Phase 3

**Phase 3 - Build:**
```
Use Task tool:
  subagent_type: "<domain>-build-agent"
  prompt: |
    PATH_TO_SPEC: {spec_path}

    Read the specification and implement the changes.
    Report files modified when complete.
```

Capture `files_modified` from build-agent output.

**Phase 4 - Improve (Optional):**
```
Use Task tool:
  subagent_type: "<domain>-improve-agent"
  prompt: |
    Review recent {domain} changes and update expert knowledge.

    Analyze git history, extract learnings, update expertise.yaml
    Report expertise updates when complete.
```

**Error Handling for Improve:**
If improve-agent fails:
- Log the error
- Set `improve_status: "Skipped - Error"`
- Continue to Report (workflow is still successful)

**Domains Using This Pattern:**
- claude-config
- agent-authoring
- database
- api
- testing
- indexer
- github

---

### Pattern B: Expert Question (Direct Answer)

**Used for:** Expert domain questions (no implementation)

```
Use Task tool:
  subagent_type: "<domain>-question-agent"
  prompt: |
    USER_PROMPT: {requirement}

    Provide an informed answer based on {domain} expertise.
```

Capture answer from question-agent output.
Proceed to Report.

**Domains Using This Pattern:**
- claude-config
- agent-authoring
- database
- api
- testing
- indexer
- github

---

### Pattern C: Simple Workflow (Single Agent)

**Used for:** Simple operations, formatting, single-purpose tasks

**Examples:**
- "Format markdown in file X" - direct operation
- "Run linter" - simple task

```
Use Task tool:
  subagent_type: "build-agent"
  prompt: |
    {requirement with any needed context}
```

Capture results from agent.
Proceed to Report.

**Note:** This pattern is for lightweight, single-step operations that don't need plan-build-improve.

---

## Step 5: Wait and Collect Results

**CRITICAL: MUST wait for all Task calls to complete before proceeding.**

For Pattern A (Expert Implementation):
- Wait for plan-agent - extract spec_path
- Wait for user approval - get decision
- Wait for build-agent - extract files_modified
- Wait for improve-agent - extract expertise_updates (or log failure)

For Pattern B (Question):
- Wait for question-agent - extract answer

For Pattern C (Simple):
- Wait for agent - extract results

**Validation Checkpoint:**
Before proceeding to Report, verify:
- [ ] All spawned agents returned results
- [ ] Results are non-empty (or error is logged)
- [ ] No pending Task calls
- [ ] Handler output captured

If validation fails: investigate and report issue, don't claim completion.

---

## Step 6: Report Results

Generate pattern-appropriate report:

---

### Report Format: Pattern A (Expert Implementation)

**If user declined at approval gate:**
```markdown
## `/do` - Plan Complete, Awaiting Review

**Requirement:** {requirement}
**Domain:** {claude-config|agent-authoring|database|api|testing|indexer|github}
**Status:** Plan Complete - User Review Requested

### Specification

Plan saved to: {spec_path}

Review the specification and when ready, resume with:
```
/do "build from {spec_path}"
```

### Next Steps

1. Review the spec at {spec_path}
2. Edit if needed
3. Resume build with command above
```

**If full workflow completed:**
```markdown
## `/do` - Complete

**Requirement:** {requirement}
**Domain:** {claude-config|agent-authoring|database|api|testing|indexer|github}
**Status:** Success

### Workflow Stages

| Stage | Status | Key Output |
|-------|--------|------------|
| Plan | Complete | {spec_path} |
| Build | Complete | {file_count} files modified |
| Improve | Complete | Expert knowledge updated |

### Files Modified

{list from build-agent output}
- /absolute/path/to/file1.md - {what changed}
- /absolute/path/to/file2.yaml - {what changed}

### Expertise Updated

{summary from improve-agent, or "Skipped - Error" if failed}

### Specification

The plan specification is saved at: {spec_path}

This can be used for future reference or to re-run build stage.

### Next Steps

{context-specific suggestions based on what was done}
```

**If build failed:**
```markdown
## `/do` - Build Failed

**Requirement:** {requirement}
**Domain:** {claude-config|agent-authoring|database|api|testing|indexer|github}
**Status:** Build Failed (Plan Preserved)

### What Happened

The build phase encountered an error:
{error details from build-agent}

### Specification Preserved

Plan is valid and saved at: {spec_path}

You can:
1. Review the spec for issues
2. Edit if needed
3. Retry with: `/do "build from {spec_path}"`

### Diagnostic Info

- Plan phase: Successful
- User approval: Granted
- Build phase: Failed
- Improve phase: Skipped (no changes to analyze)

### Recommended Action

{specific suggestions based on error type}
```

---

### Report Format: Pattern B (Expert Question)

```markdown
## `/do` - Complete

**Requirement:** {requirement}
**Domain:** {claude-config|agent-authoring|database|api|testing|indexer|github}
**Type:** Question

### Answer

{answer from question-agent}

### Related

{any related topics, files, or examples from question-agent}
```

---

### Report Format: Pattern C (Simple Workflow)

```markdown
## `/do` - Complete

**Requirement:** {requirement}
**Handler:** {agent used}
**Status:** Success

### Results

{results from agent}

### Files Modified

{if any files were modified}

### Next Steps

{if applicable}
```

---

## Classification Logic

Use these patterns to classify requirements:

---

### Expert Domain Indicators (Priority - Check First)

**Claude Config Expert (High Confidence):**
- Verbs: create, add, implement, configure, update, fix
- Objects: command, hook, settings, slash command, frontmatter
- Locations: .claude/commands/, .claude/hooks/, .claude/settings.json
- Pattern: Claude Code configuration changes

**Agent Authoring Expert (High Confidence):**
- Verbs: create, configure, update, set up
- Objects: agent, expert domain, tool selection, frontmatter, registry
- Locations: .claude/agents/, agent file names, agent-registry.json
- Pattern: Agent creation or configuration tasks

**Database Expert (High Confidence):**
- Keywords: schema, migration, SQLite, FTS5, database, query, index, table
- Locations: app/src/db/, sqlite-schema.sql
- Verbs: create, optimize, add, migrate, update
- Objects: migration, schema, query, index, table, FTS5 search
- Pattern: Database schema changes, migrations, query optimization
- Examples: "Create migration for X", "Optimize query for Y", "Add FTS5 search"

**API Expert (High Confidence):**
- Keywords: endpoint, route, MCP tool, API, HTTP, server, OpenAPI
- Locations: app/src/api/, app/src/mcp/
- Verbs: add, create, update, implement
- Objects: endpoint, route, MCP tool, API, OpenAPI spec
- Pattern: API endpoint creation, MCP tool implementation, server routes
- Examples: "Add endpoint for X", "Create MCP tool for Y", "Update OpenAPI spec"

**Testing Expert (High Confidence):**
- Keywords: test, antimocking, Bun test, sqlite test, test lifecycle
- Locations: app/tests/, __tests__/
- Verbs: write, add, create, fix
- Objects: test, tests, integration test, unit test
- Pattern: Test creation, test fixes, testing strategy
- Examples: "Write tests for X", "How do I test Y", "Add integration test"

**Indexer Expert (High Confidence):**
- Keywords: AST, parser, symbol, reference, indexing, code analysis
- Locations: app/src/indexer/
- Verbs: extract, parse, index, analyze
- Objects: symbols, references, AST, code analysis
- Pattern: Code indexing, symbol extraction, AST parsing
- Examples: "Extract symbols from X", "Index repository", "Parse AST for Y"

**GitHub Expert (High Confidence):**
- Keywords: issue, PR, pull request, branch, commit, gh CLI, GitHub
- Locations: .github/, issues commands
- Verbs: create, classify, open, close, review
- Objects: issue, PR, pull request, branch, commit
- Pattern: GitHub workflow operations, issue management, PR creation
- Examples: "Classify issue", "Create PR for X", "Branch naming for Y"

**Expert Question Detection:**
- Phrasing: "How do I...", "What is the pattern for...", "Explain...", "Why..."
- Action: Route to `<domain>-question-agent` instead of `<domain>-plan-agent`

---

### Pattern Classification (After Domain Identified)

Once expert domain is identified, determine which pattern:

**Implementation Request:**
- Verbs: fix, add, create, implement, update, configure, refactor
- Objects: Concrete things to build/change
- Pattern: Use Pattern A (Plan-Build-Improve)

**Question Request:**
- Phrasing: "How do I...", "What is...", "Why...", "Explain...", "When should I..."
- Pattern: Use Pattern B (Question-Agent)

**Simple Operation:**
- Verbs: regenerate, format, lint, compile
- Objects: Single-purpose operations
- Pattern: Use Pattern C (Simple Workflow)

**Ambiguous Indicators (Ask User):**
- Generic verbs: do, make, help with
- Vague objects: "something", "this", "that"
- Multiple possible interpretations

---

## Error Handling

### Classification Errors

**Classification unclear:**
- Use AskUserQuestion to disambiguate
- Provide options for all available expert domains:
  - "Claude config (commands/hooks/settings)"
  - "Agent authoring (agents/registry)"
  - "Database (schema/migrations/queries)"
  - "API (endpoints/MCP tools/routes)"
  - "Testing (tests/test strategy)"
  - "Indexer (AST/symbols/parsing)"
  - "GitHub (issues/PRs/branches)"
- Never guess when multiple patterns could apply

**Empty requirement:**
- Ask user what they want to do
- Provide examples of common requests

---

### Pattern A Errors (Expert Implementation)

**Plan phase fails:**
- Report error with context
- Include full error details from plan-agent
- Suggest retrying with more detailed requirement
- Exit gracefully (no spec to build from, no point continuing)

**User declines at approval gate:**
- This is NOT an error - it's a valid workflow outcome
- Report spec location
- Suggest how to resume later
- Exit gracefully with status: "Plan Complete - User Review Requested"

**Build phase fails:**
- Preserve the spec (it's valid, build just failed)
- Report what went wrong with full error context
- Suggest manual review of spec
- Provide resume command: `/do "build from {spec_path}"`
- Skip improve stage (nothing to learn from a failed build)
- Overall status: Failed (but plan is preserved)

**Improve phase fails:**
- Log the error for diagnostics
- Set improve_status: "Skipped - Error"
- Continue to report (build succeeded, that's what matters)
- Overall workflow status: Success (improvement is a bonus)
- Rationale: Expertise updates shouldn't block successful builds

---

### Pattern B Errors (Expert Question)

**Agent fails:**
- Report error with full context
- Suggest manual approach if applicable
- Overall status: Failed

**Agent returns empty result:**
- Report diagnostic info (agent spawned, but no output)
- Suggest retry or alternative approach
- Don't claim completion with empty results

---

### Pattern C Errors (Simple Workflow)

**Agent fails:**
- Report error with context
- Suggest alternative approaches
- Overall status: Failed

---

### General Error Principles

**Never claim completion with incomplete results:**
- Validate outputs before reporting success
- Empty outputs - investigate, don't report "complete"
- Partial outputs - report "Partial Success" with details

**Preserve artifacts on failure:**
- Specs are valuable even if build fails
- Error context should be comprehensive

**Graceful degradation:**
- If improve fails, build success is still success
- User declining is not a failure, it's a choice

**Actionable error messages:**
- Always include what went wrong
- Always include how to retry or work around
- Include diagnostic info for debugging
- Suggest specific next steps

---

## KotaDB Conventions (MUST ENFORCE)

All agents must follow these conventions:

### Path Aliases
Use TypeScript path aliases for all imports:
- `@api/*` - src/api/*
- `@db/*` - src/db/*
- `@indexer/*` - src/indexer/*
- `@mcp/*` - src/mcp/*
- `@shared/*` - src/shared/*
- `@validation/*` - src/validation/*
- `@logging/*` - src/logging/*

### Logging Standards
- Use `process.stdout.write()` or `process.stderr.write()`
- NEVER use `console.log`, `console.error`, etc.
- Use `@logging/logger` factory for structured logging

### Storage
- Local SQLite only (no cloud dependencies)
- Database at `app/data/kotadb.db`

### Commit Format
```
{type}({scope}): {description}

{body}

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Examples

### Claude Config - Implementation (Pattern A)

```bash
/do "Create slash command for code review"

# /do executes:
# 1. Classification: claude-config expert, implementation request
# 2. Pattern: A (Plan-Build-Improve)
# 3. Spawn: claude-config-plan-agent
# 4. Wait for spec path
# 5. AskUserQuestion: "Plan complete at {spec_path}. Proceed?"
# 6. If yes: Spawn claude-config-build-agent with spec_path
# 7. Wait for files modified
# 8. Spawn: claude-config-improve-agent
# 9. Report results
```

### Claude Config - Question (Pattern B)

```bash
/do "How do I add a pre-commit hook?"

# /do executes:
# 1. Classification: claude-config expert, question
# 2. Pattern: B (Question-Agent)
# 3. Spawn: claude-config-question-agent
# 4. Wait for answer
# 5. Report answer
```

### Agent Authoring - Implementation (Pattern A)

```bash
/do "Create a new validation agent"

# /do executes Pattern A with agent-authoring domain:
# 1. agent-authoring-plan-agent creates spec
# 2. User approval gate
# 3. agent-authoring-build-agent creates agent file
# 4. agent-authoring-improve-agent updates expertise
```

### Agent Authoring - Question (Pattern B)

```bash
/do "What model should I use for a coordinator?"

# /do executes Pattern B with agent-authoring-question-agent
```

### Database - Implementation (Pattern A)

```bash
/do "Create migration for user preferences table"

# /do executes Pattern A with database domain:
# 1. database-plan-agent creates spec
# 2. User approval gate
# 3. database-build-agent implements migration
# 4. database-improve-agent updates expertise
```

### API - Implementation (Pattern A)

```bash
/do "Add MCP tool for repository search"

# /do executes Pattern A with api domain:
# 1. api-plan-agent creates spec
# 2. User approval gate
# 3. api-build-agent implements MCP tool
# 4. api-improve-agent updates expertise
```

### Testing - Implementation (Pattern A)

```bash
/do "Write tests for the indexer module"

# /do executes Pattern A with testing domain:
# 1. testing-plan-agent creates spec
# 2. User approval gate
# 3. testing-build-agent writes tests
# 4. testing-improve-agent updates expertise
```

### Indexer - Implementation (Pattern A)

```bash
/do "Index repository symbols"

# /do executes Pattern A with indexer domain:
# 1. indexer-plan-agent creates spec
# 2. User approval gate
# 3. indexer-build-agent implements indexing
# 4. indexer-improve-agent updates expertise
```

### GitHub - Implementation (Pattern A)

```bash
/do "Create PR for feature branch"

# /do executes Pattern A with github domain:
# 1. github-plan-agent creates spec
# 2. User approval gate
# 3. github-build-agent creates PR
# 4. github-improve-agent updates expertise
```

### User Declining at Approval Gate

```bash
/do "Add new hook for session logging"

# Workflow:
# 1. claude-config-plan-agent creates spec
# 2. AskUserQuestion: "Proceed with build?"
# 3. User selects: "No, stop here - I'll review first"
# 4. /do reports:
#    "Plan Complete - User Review Requested"
#    "Spec at: .claude/.cache/specs/claude-config/session-logging-hook-spec.md"
#    "Resume with: /do 'build from {spec_path}'"
# 5. Exit gracefully (NOT an error)
```

### Ambiguous Request

```bash
/do "Add feature"

# Ambiguous - unclear which domain
# Use AskUserQuestion:
#   "What type of feature?"
#   Options:
#     - "Claude config (commands, hooks, settings)"
#     - "Agent authoring (agents, registry, expert domains)"
#     - "Database (schema, migrations, queries)"
#     - "API (endpoints, MCP tools, routes)"
#     - "Testing (tests, test strategy)"
#     - "Indexer (AST, symbols, parsing)"
#     - "GitHub (issues, PRs, branches)"
# Route based on response
```

### Build Resumption (Future Enhancement)

```bash
# After reviewing spec, user can resume:
/do "build from .claude/.cache/specs/claude-config/code-review-command-spec.md"

# /do executes:
# 1. Detects "build from {path}" pattern
# 2. Skips plan phase (spec already exists)
# 3. Skips approval (user already reviewed)
# 4. Spawns: claude-config-build-agent with PATH_TO_SPEC
# 5. Spawns: claude-config-improve-agent
# 6. Reports results
```

**Note:** Build resumption is a future enhancement. For Phase 1, users would re-run full workflow.

---

## Observability

Spec files are stored locally:

**Spec Files**:
- Location: `.claude/.cache/specs/{domain}/`
- Format: `{slug}-spec.md`

**Example**:
```
.claude/.cache/specs/
  claude-config/
    code-review-command-spec.md
    session-logging-hook-spec.md
  agent-authoring/
    validation-agent-spec.md
  database/
    user-preferences-migration-spec.md
  api/
    repository-search-tool-spec.md
  testing/
    indexer-tests-spec.md
  indexer/
    symbol-extraction-spec.md
  github/
    feature-pr-spec.md
```

**Reading Specs**:
```bash
# List all specs
ls -la .claude/.cache/specs/

# View a specific spec
cat .claude/.cache/specs/claude-config/code-review-command-spec.md
```

---

## Implementation Notes

**Current State:**
- 7 expert domains active: claude-config, agent-authoring, database, api, testing, indexer, github
- 3 orchestration patterns: Expert Implementation (A), Expert Question (B), Simple Workflow (C)
- Expert domains use plan-build-improve cycle with user approval gates
- Classification uses keyword matching + pattern detection with fallback to user questions

**Execution Control:**
- Task tool calls are inherently blocking (wait for subagent completion)
- No `run_in_background` parameter exists for Task tool (Bash only)
- Parallel execution: multiple Task calls in single message, still blocks for ALL
- /do MUST collect full output before responding
- Orchestration patterns enforce sequential dependencies (plan-approval-build-improve)
- Validation checkpoints prevent premature completion
- `--print` mode compatibility guaranteed by synchronous execution pattern

**Orchestration:**
- /do directly manages plan-build-improve cycle (no coordinator intermediary)
- User approval gate after plan phase prevents unwanted implementations
- Improve phase is opportunistic (non-blocking failure)
- Specs are artifacts - preserved even if build fails, enable resumption
- Pattern selection based on requirement type (implementation vs question)

**Expert Domain Constraints:**
- User approval required - Plan phase requires explicit approval before build
- Spec preservation - Specs saved even if build fails (enable resume)
- Graceful degradation - Improve phase failures don't fail workflow
- Question direct - Question patterns skip approval (read-only)

**Future Enhancements:**
- Implement `--background` flag for autonomous execution (skip approval gates)
- Add `--plan-only` flag (stop after plan, don't ask to continue)
- Add `--build-only <spec-path>` flag (resume from existing spec)
- Add `--no-improve` flag (skip improvement phase)
- Build resumption: `/do "build from {spec_path}"` pattern
