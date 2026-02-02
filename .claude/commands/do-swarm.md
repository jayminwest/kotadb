---
description: Swarm-based parallel execution with TeammateTool coordination
argument-hint: <requirement>
allowed-tools: Read, Glob, Grep, Teammate, SendMessage, Task, AskUserQuestion
---

# `/do-swarm` - Swarm Orchestration

Parallel execution using teams of agents that communicate via messaging. You orchestrate a swarm: spawn a team, spawn teammates, coordinate their work, and synthesize results.

## Your Role

You are the **team leader**. Your job:
1. Create a team
2. Spawn teammates with focused tasks
3. Receive their results (automatically delivered)
4. Synthesize and report

You do NOT do the work yourself—teammates do. You coordinate.

## Workflow

### Step 1: Create Team

```
Teammate(
  operation: "spawnTeam",
  team_name: "{domain}-swarm",
  description: "Working on {requirement summary}"
)
```

This makes you the team leader. You'll receive messages from teammates automatically.

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

Get the expertise path:
```
expertise_path = /Users/jayminwest/Projects/kotadb/.claude/agents/experts/{domain}/expertise.yaml
```

### Step 3: Auto-Detect Coordination Pattern

**Leader-Worker Pattern** (Implementation tasks):
- Cross-domain features requiring multiple specialists
- Tasks with clear subtask decomposition
- Parallel implementation across different areas

**Council Pattern** (Analysis/Research tasks):
- Multi-perspective analysis
- Architecture decisions needing multiple viewpoints
- Research requiring different domain expertise

**Pattern Selection:**
```
IF requirement contains:
  - "implement", "add", "create", "build", "fix", "update"
  - Multiple domain keywords
  THEN: Leader-Worker

IF requirement contains:
  - "analyze", "research", "review", "assess", "compare"
  - "architecture", "design", "strategy"
  THEN: Council
```

### Step 4: Spawn Teammates

Use Task tool with `team_name` and `name` parameters.

---

#### Leader-Worker Pattern

**Lead Agent (domain expert):**
```
Task(
  subagent_type: "{domain}-build-agent",
  team_name: "{team-name}",
  name: "lead",
  prompt: |
    ## ROLE
    You are the lead {domain} expert coordinating this swarm.
    Your sole focus is coordinating workers and synthesizing results.

    ## CONTEXT
    EXPERTISE_PATH: /Users/jayminwest/Projects/kotadb/.claude/agents/experts/{domain}/expertise.yaml
    TEAM: {team-name}
    WORKERS: worker-1, worker-2, worker-3

    Read the expertise file before starting. You have full domain context.

    ## TASK
    {main requirement}

    ## CONSTRAINTS
    - Distribute subtasks to workers via SendMessage
    - Wait for all worker results before synthesizing
    - Validate consistency across worker contributions
    - Allowed tools: Read, Glob, Grep, SendMessage

    ## OUTPUT FORMAT
    ### Synthesis
    **Workers:** table of worker status
    **Combined Result:** integrated output
    **Files Modified:** all files from all workers
)
```

**Worker Agents (narrow focus):**
```
Task(
  subagent_type: "build-agent",
  team_name: "{team-name}",
  name: "worker-1",
  prompt: |
    ## ROLE
    You are a specialist worker focused on {narrow task}.
    Your sole focus is {specific deliverable}.

    ## CONTEXT
    EXPERTISE_PATH: /Users/jayminwest/Projects/kotadb/.claude/agents/experts/{domain}/expertise.yaml
    TEAM: {team-name}
    LEADER: lead

    Read the expertise file. Focus on sections relevant to your task.

    ## TASK
    {specific subtask - narrow and clear}

    ## CONSTRAINTS
    - Complete your task independently
    - Allowed tools: Read, Write, Edit, Glob, Grep, SendMessage
    - Send results to "lead" when done
    - Report blockers immediately
    - Use path aliases: @api/*, @db/*, @indexer/*, @mcp/*, @validation/*, @shared/*
    - Use process.stdout.write() for logging (never console.*)

    ## OUTPUT FORMAT
    ### Status
    {Complete | Blocked}
    ### Files Modified
    - {path} - {change}
    ### Summary
    {1-2 sentences}
)
```

---

#### Council Pattern

