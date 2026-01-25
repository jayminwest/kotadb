# /do - Universal Issue Resolution

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

End-to-end autonomous workflow for resolving GitHub issues AND Claude Code configuration tasks. Routes through appropriate workflows:

- **ADW (Python Orchestration)**: SDLC workflows (scout → plan → build → review → validate) for GitHub issues
- **Expert Domains (Claude Code)**: Configuration and agent authoring via plan → build → improve cycles

## Variables

- `$ARGUMENTS`: Issue reference OR expert domain request

## Classification Priority

**IMPORTANT**: Check expert domain keywords FIRST. If no match, fall through to ADW routing.

```
1. Expert Domain Detection (claude-config, agent-authoring)
   → Route to Pattern A (implementation) or Pattern B (question)
2. ADW Detection (issue numbers, GitHub URLs, SDLC keywords)
   → Route to ADW workflow
3. Free-form text
   → Classify and route appropriately
```

## Input Formats

Parse `$ARGUMENTS` to extract context:

| Format | Example | Action |
|--------|---------|--------|
| Expert domain keywords | `"create slash command"`, `"new agent"` | Route to expert workflow |
| Issue number | `#123` or `123` | Fetch via `gh issue view 123 --json title,body,labels` |
| GitHub URL | `https://github.com/.../issues/123` | Extract number, fetch via gh |
| Free-form text | `"Add user authentication"` | Use as requirement directly (ADW) |

---

## Expert Domain Routing (Priority - Check First)

### Expert Domains

**Claude Config Expert**
- Keywords: "slash command", "command", "hook", "settings.json", ".claude config", "expert triad"
- Locations: References to .claude/commands/, .claude/hooks/, .claude/settings.json
- Indicators: Command creation, hook implementation, .claude/ directory organization
- Examples: "Create new slash command for X", "Add hook for Y event", "Configure settings"

**Agent Authoring Expert**
- Keywords: "create agent", "new agent", "agent config", "tool selection", "agent description", "agent frontmatter"
- Locations: References to .claude/agents/, agent creation, coordinator setup
- Indicators: Agent file creation, tool set decisions, model selection for agents
- Examples: "Create a new scout agent", "Configure tools for the build agent", "Add new coordinator"

### Pattern Detection

After identifying expert domain, determine pattern:

**Implementation Request (Pattern A)**:
- Verbs: create, add, implement, configure, update, fix
- Objects: Concrete things to build/change
- Flow: plan-agent → user approval → build-agent → improve-agent

**Question Request (Pattern B)**:
- Phrasing: "How do I...", "What is...", "Why...", "Explain...", "When should I..."
- Flow: question-agent → report answer

### Expert Workflow Execution

#### Pattern A: Expert Implementation (Plan→Build→Improve)

**Phase 1 - Plan:**
```
Task tool:
  subagent_type: "<domain>-plan-agent"
  prompt: |
    USER_PROMPT: {requirement}

    Analyze this requirement and create a specification.
    Save spec to: .claude/.cache/specs/{domain}/{slug}-spec.md
    Return the spec path when complete.
```

**Phase 2 - User Approval:**
```
Use AskUserQuestion:
  question: "Plan complete. Specification saved to {spec_path}. Ready to proceed with implementation?"
  options:
    - "Yes, continue to build" (Recommended)
    - "No, stop here - I'll review the spec first"
```

**If user selects "No":**
- Report spec location
- Suggest resume command: `/do "build from {spec_path}"`
- Exit gracefully (NOT an error)

**Phase 3 - Build (if approved):**
```
Task tool:
  subagent_type: "<domain>-build-agent"
  prompt: |
    PATH_TO_SPEC: {spec_path}

    Read the specification and implement the changes.
    Report files modified when complete.
```

**Phase 4 - Improve (Optional):**
```
Task tool:
  subagent_type: "<domain>-improve-agent"
  prompt: |
    Review recent {domain} changes and update expert knowledge.
```

If improve-agent fails: log error, continue (workflow is still successful).

#### Pattern B: Expert Question (Direct Answer)

```
Task tool:
  subagent_type: "<domain>-question-agent"
  prompt: |
    USER_PROMPT: {requirement}

    Provide an informed answer based on {domain} expertise.
```

Report answer directly. No approval gate needed.

### Expert Domain Output Formats

**Pattern A Complete:**
```markdown
## `/do` - Complete

**Requirement:** {requirement}
**Domain:** {claude-config|agent-authoring}
**Status:** Success

### Workflow Stages

| Stage | Status | Key Output |
|-------|--------|------------|
| Plan | ✓ Complete | {spec_path} |
| Build | ✓ Complete | {file_count} files modified |
| Improve | ✓ Complete | Expert knowledge updated |

### Files Modified

- {file}: {change summary}

### Next Steps

{context-specific suggestions}
```

