---
description: Team-based parallel execution with agent teams coordination
argument-hint: <requirement>
allowed-tools: Read, Glob, Grep, Teammate, SendMessage, Task, AskUserQuestion
---

# `/do-teams` - Team Orchestration

Parallel execution using agent teams. You orchestrate the team: spawn teammates, coordinate their work, and synthesize results. All teammates report directly to you.

## Your Role

You are the **team lead**. Your job:
1. Create a team
2. Spawn ALL teammates directly (flat structure — no intermediate leads)
3. Receive their results (automatically delivered)
4. Synthesize and report

You do NOT do the work yourself — teammates do. You coordinate.

## Official API Constraints

These are hard constraints of the teams system:

| Constraint | Detail |
|-----------|--------|
| **No nested teams** | Teammates cannot spawn sub-teams or other teammates |
| **One team per session** | Only one team can be active at a time |
| **No session resumption** | Cannot resume a session with in-process teammates |
| **Lead is fixed** | You (the session creator) are lead for the team's lifetime |
| **Permissions inherited** | All teammates inherit your permission settings at spawn |
| **File locking** | Task claiming uses file locking to prevent race conditions |

## Workflow

### Step 1: Create Team

```
Teammate(
  operation: "spawnTeam",
  team_name: "{domain}-team",
  description: "Working on {requirement summary}"
)
```

This makes you the team lead. You'll receive messages from teammates automatically.

### Step 2: Identify Domain and Load Expertise

Classify the requirement to identify the target domain(s):

| Domain | Keywords | Location |
|--------|----------|----------|
| **database** | schema, migration, SQLite, FTS5, query, index, table | app/src/db/ |
| **api** | endpoint, route, MCP tool, HTTP, server, OpenAPI | app/src/api/, app/src/mcp/ |
| **testing** | test, antimocking, Bun test, SQLite test | app/tests/, __tests__/ |
| **indexer** | AST, parser, symbol, reference, code analysis | app/src/indexer/ |
| **github** | issue, PR, branch, commit, gh CLI | .github/ |
| **claude-config** | command, hook, settings, .claude | .claude/commands/, .claude/hooks/ |
| **agent-authoring** | agent, expert domain, tool selection, registry | .claude/agents/ |
| **automation** | ADW, automated workflow, script, CI/CD | .claude/commands/automation/ |
| **documentation** | docs, README, API reference, architecture docs | web/docs/content/ |
| **web** | homepage, blog, CSS, design system, Liquid Glass, kotadb.io, marketing site | web/ |

Expertise is loaded by each teammate from their agent's context contract:
```
Your agent's contextContract.requires declares the expertise file.
Load it per your contract before starting work.
```

### Step 3: Auto-Detect Coordination Pattern

**Implementation Pattern** (building/changing code):
- Cross-domain features requiring multiple specialists
- Tasks with clear subtask decomposition
- Parallel implementation across different areas

**Council Pattern** (analysis/research):
- Multi-perspective analysis
- Architecture decisions needing multiple viewpoints
- Research requiring different domain expertise

**Pattern Selection:**
```
IF requirement contains:
  - "implement", "add", "create", "build", "fix", "update"
  - Multiple domain keywords
  THEN: Implementation

IF requirement contains:
  - "analyze", "research", "review", "assess", "compare"
  - "architecture", "design", "strategy"
  THEN: Council
```

### Step 4: Spawn Teammates

Use Task tool with `team_name` and `name` parameters. **Spawn all teammates directly — no intermediate lead agents.**

---

#### Implementation Pattern

**All teammates report directly to you (the orchestrator):**
```
Task(
  subagent_type: "{domain}-build-agent",
  team_name: "{team-name}",
  name: "db-specialist",
  prompt: |
    ## ROLE
    You are a database specialist working on {specific subtask}.

    ## CONTEXT
    EXPERTISE: Load expertise per your agent's context contract.
    Path: .claude/agents/experts/{domain}/expertise.yaml
    TEAM: {team-name}

    Read the expertise file before starting work.

    ## TASK
    {specific subtask - narrow and clear}

    ## FILE OWNERSHIP
    You own: {list of files this teammate may modify}
    Do NOT modify files outside your ownership scope.

    ## CONSTRAINTS
    - Complete your task independently
    - Send result to orchestrator when done using structured format (see OUTPUT FORMAT)
    - Report blockers immediately via SendMessage
    - Use path aliases: @api/*, @db/*, @indexer/*, @mcp/*, @validation/*, @shared/*
    - Use process.stdout.write() for logging (never console.*)

    ## OUTPUT FORMAT
    Send your result to the orchestrator via SendMessage with this JSON structure:
    {
      "status": "complete" | "blocked" | "failed",
      "summary": "1-3 sentences summarizing result",
      "filesModified": ["absolute/path/to/file"],
      "nextSteps": ["recommended follow-up action"]
    }
)
```

