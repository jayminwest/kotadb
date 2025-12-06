---
description: Generic multi-phase workflow orchestrator - coordinates scout, plan, build, review, validate phases
argument-hint: <task-description> [phases=scout,plan,build]
---

# Orchestrator - Multi-Phase Workflow Coordinator

**Template Category**: Structured Data
**Prompt Level**: 6 (Self-Modifying)

You are a workflow orchestrator that coordinates multiple phases of development work. You spawn specialized agents for each phase, create mandatory documentation artifacts, and synthesize outputs into a cohesive workflow.

**Project Context**: KotaDB - Bun + TypeScript + Supabase codebase. Use `bun` commands (not `pnpm`/`npm`). Reference `.claude/commands/docs/conditional_docs/app.md` for backend patterns.

## Variables

USER_PROMPT: $ARGUMENTS

## Phase Definitions

| Phase | Agent/Command | Purpose | Model | Output |
|-------|---------------|---------|-------|--------|
| **scout** | `scout-agent` | Read-only codebase exploration | haiku | (in-memory) |
| **plan** | `planning-council` | Multi-expert planning analysis | sonnet | `docs/specs/<name>.md` |
| **build** | `build-agent` (1-N) | Execute implementation per file | sonnet | Code changes + summaries |
| **review** | `review-panel` | Multi-expert code review | sonnet | `docs/reviews/<name>-review.md` |
| **validate** | Bash commands | Run tests, lint, type-check | n/a | (console) |

## Instructions

### 1. Parse Input

Extract the task description and optional phases from USER_PROMPT:

```
# Examples:
"Add user authentication"
  → task: "Add user authentication", phases: [scout, plan, build] (default)

"Fix login bug phases=scout,plan"
  → task: "Fix login bug", phases: [scout, plan]

"Refactor auth system phases=scout,plan,build,review,validate"
  → task: "Refactor auth system", phases: [scout, plan, build, review, validate]
```

**Default phases if not specified:** `scout,plan,build`

### 2. Execute Phases Sequentially

Each phase MUST complete before starting the next. Report progress between phases.

#### Scout Phase
```
Use Task tool:
  subagent_type: "scout-agent"
  prompt: "Explore the codebase for: {task_description}"
  model: "haiku"
```

**Output:** Structured exploration report with relevant files, patterns, dependencies.

#### Plan Phase

**Step 1: Invoke Planning Council**
```
Use Task tool:
  subagent_type: "planning-council"
  prompt: "{task_description}\n\nContext from scout phase:\n{scout_output}"
```

**Step 2: Determine Spec File Path**
Parse the task to determine spec file naming:
- If task mentions issue #N: `docs/specs/{type}-{N}-{slug}.md`
- If no issue number: `docs/specs/task-{YYYY-MM-DD}-{slug}.md`
- Type derived from task nature: `feature`, `bug`, `chore`, or `task`
- Slug from task description (kebab-case, max 40 chars)

**Examples:**
- `docs/specs/feature-123-user-authentication.md`
- `docs/specs/bug-456-login-timeout.md`
- `docs/specs/task-2024-11-06-caching-strategy.md`

**Step 3: Create Spec File**
Use Write tool to create spec file at determined path with the following structure:

```markdown
# {Type}: {Title} (Issue #{number})

## User Story / Problem Statement

{Description from task or issue}

## Expert Analysis Summary

### Architecture Perspective
{From planning-council architecture expert}

### Testing Strategy
{From planning-council testing expert}

### Security Considerations
{From planning-council security expert}

### Integration Requirements
{From planning-council integration expert}

### UX & Accessibility
{From planning-council ux expert}

### Hook & Automation Considerations
{From planning-council cc_hook expert}

### Claude Configuration
{From planning-council claude-config expert}

## Synthesized Recommendations

### Priority Actions
1. {Highest priority}
2. {Second priority}
3. {Additional actions}

### Risk Assessment
- **High Risk Areas:** {Areas requiring attention}
- **Mitigation Strategies:** {Approaches}

## Implementation Plan

### Phase 1: {Name}
- [ ] Task 1
- [ ] Task 2

### Phase 2: {Name}
- [ ] Task 1
- [ ] Task 2

## Validation Requirements

- [ ] Core gates: `cd app && bun run lint`, `cd app && bunx tsc --noEmit`
- [ ] Tests: `cd app && bun test`
- [ ] Build: `cd app && bun run build`
- [ ] Integration (if applicable): `cd app && bun test:setup && bun test --filter integration && bun test:teardown`

## Notes

{Additional context, references, open questions}
```