**Pattern A - User Declined:**
```markdown
## `/do` - Plan Complete, Awaiting Review

**Requirement:** {requirement}
**Domain:** {claude-config|agent-authoring}
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

**Pattern B Complete:**
```markdown
## `/do` - Complete

**Requirement:** {requirement}
**Domain:** {claude-config|agent-authoring}
**Type:** Question

### Answer

{answer from question-agent}

### Related

{any related topics, files, or examples}
```

---

## ADW Routing (GitHub Issues & SDLC)

## Issue Classification

Determine issue type from labels or content:

| Type | Indicators | Spec Required |
|------|------------|---------------|
| `feature` | `enhancement`, `feature`, "add", "implement", "create" | Yes |
| `bug` | `bug`, "fix", "broken", "error", "failing" | Yes |
| `chore` | `chore`, `maintenance`, "update deps", "refactor" | No |

## Execution Flow

### Phase 1: Scout (if spec required)

```
Task tool:
  subagent_type: "branch-plan-coordinator"
  prompt: |
    PHASE: Scout
    REQUIREMENT: {parsed_requirement}
    ISSUE_TYPE: {feature|bug|chore}

    Explore codebase to understand:
    1. Relevant files and modules
    2. Existing patterns to follow
    3. Dependencies and impacts
    4. Test file locations

    Return findings as structured report.
```

### Phase 2: Plan (if spec required)

```
Task tool:
  subagent_type: "branch-plan-coordinator"
  prompt: |
    PHASE: Plan
    REQUIREMENT: {parsed_requirement}
    ISSUE_TYPE: {feature|bug}
    SCOUT_FINDINGS: {scout_output}

    Create spec file at docs/specs/{type}-{issue_number}-{slug}.md

    Return: spec file path only
```

### Phase 3: Build

```
Task tool:
  subagent_type: "branch-build-coordinator"
  prompt: |
    PHASE: Build
    SPEC_FILE: {spec_path} (or inline requirement for chores)

    Implement all changes per spec.
    Run validation after implementation.
    Auto-fix any failures.
    Commit when validation passes.

    Return: build completion report
```

### Phase 4: Review

```
Task tool:
  subagent_type: "branch-review-coordinator"
  prompt: |
    PHASE: Review
    SPEC_FILE: {spec_path}
    BUILD_OUTPUT: {build_report}

    Verify implementation matches requirements.
    Check convention compliance.

    Return: review report with APPROVE or issues
```

### Phase 5: Validate (Final)

Run validation commands based on change scope:

| Level | Commands | Use When |
|-------|----------|----------|
| 1 | `bun run lint && bunx tsc --noEmit` | Docs, config only |
| 2 | Level 1 + `bun test --filter integration` | Features, bugs |
| 3 | Level 2 + `bun test && bun run build` | Schema, auth, migrations |

## Auto-Fix Loop

If validation fails:

```
WHILE validation_fails:
  1. Parse error output
  2. Spawn build agent with fix task:
     Task tool:
       subagent_type: "branch-build-coordinator"
       prompt: |
         FIX_MODE: true
         ERRORS: {validation_errors}

         Fix the identified issues.
  3. Re-run validation
  4. Continue until pass