Repeat for each specialist. Example team for a cross-domain feature:
```
Orchestrator (you)
  ├── Task(name="db-specialist")     → schema + migration
  ├── Task(name="api-specialist")    → endpoint implementation
  └── Task(name="test-specialist")   → test coverage
```

---

#### Council Pattern

**Expert agents provide independent analysis, all reporting to you:**
```
Task(
  subagent_type: "{domain}-question-agent",
  team_name: "{team-name}",
  name: "{domain}-expert",
  prompt: |
    ## ROLE
    You are a {domain} expert providing independent analysis.

    ## CONTEXT
    EXPERTISE: Load expertise per your agent's context contract.
    Path: .claude/agents/experts/{domain}/expertise.yaml
    TEAM: {team-name}

    Read the expertise file. Apply {domain} lens to analysis.

    ## TASK
    {Question or topic requiring expert perspective}

    ## CONSTRAINTS
    - Analyze independently (do not coordinate with peers)
    - Ground claims in evidence from expertise
    - Acknowledge limitations of {domain} perspective
    - Allowed tools: Read, Glob, Grep, SendMessage

    ## OUTPUT FORMAT
    Send your result to the orchestrator via SendMessage with this JSON structure:
    {
      "status": "complete",
      "summary": "Key finding in 1-3 sentences",
      "filesRead": ["files/consulted/for/analysis"],
      "nextSteps": ["recommended action from {domain} viewpoint"]
    }
)
```

**CRITICAL: Spawn all teammates in a SINGLE message for parallel execution.**

### Step 5: Task Sizing Guidance

Right-size tasks for teammates:

| Size | Problem | Symptom |
|------|---------|---------|
| **Too small** | Coordination overhead exceeds benefit | More time spawning than working |
| **Too large** | Teammates work too long without check-ins | Long silence, integration issues |
| **Just right** | Self-contained units with clear deliverables | ~5-6 tasks per teammate |

**Guidelines:**
- Each teammate should have a clear, self-contained deliverable
- Break work so each teammate owns different files (avoid two teammates editing the same file)
- If a teammate needs output from another, establish task dependencies via TaskUpdate with `addBlockedBy`

### Step 6: Coordinate (if needed)

Use SendMessage to communicate with teammates:

**Direct message:**
```
SendMessage(
  type: "message",
  recipient: "db-specialist",
  content: "Additional context: the preferences table needs a user_id foreign key"
)
```

**Broadcast (use sparingly — sends to ALL teammates):**
```
SendMessage(
  type: "broadcast",
  content: "Requirement updated: also support bulk operations"
)
```

Teammates automatically send you messages when they complete work. These arrive as new conversation turns.

### Step 7: Receive and Validate Results

Wait for all teammates before synthesizing. You'll receive structured results with:
- `status`: complete, blocked, or failed
- `summary`: what was done
- `filesModified`: files changed
- `nextSteps`: recommended follow-ups

**If a teammate reports `blocked`:** check `blockedBy` field and help unblock or reassign.
**If a teammate reports `failed`:** check `error` field, attempt recovery or report partial results.

### Step 8: Synthesize and Report

```markdown
## `/do-teams` - Complete

**Requirement:** {requirement}
**Team:** {team-name}
**Pattern:** {Implementation | Council}
**Status:** Success

### Team

| Name | Role | Status |
|------|------|--------|
| db-specialist | Schema + migration | Complete |
| api-specialist | Endpoint implementation | Complete |
| test-specialist | Test coverage | Complete |

### Results

{synthesized from teammate outputs}

### Files Modified

- {file1} - {change}
- {file2} - {change}

### Next Steps

- {suggestion based on what was done}
```