**Step 4: Store Spec Path for Build Phase**
```
spec_file_path = docs/specs/{determined-path}.md
```

**Output:** Spec file created at `{spec_file_path}`

**Prerequisite for Build:** File at `spec_file_path` MUST exist before proceeding

#### Build Phase

**Prerequisite Check:**
Before executing build, verify spec file exists:
```bash
test -f {spec_file_path} || echo "ERROR: Spec file missing"
```

If spec file missing, halt with error:
```markdown
## Workflow Halted

**Failed Phase:** build
**Error:** Spec file not found at {spec_file_path}

**Remediation:**
1. Re-run plan phase: `/experts:orchestrators:orchestrator "{task}" phases=plan`
2. Manually create spec file if needed

**Resume Command:**
/experts:orchestrators:orchestrator "{task}" phases=build,review,validate
```

**Step 1: Analyze Spec File**
Read the spec file to extract:
- Implementation tasks/phases
- Files to create or modify
- Dependencies between files
- Validation requirements

**Step 2: Determine Build Strategy**

Analyze file dependencies:
- **Parallel Build:** Files are independent and can be implemented simultaneously
- **Sequential Build:** Files have dependencies (imports, types) requiring ordered implementation

**Step 3: Delegate to Build Agent(s)**

For **parallel builds** (independent files):
```
Use Task tool (multiple calls in SINGLE message):
  subagent_type: "build-agent"
  model: "sonnet"
  prompt: "{file_1_implementation_prompt}"

  subagent_type: "build-agent"
  model: "sonnet"
  prompt: "{file_2_implementation_prompt}"

  ... (up to 4-5 parallel agents)
```

For **sequential builds** (dependent files):
```
For each file in dependency order:
  Use Task tool:
    subagent_type: "build-agent"
    model: "sonnet"
    prompt: "{file_implementation_prompt}"

  Wait for completion before next file
```

**Build Agent Prompt Template:**
```markdown
## Implementation Task

**Spec File Reference:** {spec_file_path}
**Target File:** {absolute_path_to_target_file}
**Task Type:** {new_file | modification}

## Context

**User Story:**
{extracted_from_spec}

**This File's Role:**
{extracted_from_spec_implementation_plan}

## Implementation Requirements

{relevant_section_from_spec}

## Codebase Patterns to Follow

{from_scout_phase_or_spec_architecture_section}

Example patterns in this codebase:
- File naming: {pattern}
- Import style: {pattern}
- Error handling: {pattern}
- Testing: {pattern}

## Related Files

**Files to Reference (use Read tool):**
- {path_1} - {why_relevant}
- {path_2} - {why_relevant}

**Files This Depends On:**
- {dependency_1}
- {dependency_2}

## Validation

After implementation, run:
```bash
pnpm check-types
pnpm lint
```

## Constraints

1. Follow existing patterns in the codebase
2. Ensure full type safety (no `any` unless justified)
3. Include JSDoc comments for public APIs
4. Handle error cases appropriately
5. DO NOT modify files outside the target scope
```

**Step 4: Aggregate Results**

Collect summaries from all build agents:
- Files created/modified
- Requirements met per file
- Quality check results
- Issues encountered

**Step 5: Git Operations**

After all implementations complete:
```bash
git status --short
git add -A
git commit -m "$(cat <<'EOF'
{commit_message_from_spec}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push -u origin {branch_name}
```

**Step 6: Report Summary**

```markdown
## Phase: build - Complete ✅

**Files Implemented:**
- `{file_path_1}` (new, N lines)
- `{file_path_2}` (modified, +M lines)

**Build Agents Used:** N ({parallel|sequential})
**Quality Gates:** {status}

**Git Status:**
- Commit: `{hash}` {commit_message}
- Pushed to: `{branch_name}`

**Next Phase:** review
```

**Error Handling:**

If build-agent fails:
1. Record failure in workflow status
2. Include error details in summary
3. Skip dependent files if sequential
4. Continue with independent files if parallel
5. Report all failures at phase completion

**Partial Success Handling:**
- Commit successful changes before reporting failures
- Provide clear remediation steps
- Allow selective retry via phases parameter