**Expert Agents (independent analysis):**
```
Task(
  subagent_type: "{domain}-question-agent",
  team_name: "{team-name}",
  name: "{domain}-expert",
  prompt: |
    ## ROLE
    You are a {domain} expert providing independent analysis.
    Your sole focus is {domain} perspective on the question.

    ## CONTEXT
    EXPERTISE_PATH: /Users/jayminwest/Projects/kotadb/.claude/agents/experts/{domain}/expertise.yaml
    TEAM: {team-name}
    PEERS: {other domain experts - for awareness, not coordination}

    Read the expertise file. Apply {domain} lens to analysis.

    ## TASK
    {Question or topic requiring expert perspective}

    ## CONSTRAINTS
    - Analyze independently (do not coordinate with peers)
    - Ground claims in evidence from expertise
    - Acknowledge limitations of {domain} perspective
    - Send plain-text findings to orchestrator when complete
    - Allowed tools: Read, Glob, Grep, SendMessage

    ## OUTPUT FORMAT
    ### {Domain} Expert Analysis

    **Key Findings:**
    - {finding 1}
    - {finding 2}

    **Evidence:**
    {Supporting references from expertise or codebase}

    **Limitations:**
    {What this perspective does NOT cover}

    **Recommendation:**
    {Actionable suggestion from {domain} viewpoint}
)
```

**CRITICAL: Spawn all teammates in a SINGLE message for parallel execution.**

### Step 5: Coordinate (if needed)

Use SendMessage to communicate with teammates:

**Direct message:**
```
SendMessage(
  type: "message",
  recipient: "lead",
  content: "Additional context: ..."
)
```

**Broadcast (use sparingly):**
```
SendMessage(
  type: "broadcast",
  content: "Everyone focus on X aspect"
)
```

Teammates automatically send you messages when they complete work. These arrive as new conversation turns.

### Step 6: Receive Results

Wait for critical teammates before synthesizing. You'll receive:
- Task completion reports
- Files modified
- Questions or blockers

### Step 7: Synthesize and Report

```markdown
## `/do-swarm` - Complete

**Requirement:** {requirement}
**Team:** {team-name}
**Pattern:** {Leader-Worker | Council}
**Status:** Success

### Team

| Name | Role | Status |
|------|------|--------|
| lead | {domain} expert | Complete |
| worker-1 | {subtask} | Complete |
| worker-2 | {subtask} | Complete |

### Results

{synthesized from teammate outputs}

### Files Modified

- {file1} - {change}
- {file2} - {change}

### Next Steps

- {suggestion based on what was done}
```

### Step 8: Cleanup

```
Teammate(operation: "cleanup")
```

For quick swarms, skip explicit shutdown—teammates timeout after ~5 minutes of inactivity.

---

## Coordination Patterns

### Leader-Worker (Implementation)

```
You (orchestrator)
  └─ spawn → Lead (domain expert)
               └─ receives from → Worker 1 (subtask A)
               └─ receives from → Worker 2 (subtask B)
               └─ receives from → Worker 3 (subtask C)
               └─ synthesizes → reports to you
```

**Best for:**
- Cross-domain features (API + database + tests)
- Parallel implementation across areas
- Tasks with clear subtask decomposition

### Council (Analysis/Research)

```
You (orchestrator)
  └─ spawn → Database Expert → reports to you
  └─ spawn → API Expert → reports to you
  └─ spawn → Testing Expert → reports to you
  └─ you synthesize all perspectives
```

**Best for:**
- Architecture decisions
- Multi-perspective code review
- Research requiring domain expertise
- "How should we..." questions

---

## KotaDB-Specific Patterns

### Cross-Domain Feature Implementation

**Example:** "Add endpoint with DB persistence and tests"

```
Team: feature-swarm
Pattern: Leader-Worker

Lead: api-build-agent (owns the endpoint)
Workers:
  - database-worker: Schema + migration
  - api-worker: Endpoint implementation
  - testing-worker: Test coverage
```

### Parallel Test Execution

**Example:** "Run tests across all modules"

```
Team: testing-swarm
Pattern: Leader-Worker

Lead: testing-build-agent (coordinates)
Workers:
  - db-test-worker: Database tests
  - api-test-worker: API tests
  - indexer-test-worker: Indexer tests
```

