---
description: Universal entry point for KotaDB workflows - routes requirements to appropriate workflow based on intent
argument-hint: <requirement>
allowed-tools: Read, Glob, Grep, Task, SlashCommand, AskUserQuestion, TodoWrite
---

# `/do` - Universal Workflow Entry Point

Single command interface for all KotaDB workflows. Analyzes requirements and delegates to appropriate coordinator agents.

## CRITICAL: Delegation-First Approach

**IMPORTANT: This command exists to route work—not to do work directly. Your role is classification and delegation, nothing else.**

**You MUST delegate ALL actual work to subagents via the Task tool or SlashCommand tool.** Even small tasks should be delegated. The `/do` command is purely an orchestrator that:

1. Classifies the user's intent
2. Spawns the appropriate coordinator/workflow
3. Reports results

**Never perform implementation work directly.** File modifications are blocked by the orchestrator_guard.py hook anyway.

## Usage

```bash
/do <requirement>
```

## Examples

```bash
/do #123                           # GitHub issue → orchestrator
/do plan user authentication       # Planning intent → /workflows/plan
/do implement login endpoint       # Implementation → /workflows/orchestrator
/do review PR #456                 # Review → /experts/orchestrators/review_panel
/do document API endpoints         # Documentation → /workflows/document
/do deploy to staging              # CI/CD → /ci/* or clarification
/do security review of auth flow   # Expert analysis → security expert
```

## Variables

USER_REQUIREMENT: $ARGUMENTS

## Workflow Execution

### Step 1: Parse Requirement

Extract requirement from `$ARGUMENTS`:
- Check if requirement is empty → Error: "Usage: /do <requirement>"
- Remove any flags (future: `--background`, `--plan-only`, etc.)
- Capture the core requirement description

### Step 2: Classify Intent

Classify the requirement into one of 7 categories:

| Category | Patterns | Priority |
|----------|----------|----------|
| **github_issue** | `#\d+`, `issue`, `bug report`, `feature request` | 1 (highest) |
| **spec_planning** | `plan`, `spec`, `design`, `architect` | 2 |
| **implementation** | `implement`, `build`, `fix`, `add`, `create` | 3 |
| **review** | `review`, `check`, `audit`, `PR #` | 4 |
| **documentation** | `document`, `docs`, `readme`, `write doc` | 5 |
| **ci_cd** | `ci`, `pipeline`, `deploy`, `release`, `publish` | 6 |
| **expert_analysis** | `expert`, `architecture analysis`, `security review` | 7 |

**Classification Algorithm:**