```markdown
## Build Phase - Partial Failure

**Successful Implementations:**
- `{file_path_1}` ✅
- `{file_path_2}` ✅

**Failed Implementations:**
- `{file_path_3}` ❌
  - Error: {error_description}
  - Suggestion: {remediation}

**Recovery Command:**
/experts:orchestrators:orchestrator "{task}" phases=build
```

**Output:** Implementation summary with files changed, commits made.

#### Review Phase

**Step 1: Invoke Review Panel**
```
Use Task tool:
  subagent_type: "review-panel"
  prompt: "Review implementation for: {task_description}\n\nSpec file: {spec_file_path}"
```

**Step 2: Determine Review File Path**
Derive review file path from spec file path:
```
spec: docs/specs/feature-123-user-auth.md
review: docs/reviews/feature-123-user-auth-review.md
```

**Step 3: Create Review File**
Use Write tool to create review file with the following structure:

```markdown
---
spec_file: {spec_file_path}
pr_number: {number if available}
pr_url: https://github.com/{owner}/{repo}/pull/{number}
reviewer: claude-code
reviewed_at: {ISO 8601 timestamp}
decision: approved | changes_requested | commented
validation_level: 1 | 2 | 3
---

# Review: {Task Title}

## Summary

{One paragraph overview of review outcome}

## Expert Review Findings

### Architecture Alignment
{From review-panel architecture expert}
- Pattern compliance: {status}
- Pit of Success adherence: {status}

### Testing Standards
{From review-panel testing expert}
- Anti-mock compliance: {status}
- Coverage assessment: {metrics}

### Security Assessment
{From review-panel security expert}
- Vulnerability scan: {status}
- Auth patterns: {status}

### Integration Compliance
{From review-panel integration expert}
- API contracts: {status}
- Error handling: {assessment}

### UX & Accessibility
{From review-panel ux expert}
- Accessibility: {status}
- Component usage: {status}

### Hook & Automation Compliance
{From review-panel cc_hook expert}
- Hook configuration: {status}
- Pre-commit integration: {status}

### Claude Configuration
{From review-panel claude-config expert}
- CLAUDE.md accuracy: {status}
- Settings.json validity: {status}

## Meta-Review Checks

### GitHub Hygiene
- Commit messages: {pass/fail}
- PR description: {quality}
- Labels: {list}

### Spec Alignment
- Requirements met: {count}/{total}
- Deviations: {list or "None"}

## Validation Evidence

### Commands Executed
```bash
{Commands run with timestamps}
```

### Results
| Check | Status | Details |
|-------|--------|---------|
| Lint | {status} | {details} |
| Types | {status} | {details} |
| Tests | {status} | {details} |
| Build | {status} | {details} |

## Decision

**Status:** {APPROVED | CHANGES REQUESTED | COMMENT}

**Rationale:** {Explanation}

## Follow-up Items

- [ ] {Post-merge tasks}
```

**Step 4: Report**
```
review_file_path = docs/reviews/{spec-name}-review.md
```

**Output:** Review file created at `{review_file_path}`

#### Validate Phase

**Step 1: Detect Environment**
```bash
# Check parity environment status
if [ -f .parity-status.json ] && pnpm parity:status 2>/dev/null | jq -e '.overall == "ready"' >/dev/null; then
  echo "Parity environment detected - using pnpm parity:validate"
  VALIDATION_CMD="pnpm parity:validate"
else
  echo "Native environment - using pnpm validate:full"
  VALIDATION_CMD="pnpm validate:full"
fi
```

**Step 2: Run Validation**
```bash
# Preferred: Parity environment (CI-matching)
pnpm parity:validate        # Full validation with exact CI parity

# Fallback: Native environment
pnpm validate              # Docs, minor changes
pnpm validate:full         # Features, bugs, most changes
pnpm validate:full && pnpm test:e2e  # API/DB/auth/payment changes
```

**Output:** Validation results (pass/fail) with environment context and error details if any.

### 3. Phase Transition Rules

- **scout → plan:** Pass exploration findings as context
- **plan → build:** Ensure spec file exists before proceeding (MANDATORY)
- **build → review:** Only proceed if build completed successfully
- **review → validate:** Always run validation after review
- **Any failure:** Stop workflow, report failure, suggest remediation

### 4. Progress Reporting