### Step 9: Cleanup

```
Teammate(operation: "cleanup")
```

For quick teams, skip explicit shutdown — teammates timeout after ~5 minutes of inactivity.

---

## Coordination Patterns

### Implementation (Flat)

```
You (orchestrator)
  ├── spawn → db-specialist (schema + migration) → reports to you
  ├── spawn → api-specialist (endpoint handlers) → reports to you
  └── spawn → test-specialist (test coverage) → reports to you
  You synthesize all results
```

**Best for:**
- Cross-domain features (API + database + tests)
- Parallel implementation across areas
- Tasks with clear subtask decomposition

### Council (Flat)

```
You (orchestrator)
  ├── spawn → database-expert → reports to you
  ├── spawn → api-expert → reports to you
  └── spawn → testing-expert → reports to you
  You synthesize all perspectives
```

**Best for:**
- Architecture decisions
- Multi-perspective code review
- Research requiring domain expertise
- "How should we..." questions

---

## File Conflict Avoidance

**CRITICAL:** Two teammates editing the same file leads to overwrites. Prevent this:

1. **Assign file ownership** — each teammate's prompt lists which files they may modify
2. **Break by layer** — one teammate owns the schema, another the handler, another the tests
3. **If overlap is unavoidable** — make one teammate dependent on the other via `addBlockedBy`

---

## Structured Coordination Messages

Teammates should format SendMessage content as JSON matching the coordination message schema (`.claude/schemas/coordination-messages.schema.json`).

**Result message (teammate → orchestrator):**
```json
{
  "status": "complete",
  "summary": "Created preferences table with user_id FK and indexes",
  "filesModified": [
    "app/src/db/migrations/003_preferences.ts",
    "app/src/db/schema.ts"
  ],
  "nextSteps": ["Run migration", "Add API handler"]
}
```

**Status update (teammate → orchestrator):**
```json
{
  "taskId": "api-endpoint",
  "status": "in_progress",
  "progress": "Handler implemented, working on validation"
}
```

**Question (teammate → orchestrator):**
```json
{
  "taskId": "test-coverage",
  "question": "Should tests use in-memory SQLite or file-based?",
  "options": ["in-memory (faster)", "file-based (closer to production)"]
}
```

---

## KotaDB-Specific Patterns

### Cross-Domain Feature Implementation

**Example:** "Add endpoint with DB persistence and tests"

```
Team: feature-team
Pattern: Implementation

Orchestrator spawns:
  - db-specialist: Schema + migration (owns app/src/db/**)
  - api-specialist: Endpoint implementation (owns app/src/api/**)
  - test-specialist: Test coverage (owns app/tests/**)
```

### Parallel Test Execution

**Example:** "Run tests across all modules"

```
Team: testing-team
Pattern: Implementation

Orchestrator spawns:
  - db-tester: bun test app/tests/db/ (owns db test results)
  - api-tester: bun test app/tests/api/ (owns api test results)
  - indexer-tester: bun test app/tests/indexer/ (owns indexer test results)
```

### Multi-Perspective Analysis

**Example:** "Review API design for the new search feature"

```
Team: review-team
Pattern: Council

Orchestrator spawns:
  - database-expert: Query efficiency perspective
  - api-expert: API design patterns perspective
  - indexer-expert: Search optimization perspective
  - testing-expert: Testability concerns perspective
```

---

## Expertise and Context Contracts

Teammates load expertise through their agent's context contract rather than raw paths:

- Each agent definition declares a `contextContract.requires` array
- The expertise file is loaded by the teammate as part of contract fulfillment
- This prevents context bloat (teammates load only what they need)

**Pass the expertise path in the prompt as a fallback:**
```
EXPERTISE: .claude/agents/experts/{domain}/expertise.yaml
Read this file before starting work.
```

---

## Learning Separation

**Teammates execute tasks only. They do NOT update expertise.**

Learning happens separately:
1. Team completes work
2. Later: Domain improve-agent analyzes git history
3. Improve-agent updates expertise.yaml

---

## KotaDB Conventions (MUST ENFORCE)

All teammates must follow these conventions:

**Path Aliases:**
- `@api/*` - src/api/*
- `@db/*` - src/db/*
- `@indexer/*` - src/indexer/*
- `@mcp/*` - src/mcp/*
- `@shared/*` - src/shared/*
- `@validation/*` - src/validation/*
- `@logging/*` - src/logging/*

**Logging:** Use `process.stdout.write()` / `process.stderr.write()` (never `console.*`)

**Storage:** Local SQLite only (no cloud dependencies)

**Testing:** Run `bun test` after changes, use antimocking patterns

---

## Error Handling

**TeammateTool unavailable:**
```markdown
## `/do-teams` - Error

TeammateTool not available. This feature may be server-side gated.

**Alternative:** Use `/do` for sequential execution.
```

**Teammate failed:**
- Report which teammate failed and the `error` field from their result
- Include partial results from successful teammates
- Suggest manual completion of failed work

**Cannot classify requirement:**
- Use AskUserQuestion to clarify
- Provide domain options

---

## Known Limitations

| Limitation | Workaround |
|------------|------------|
| No nested teams | Orchestrator spawns all teammates directly |
| One team per session | Plan all parallel work upfront |
| No session resumption with active teammates | Complete work within single session |
| Idle notifications are automatic | Wait for structured result messages |
| No progress visibility by default | Instruct teammates to send status_update messages |
| File conflict on shared files | Assign file ownership per teammate |

**Expected timing:**
- Spawn → First result: ~30 seconds
- All parallel results: ~1-2 minutes
- Full shutdown ceremony: ~30 seconds overhead (skippable)

---

## Examples

### Example 1: Add Endpoint with Database Persistence

```bash
/do-teams "Add /api/v1/preferences endpoint with SQLite persistence and tests"
```

**Execution:**
1. Create team: `preferences-feature-team`
2. Pattern: Implementation (cross-domain)
3. Spawn all teammates directly:
   - `db-specialist`: Creates preferences table migration (owns `app/src/db/**`)
   - `api-specialist`: Implements endpoint handlers (owns `app/src/api/**`)
   - `test-specialist`: Writes API and database tests (owns `app/tests/**`)
4. Receive structured results from each
5. Synthesize and report all files modified

### Example 2: Parallel Module Testing

```bash
/do-teams "Run comprehensive tests across database, API, and indexer modules"
```

**Execution:**
1. Create team: `test-team`
2. Pattern: Implementation (parallel testing)
3. Spawn all directly:
   - `db-tester`: `bun test app/tests/db/`
   - `api-tester`: `bun test app/tests/api/`
   - `indexer-tester`: `bun test app/tests/indexer/`
4. Receive pass/fail results from each
5. Aggregate and report test summary

### Example 3: Architecture Review

```bash
/do-teams "Review the proposed FTS5 search implementation across API, database, and indexer"
```

**Execution:**
1. Create team: `fts5-review-team`
2. Pattern: Council (multi-perspective)
3. Spawn experts directly:
   - `database-expert`: FTS5 schema efficiency
   - `api-expert`: Search endpoint design
   - `indexer-expert`: Symbol extraction compatibility
   - `testing-expert`: Search testability
4. Each analyzes independently, reports structured findings
5. Synthesize recommendations, conflicts, consensus

### Example 4: MCP Tool with Full Stack

```bash
/do-teams "Create MCP tool for dependency analysis with database caching"
```

**Execution:**
1. Create team: `mcp-dependency-team`
2. Pattern: Implementation
3. Spawn all directly:
   - `db-specialist`: Cache table schema (owns `app/src/db/**`)
   - `indexer-specialist`: Dependency extraction logic (owns `app/src/indexer/**`)
   - `api-specialist`: MCP tool handler (owns `app/src/mcp/**`)
   - `test-specialist`: MCP tool tests (owns `app/tests/**`)
4. Receive results, validate integration
5. Report files created

### Example 5: GitHub Workflow with Testing

```bash
/do-teams "Create PR with full test validation for the indexer changes"
```

**Execution:**
1. Create team: `pr-team`
2. Pattern: Implementation
3. Spawn all directly:
   - `test-specialist`: Runs full test suite
   - `indexer-specialist`: Validates indexer changes
   - `github-specialist`: Creates PR after tests pass (blocked by test-specialist)
4. Use `addBlockedBy` to ensure PR creation waits for test results
5. Report PR URL and test results