1. **Extract keywords** from user requirement
2. **Score each category** based on pattern matches:
   - Base score: 0.5 for any pattern match
   - Boost +0.3 for issue/PR numbers (#\d+)
   - Boost +0.2 for action verbs (implement, build, fix)
   - Boost +0.15 for domain keywords (security, architecture)
3. **Select highest confidence**:
   - If confidence > 0.7: Route directly
   - If confidence 0.5-0.7: Show classification, ask for confirmation
   - If confidence < 0.5: Use AskUserQuestion with all options

### Step 3: Route to Coordinator via Task Tool

**CRITICAL: Always use the Task tool to spawn the appropriate coordinator agent.**

**For GitHub Issues (contains #<number>):**
```
Use Task tool:
  subagent_type: "general-purpose"
  prompt: |
    Execute the workflow command: /workflows/orchestrator {issue_number}

    This is a GitHub issue workflow. Follow the orchestrator workflow
    to analyze the issue, create a plan, and implement the solution.
```

**For Planning (plan, spec, design, architect):**
```
Use Task tool:
  subagent_type: "Plan"
  prompt: |
    REQUIREMENT: {requirement}

    Execute the planning workflow for this requirement.
    Create an implementation spec following KotaDB conventions.
```

**For Implementation (implement, build, fix, add, create):**
```
Use Task tool:
  subagent_type: "build-agent"
  prompt: |
    REQUIREMENT: {requirement}

    Execute the implementation workflow for this requirement.
    Follow KotaDB conventions for path aliases, testing, and logging.
```

**For Review (review, check, audit, PR #):**
```
Use Task tool:
  subagent_type: "review-agent"
  prompt: |
    REQUIREMENT: {requirement}
    PR_NUMBER: {extracted_pr_number if present}

    Execute the review workflow for this requirement.
    Provide comprehensive code review following KotaDB standards.
```

**For Documentation (document, docs, readme):**
```
Use Task tool:
  subagent_type: "general-purpose"
  prompt: |
    REQUIREMENT: {requirement}

    Execute the documentation workflow: /workflows/document
    Update documentation following KotaDB conventions.
```

**For CI/CD (ci, pipeline, deploy, release):**
```
Use Task tool:
  subagent_type: "general-purpose"
  prompt: |
    REQUIREMENT: {requirement}

    Execute the appropriate CI/CD workflow.
    For releases: /release/release
    For CI issues: /ci/ci-investigate
```

**For Expert Analysis (expert, security, architecture):**
```
Use Task tool:
  subagent_type: "general-purpose"
  prompt: |
    REQUIREMENT: {requirement}

    Execute expert analysis using the planning council:
    /experts/orchestrators/planning_council {requirement}
```

**If Ambiguous (confidence < 0.5):**
```
Use AskUserQuestion tool:
  question: "What type of workflow does this requirement need?"
  options:
    - label: "GitHub Issue"
      description: "Work on issue #xxx or create new issue"
    - label: "Planning"
      description: "Create implementation spec"
    - label: "Implementation"
      description: "Build/fix/create code"
    - label: "Review"
      description: "Review PR or code changes"
    - label: "Documentation"
      description: "Update docs or README"
    - label: "CI/CD"
      description: "Deploy or manage pipelines"
    - label: "Expert Analysis"
      description: "Security/architecture review"
```

Then spawn appropriate agent based on user selection.

### Step 4: Wait for Coordinator

The coordinator agent handles the complete workflow:
- For issues: analyze → plan → build → validate
- For planning: scout → design → spec creation
- For implementation: build → test → validate
- For review: analyze → report
- For docs: update → validate
- For experts: multi-expert analysis

### Step 5: Report Results

Synthesize the coordinator's output:

```markdown
## `/do` - Complete

**Requirement:** {requirement}
**Workflow:** {coordinator-type}
**Confidence:** {classification_confidence}

### Results

{coordinator-output}

### Files Modified

{list-of-files-from-coordinator}

### Next Steps

{suggestions-from-coordinator}
```

## Decision Tree

```
Is requirement empty?
├─ Yes → Error: "Usage: /do <requirement>"
└─ No → Continue

Does requirement contain #<number>?
├─ Yes → github_issue (confidence: 0.9)
│        Spawn: Task tool with /workflows/orchestrator <number>
└─ No → Continue

Does requirement contain "plan", "spec", "design", "architect"?
├─ Yes → spec_planning (confidence: 0.8)
│        Spawn: Task tool with Plan agent
└─ No → Continue

Does requirement contain "implement", "build", "fix", "add", "create"?
├─ Yes → implementation (confidence: 0.8)
│        Spawn: Task tool with build-agent
└─ No → Continue

Does requirement contain "review", "check", "audit", "PR #"?
├─ Yes → review (confidence: 0.8)
│        Extract PR number if present
│        Spawn: Task tool with review-agent
└─ No → Continue

Does requirement contain "document", "docs", "readme"?
├─ Yes → documentation (confidence: 0.75)
│        Spawn: Task tool with /workflows/document
└─ No → Continue

Does requirement contain "ci", "pipeline", "deploy", "release"?
├─ Yes → ci_cd (confidence: 0.7)
│        Spawn: Task tool with appropriate CI workflow
└─ No → Continue

Does requirement contain "expert", "security", "architecture"?
├─ Yes → expert_analysis (confidence: 0.7)
│        Spawn: Task tool with planning_council
└─ No → Ambiguous

Ambiguous case:
└─ Use AskUserQuestion, then spawn based on selection
```

## Routing Table

| Intent | Subagent Type | Route Target |
|--------|---------------|--------------|
| github_issue | general-purpose | `/workflows/orchestrator <issue-num>` |
| spec_planning | Plan | `/workflows/plan <requirement>` |
| implementation | build-agent | `/workflows/implement` or direct build |
| review | review-agent | `/experts/orchestrators/review_panel <pr-num>` |
| documentation | general-purpose | `/workflows/document <target>` |
| ci_cd | general-purpose | `/ci/*` or `/release/release` |
| expert_analysis | general-purpose | `/experts/orchestrators/planning_council` |

## Validation (for implementation intents)

For implementation and high-risk changes, the spawned agent should assess risk:

```
Use MCP tool: analyze_change_impact
- Check for breaking changes
- Identify affected files
- Recommend validation level
```

**Validation Levels**:
- **L1** (Lint only): Docs, config, comments
- **L2** (Integration): Features, bugs, endpoints (DEFAULT)
- **L3** (Full suite): Schema, auth, migrations, high-risk

## State Management

Create ADW state entry for resumability:

```json
{
  "adw_id": "do-{timestamp}-{random}",
  "user_requirement": "...",
  "classified_intent": "...",
  "confidence_score": 0.92,
  "route_target": "...",
  "spawned_agent": "...",
  "validation_level": "L2",
  "checkpoints": [
    {
      "phase": "classification",
      "status": "completed",
      "timestamp": "..."
    }
  ]
}
```

State files are stored in `.claude/data/do_state/`

## Error Handling

If routing fails:
1. Preserve checkpoint state
2. Log error to `.claude/data/do_state/{adw_id}.json`
3. Provide recovery instructions

```
/do Error:
  Phase: {failed_phase}
  Error: {description}

Recovery:
  1. {fix suggestion}
  2. Resume with: /do {original_requirement}
```

## Orchestrator Context Enforcement

This command sets orchestrator context which:
- **Blocks** Write/Edit/MultiEdit/NotebookEdit tools (enforced by orchestrator_guard.py)
- **Requires** delegation to subagents via Task tool
- **Allows** Read, Grep, Glob, Bash for analysis only

**Why?** Orchestrators plan and coordinate. Build agents execute. This separation ensures:
- Clear accountability for changes
- Proper validation at each phase
- Resumable workflows via checkpoints

See CLAUDE.md "Orchestrator Pattern Enforcement" for details.

## References

- `/workflows/orchestrator` - Full orchestration workflow
- `/workflows/plan` - Planning workflow
- `/workflows/implement` - Implementation workflow
- `/experts/orchestrators/review_panel` - Multi-expert review
- `/experts/orchestrators/planning_council` - Multi-expert planning
- `/workflows/document` - Documentation workflow
- `.claude/hooks/orchestrator_context.py` - Context detection
- `.claude/hooks/orchestrator_guard.py` - Tool blocking enforcement