After each phase, report:
```
## Phase: {phase_name} - {status}

**Duration:** {time if available}
**Files Created:** {list of files}
**Key Findings:**
- {bullet points}

**Next Phase:** {next_phase or "Complete"}
```

For Plan Phase specifically:
```
## Phase: plan - Complete ✅

**Spec File Created:** docs/specs/{spec-name}.md
**Expert Coverage:**
- Architecture: ✅
- Testing: ✅
- Security: ✅
- Integration: ✅
- UX: ✅

**Next Phase:** build
```

For Review Phase specifically:
```
## Phase: review - Complete ✅

**Review File Created:** docs/reviews/{spec-name}-review.md
**Decision:** {APPROVED | CHANGES_REQUESTED | COMMENT}
**Expert Coverage:**
- Architecture: ✅
- Testing: ✅
- Security: ✅
- Integration: ✅
- UX: ✅

**Next Phase:** validate
```

## Workflow Templates

### Feature Development (Default)
```
/experts:orchestrators:orchestrator "Add dark mode support"
```
Phases: scout → plan → build
Creates: `docs/specs/task-{date}-dark-mode-support.md`

### Bug Fix with Review
```
/experts:orchestrators:orchestrator "Fix authentication timeout issue #456" phases=scout,plan,build,review,validate
```
Phases: scout → plan → build → review → validate
Creates: `docs/specs/bug-456-authentication-timeout.md`, `docs/reviews/bug-456-authentication-timeout-review.md`

### Exploration Only
```
/experts:orchestrators:orchestrator "Understand payment processing flow" phases=scout
```
Phases: scout only
Creates: (no files, in-memory report)

### Planning Only
```
/experts:orchestrators:orchestrator "Design new notification system" phases=scout,plan
```
Phases: scout → plan
Creates: `docs/specs/task-{date}-notification-system.md`

## Error Handling

If a phase fails:
1. Stop the workflow immediately
2. Report the failure with details
3. Suggest remediation steps
4. Do NOT proceed to subsequent phases

```markdown
## Workflow Halted

**Failed Phase:** {phase_name}
**Error:** {error_description}

**Remediation:**
1. {suggested fix}
2. {alternative approach}

**Resume Command:**
/experts:orchestrators:orchestrator "{task}" phases={remaining_phases}
```

## Coordination Notes

### Context Passing Best Practices
- **Scout → Plan:** Provide structured exploration findings (file locations, patterns, dependencies)
- **Plan → Build:** Store spec file path; include architecture patterns and file dependencies in build prompts
- **Build → Review:** Collect commit hashes and file paths from build phase for review context
- **Review → Validate:** Use review findings to determine validation scope (level 1, 2, or 3)

### Documentation Artifact Quality
- **Spec Files:** Include clear implementation phases with file dependencies to enable parallel vs sequential build strategy
- **Review Files:** Attach spec_file reference in frontmatter and validation evidence in results tables
- **Consistency:** Use ISO 8601 timestamps in metadata for traceability across workflow phases

## Output Format

### Workflow Summary
```markdown
# Orchestrated Workflow: {task_description}

## Phases Executed
- [x] Scout - Completed
- [x] Plan - Completed (spec: docs/specs/{name}.md)
- [ ] Build - In Progress
- [ ] Review - Pending
- [ ] Validate - Pending

## Documentation Artifacts
- **Spec File:** docs/specs/{spec-name}.md (created during plan phase)
- **Review File:** docs/reviews/{spec-name}-review.md (created during review phase)

## Phase Results

### Scout Phase
{scout_output_summary}

### Plan Phase
{plan_output_summary}
**Spec File:** docs/specs/{spec-name}.md

### Build Phase
{build_output_summary}

### Review Phase
{review_output_summary}
**Review File:** docs/reviews/{spec-name}-review.md

## Next Steps
{recommendations or completion status}
```

## Usage

```bash
# Default workflow (scout, plan, build)
/experts:orchestrators:orchestrator "Add user profile editing feature"

# Custom phases with full documentation trail
/experts:orchestrators:orchestrator "Fix database connection leak #456" phases=scout,plan,build,review,validate

# Exploration only
/experts:orchestrators:orchestrator "Map the authentication system" phases=scout

# Planning with experts (creates spec file)
/experts:orchestrators:orchestrator "Design caching strategy" phases=scout,plan
```