```

## KotaDB Conventions (MUST ENFORCE)

All agents must follow these conventions:

### Path Aliases
Use TypeScript path aliases for all imports:
- `@api/*` → `src/api/*`
- `@auth/*` → `src/auth/*`
- `@db/*` → `src/db/*`
- `@indexer/*` → `src/indexer/*`
- `@mcp/*` → `src/mcp/*`
- `@shared/*` → `src/shared/*`
- `@validation/*` → `src/validation/*`
- `@queue/*` → `src/queue/*`
- `@logging/*` → `src/logging/*`

### Logging Standards
- Use `process.stdout.write()` or `process.stderr.write()`
- NEVER use `console.log`, `console.error`, etc.
- Use `@logging/logger` factory for structured logging

### Testing (Antimocking)
- Real Supabase Local connections only
- NO mocks, stubs, or fakes for database operations
- Use failure injection utilities for error testing

### Commit Format
```
{type}({scope}): {description}

{body}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Output Format

After completion, report:

```markdown
## /do Complete

**Issue**: {#number or description}
**Type**: {feature|bug|chore}
**Phases**: scout ✓ → plan ✓ → build ✓ → review ✓ → validate ✓

### Artifacts
- Spec: {path or "N/A for chore"}
- Commit: {commit hash}

### Files Modified
- {file}: {change summary}

### Validation
- Level: {1|2|3}
- Lint: ✓
- Typecheck: ✓
- Tests: {X/Y passed}

### Next Steps
{Any manual steps needed, or "Ready for PR"}
```

## Error Handling

If any phase fails unrecoverably:

```markdown
## /do Failed

**Failed Phase**: {phase_name}
**Error**: {description}

**Attempted Fixes**: {N} iterations

**Manual Resolution Required**:
1. {specific fix instruction}

**Resume**: Re-run `/do {original_input}` after fixing
```

## ADW Constraints

1. **No user checkpoints** - Run fully autonomously
2. **Use current branch** - Do not create new branches
3. **Commit only** - Do not push or create PR
4. **Unlimited fix attempts** - Keep fixing until validation passes
5. **Convention enforcement** - Fail review if conventions violated

---

## Expert Domain Constraints

1. **User approval required** - Plan phase requires explicit approval before build
2. **Spec preservation** - Specs saved even if build fails (enable resume)
3. **Graceful degradation** - Improve phase failures don't fail workflow
4. **Question direct** - Question patterns skip approval (read-only)

---

## ADW Integration

The `/do` command integrates with the Python ADW orchestration layer for multi-phase workflow execution.

### Commands

#### `/do/adw` - Full ADW Workflow Execution

Execute complete ADW workflow (scout → plan → build → review → validate) for a GitHub issue using Python orchestration.

**Usage**:
```
/do #123 workflow
/do/adw 456
```

**Execution Flow**:
1. Extract issue number from input (supports `#123`, `123`, or GitHub URL)
2. Invoke Python orchestrator: `uv run automation/adws/adw_sdlc.py {issue_number} --stream-tokens`
3. Parse real-time TokenEvent JSON lines from stdout
4. Monitor progress via `automation/agents/{adw_id}/adw_state.json`
5. Report completion with token usage and artifacts

**Output**:
```markdown
## ADW Workflow Complete

**Issue**: #518
**ADW ID**: adw_20251213_142600_518
**Phases**: scout ✓ → plan ✓ → build ✓ → review ✓

### Token Usage
- Total Input: 125,430
- Total Output: 18,920
- Total Cost: $0.6592

### Artifacts
- Spec: docs/specs/feature-518-do-adw-integration.md
- Branch: feat/518-do-adw-integration
- Worktree: /tmp/worktrees/feat-518-do-adw-integration
```

#### `/do/status` - Query ADW Workflow State

Query current state of an ADW workflow execution.

**Usage**:
```
/do/status adw_20251213_142600_518
```

**Output**:
```markdown
## ADW Status: adw_20251213_142600_518

**Issue**: #518 - feat(adw): integrate /do paradigm with Python ADW orchestration layer
**Branch**: feat/518-do-adw-integration
**Worktree**: /tmp/worktrees/feat-518-do-adw-integration
**PR Created**: No

### Phase Status
- Scout: completed
- Plan: completed
- Build: in_progress
- Review: pending

### Files
- Spec: docs/specs/feature-518-do-adw-integration.md
```

### TokenEvent Schema

Real-time token usage events emitted during workflow execution:

```typescript
interface TokenEvent {
  adw_id: string;              // ADW execution ID
  phase: string;               // Phase name (plan, build, review)
  agent: string;               // Agent name (classify_issue, generate_branch, etc.)
  input_tokens: number;        // Prompt tokens consumed
  output_tokens: number;       // Completion tokens generated
  cache_read_tokens: number;   // Cached tokens read (prompt caching)
  cache_creation_tokens: number; // Tokens written to cache
  cost_usd: number;            // Calculated cost in USD
  timestamp: string;           // ISO 8601 timestamp
}
```

**Pricing (as of 2025-12-13)**:
- Input tokens: $3.00 per million tokens
- Output tokens: $15.00 per million tokens
- Cache write: $3.75 per million tokens
- Cache read: $0.30 per million tokens

### State Files

ADW state is stored in `automation/agents/{adw_id}/adw_state.json`:

```json
{
  "adw_id": "adw_20251213_142600_518",
  "issue_number": "518",
  "branch_name": "feat/518-do-adw-integration",
  "plan_file": "docs/specs/feature-518-do-adw-integration.md",
  "issue_class": "feature",
  "worktree_name": "feat-518-do-adw-integration",
  "worktree_path": "/tmp/worktrees/feat-518-do-adw-integration",
  "worktree_created_at": "2025-12-13T14:26:00Z",
  "pr_created": false,
  "extra": {
    "metrics": {
      "total_input_tokens": 125430,
      "total_output_tokens": 18920,
      "total_cost_usd": 0.6592
    }
  }
}
```

---

## Expert Domain Error Handling

### Classification Errors

**Classification unclear:**
- Use AskUserQuestion to disambiguate
- Provide options: "Expert domain workflow" vs "ADW workflow"

**Empty requirement:**
- Ask user what they want to do
- Provide examples of common requests

### Pattern A Errors (Expert Implementation)

**Plan phase fails:**
- Report error with context
- Suggest retrying with more detailed requirement
- Exit gracefully (no spec to build from)

**User declines at approval gate:**
- NOT an error - valid workflow outcome
- Report spec location
- Suggest resume command
- Exit gracefully with status: "Plan Complete - User Review Requested"

**Build phase fails:**
- Preserve the spec (it's valid, build just failed)
- Report what went wrong
- Provide resume command: `/do "build from {spec_path}"`
- Skip improve stage

**Improve phase fails:**
- Log the error
- Set improve_status: "Skipped - Error"
- Continue (workflow is still successful)

### Pattern B Errors (Expert Question)

**Agent fails:**
- Report error with context
- Suggest manual approach if applicable

**Agent returns empty result:**
- Report diagnostic info
- Suggest retry or alternative approach

---

## Expert Domain Examples

### Claude Config - Implementation (Pattern A)

```bash
/do "Create slash command for code review"

# /do executes:
# 1. Classification: claude-config expert, implementation request
# 2. Pattern: A (Plan→Build→Improve)
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
# 1. agent-authoring-plan-agent → creates spec
# 2. User approval gate
# 3. agent-authoring-build-agent → creates agent file
# 4. agent-authoring-improve-agent → updates expertise
```

### Agent Authoring - Question (Pattern B)

```bash
/do "What model should I use for a coordinator?"

# /do executes Pattern B with agent-authoring-question-agent
```

### ADW Workflow (Fallback)

```bash
/do #123

# No expert domain keywords detected
# Route to ADW workflow:
# scout → plan → build → review → validate
```

### Ambiguous Request

```bash
/do "Add feature"

# Ambiguous - could be expert domain or ADW
# Use AskUserQuestion:
#   "What type of feature? (1) Claude config/agent (2) GitHub issue/code feature"
# Route based on response
```

---

## Observability

ADW logs are accessible via symlink for easy discovery:

**Paths**:
- Symlink: `.claude/data/adw_logs/`
- Actual: `automation/logs/kota-db-ts/`

**Structure**:
```
.claude/data/adw_logs/
  {env}/                          # Environment (local, ci, prod)
    {adw_id}/                     # ADW execution ID
      {agent_name}/               # Agent name (classify_issue, generate_branch, etc.)
        raw_output.jsonl          # Streaming JSONL output
        raw_output.json           # Parsed final output
        prompts/                  # Generated prompts
          {command_name}.txt      # Prompt text for command
```

**Example**:
```
.claude/data/adw_logs/
  local/
    adw_20251213_142600_518/
      classify_issue/
        raw_output.jsonl
        raw_output.json
        prompts/
          classify_issue.txt
      generate_branch/
        raw_output.jsonl
        raw_output.json
        prompts/
          generate_branch.txt
```

**Log Format** (JSONL):
```json
{"type": "message", "content": "Starting phase: scout"}
{"type": "token_event", "data": {"input_tokens": 1250, "output_tokens": 320, "cost_usd": 0.0087}}
{"type": "result", "status": "success", "output": "..."}
```

**Reading Logs**:
```bash
# View latest execution
ls -t .claude/data/adw_logs/local/ | head -1

# View agent output
cat .claude/data/adw_logs/local/{adw_id}/{agent_name}/raw_output.json | jq

# Stream real-time output
tail -f .claude/data/adw_logs/local/{adw_id}/{agent_name}/raw_output.jsonl
```

**TypeScript State Reader**:
```typescript
import { readADWState, listADWWorkflows } from '@claude/utils/adw-state-reader';

// Read specific workflow
const state = readADWState('adw_20251213_142600_518');
if (state) {
  console.log(`Branch: ${state.branch_name}`);
  console.log(`Spec: ${state.plan_file}`);
}

// List all workflows
const workflows = listADWWorkflows();
workflows.forEach(id => {
  const state = readADWState(id);
  // ... process state
});
```