### Multi-Perspective Analysis

**Example:** "Review API design for the new search feature"

```
Team: review-swarm
Pattern: Council

Experts:
  - api-expert: API design patterns
  - database-expert: Query efficiency
  - indexer-expert: Search optimization
  - testing-expert: Testability concerns
```

---

## Expertise Inheritance

Pass expertise path (not content) to teammates:

```
EXPERTISE_PATH: /Users/jayminwest/Projects/kotadb/.claude/agents/experts/{domain}/expertise.yaml

Read this file before starting work.
```

Teammates load expertise themselves. This prevents context bloat.

---

## Learning Separation

**Teammates execute tasks only. They do NOT update expertise.**

Learning happens separately:
1. Swarm completes work
2. Later: Domain improve-agent analyzes git history
3. Improve-agent updates expertise.yaml

---

## KotaDB Conventions (MUST ENFORCE)

All workers must follow these conventions:

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
## `/do-swarm` - Error

TeammateTool not available. This feature may be server-side gated.

**Alternative:** Use `/do` for sequential execution.
```

**Teammate failed:**
- Report which teammate failed
- Include partial results from successful teammates
- Suggest manual completion of failed work

**Cannot classify requirement:**
- Use AskUserQuestion to clarify
- Provide domain options

---

## Known Limitations

| Limitation | Workaround |
|------------|------------|
| Idle notifications are JSON | Wait for plain-text results |
| No progress visibility | Instruct teammates to send interim updates |
| Cleanup requires shutdown first | Skip for quick swarms (timeout approach) |

**Expected timing:**
- Spawn → First result: ~30 seconds
- All parallel results: ~1-2 minutes
- Full shutdown ceremony: ~30 seconds overhead (skippable)

---

## Examples

### Example 1: Add Endpoint with Database Persistence

```bash
/do-swarm "Add /api/v1/preferences endpoint with SQLite persistence and tests"
```

**Execution:**
1. Create team: "preferences-feature-swarm"
2. Pattern: Leader-Worker (cross-domain implementation)
3. Spawn:
   - Lead: api-build-agent (owns endpoint)
   - database-worker: Creates preferences table migration
   - api-worker: Implements endpoint handlers
   - testing-worker: Writes API and database tests
4. Lead synthesizes, validates consistency
5. Report all files modified

### Example 2: Parallel Module Testing

```bash
/do-swarm "Run comprehensive tests across database, API, and indexer modules"
```

**Execution:**
1. Create team: "test-swarm"
2. Pattern: Leader-Worker (parallel testing)
3. Spawn:
   - Lead: testing-build-agent
   - db-test-worker: `bun test app/tests/db/`
   - api-test-worker: `bun test app/tests/api/`
   - indexer-test-worker: `bun test app/tests/indexer/`
4. Lead aggregates test results
5. Report pass/fail summary

### Example 3: Architecture Review

```bash
/do-swarm "Review the proposed FTS5 search implementation across API, database, and indexer"
```

**Execution:**
1. Create team: "fts5-review-swarm"
2. Pattern: Council (multi-perspective)
3. Spawn experts:
   - database-expert: FTS5 schema efficiency
   - api-expert: Search endpoint design
   - indexer-expert: Symbol extraction compatibility
   - testing-expert: Search testability
4. Each analyzes independently
5. Synthesize recommendations, conflicts, consensus

### Example 4: MCP Tool with Full Stack

```bash
/do-swarm "Create MCP tool for dependency analysis with database caching"
```

**Execution:**
1. Create team: "mcp-dependency-swarm"
2. Pattern: Leader-Worker
3. Spawn:
   - Lead: api-build-agent (MCP tool owner)
   - database-worker: Cache table schema
   - indexer-worker: Dependency extraction logic
   - testing-worker: MCP tool tests
4. Lead coordinates integration
5. Report files created

### Example 5: GitHub Workflow with Testing

```bash
/do-swarm "Create PR with full test validation for the indexer changes"
```

**Execution:**
1. Create team: "pr-swarm"
2. Pattern: Leader-Worker
3. Spawn:
   - Lead: github-build-agent (PR creation)
   - testing-worker: Runs full test suite
   - indexer-worker: Validates indexer changes
4. Lead creates PR after tests pass
5. Report PR URL and test results
