---
description: Generic multi-phase workflow orchestrator - coordinates scout, plan, build, review, validate phases
argument-hint: <task-description> [phases=scout,plan,build] [--plan-only|--build-only <spec>|--no-review]
---

# Orchestrator - Multi-Phase Workflow Coordinator

**Template Category**: Structured Data
**Prompt Level**: 6 (Self-Modifying)

Coordinate development workflows by spawning specialized agents for each phase and synthesizing outputs into cohesive deliverables.

**Project Context**: KotaDB - Bun + TypeScript + Supabase. Use `bun` commands (not `pnpm`/`npm`).

## Variables

USER_PROMPT: $ARGUMENTS

## Arguments

| Argument | Description |
|----------|-------------|
| `$1` | Task description (required) |
| `phases=<list>` | Comma-separated phases (default: scout,plan,build) |
| `--plan-only` | Equivalent to `phases=scout,plan` |
| `--build-only <spec>` | Skip scout/plan, build from existing spec file |
| `--no-review` | Exclude review and validate phases |

**Precedence**: Explicit `phases=` overrides convenience flags.

## Phase Definitions

| Phase | Agent | Purpose | Output |
|-------|-------|---------|--------|
| **scout** | `scout-agent` (haiku) | Read-only exploration | In-memory report |
| **plan** | `planning-council` | Multi-expert planning | `docs/specs/<name>.md` |
| **build** | `build-agent` (1-N) | File implementation | Code changes |
| **review** | `review-panel` | Multi-expert review | `docs/reviews/<name>-review.md` |
| **validate** | Bash | Tests, lint, types | Console output |

## Execution Flow

### 1. Parse Input

```
"Add auth" → task: "Add auth", phases: [scout, plan, build]
"Fix #456 phases=scout,plan" → task: "Fix #456", phases: [scout, plan]
"Build --plan-only" → phases: [scout, plan]
"Build --build-only docs/specs/x.md" → phases: [build], spec_file: docs/specs/x.md
```

### 2. Execute Phases

#### Scout Phase
```
Task tool: subagent_type="scout-agent", model="haiku"
prompt: "Explore codebase for: {task}"
```

#### Plan Phase
```
Task tool: subagent_type="planning-council"
prompt: "{task}\n\nContext:\n{scout_output}"
```

**Spec File Path**: `docs/specs/{type}-{N}-{slug}.md` or `docs/specs/task-{date}-{slug}.md`

Write spec file using template from `docs/implementation-guides/orchestrator-implementation.md`.

#### User Review Checkpoint

**Triggers when**: Build phase is next AND not using `--build-only`.

```
AskUserQuestion:
  question: "Spec created at {spec_file_path}. Continue to build phase?"
  options:
    - "Yes, continue to build" (Recommended)
    - "No, stop here for review"
    - "Let me edit the spec first"
```

If user stops: Report spec location and exit gracefully.

#### Build Phase

**Prerequisite**: Spec file must exist at `spec_file_path`.

1. Read spec file for tasks and file list
2. Determine strategy: parallel (independent) or sequential (dependent)
3. Delegate to `build-agent` instances (see `.claude/commands/agents/build-agent.md`)
4. Aggregate results
5. Git commit and push

See `docs/implementation-guides/orchestrator-implementation.md` for build prompt template.

#### Review Phase
```
Task tool: subagent_type="review-panel"
prompt: "Review for: {task}\nSpec: {spec_file_path}"
```

Write review file at `docs/reviews/{spec-name}-review.md`.

#### Validate Phase

```bash
cd app && bun run lint && bunx tsc --noEmit && bun test
```

### 3. Phase Transitions

| Transition | Rule |
|------------|------|
| scout → plan | Pass exploration findings as context |
| plan → build | User checkpoint; spec file must exist |
| build → review | Only proceed if build succeeded |
| review → validate | Always validate after review |
| Any failure | Stop, report, suggest remediation |

### 4. Progress Reporting

After each phase:
```markdown
## Phase: {name} - {status}

**Output:** {files created or summary}
**Next Phase:** {next or "Complete"}
```

## Error Handling

```markdown
## Workflow Halted

**Failed Phase:** {name}
**Error:** {description}

**Remediation:**
1. {fix suggestion}

**Resume Command:**
/experts:orchestrators:orchestrator "{task}" phases={remaining}
```

See `docs/implementation-guides/orchestrator-implementation.md` for detailed error patterns.

## Output Summary

```markdown
# Orchestrated Workflow: {task}

## Phases Executed
- [x] Scout - Completed
- [x] Plan - Completed (spec: docs/specs/{name}.md)
- [ ] Build - {status}

## Artifacts
- **Spec:** docs/specs/{name}.md
- **Review:** docs/reviews/{name}-review.md (if review phase ran)

## Next Steps
{recommendations}
```

## Usage Examples

```bash
# Default (scout, plan, build)
/experts:orchestrators:orchestrator "Add user profiles"

# Planning only
/experts:orchestrators:orchestrator "Design caching" --plan-only

# Build from existing spec
/experts:orchestrators:orchestrator "Execute auth spec" --build-only docs/specs/feature-123-auth.md

# Full workflow with review
/experts:orchestrators:orchestrator "Fix #456" phases=scout,plan,build,review,validate
```

## References

- **Build Agent**: `.claude/commands/agents/build-agent.md`
- **Implementation Details**: `docs/implementation-guides/orchestrator-implementation.md`
- **Planning Council**: `.claude/commands/experts/orchestrators/planning_council.md`
- **Review Panel**: `.claude/commands/experts/orchestrators/review_panel.md`
