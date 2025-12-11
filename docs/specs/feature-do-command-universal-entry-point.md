# Feature Plan: /do Command - Universal Entry Point for KotaDB Workflows

## Overview

### Problem

KotaDB currently has 98 commands across 16 categories with 15+ orchestration entry points:
- `/workflows/orchestrator` - Issue to PR automation
- `/workflows/plan`, `/workflows/implement`, `/workflows/document`
- `/issues/feature`, `/issues/bug`, `/issues/chore`
- `/experts/orchestrators/planning_council`, `/experts/orchestrators/review_panel`
- `/ci/*`, `/release/*`, `/github/*` - Multiple specialized workflows

**Current Pain Points:**
1. **Cognitive Overhead**: Users must know which command to use for their intent
2. **No Delegation Enforcement**: Orchestrators can still modify files directly
3. **Inconsistent Entry Points**: Similar intents have different command paths
4. **Poor Discoverability**: New users don't know where to start
5. **Manual Routing**: Users manually select between plan/build/review workflows

### Desired Outcome

Single `/do <requirement>` command that:
- Classifies user intent into 7 workflow categories
- Routes to appropriate orchestrator or workflow
- Enforces delegation pattern (orchestrators plan, agents execute)
- Provides fallback to AskUserQuestion for ambiguous intents
- Maintains parallel operation with existing commands during migration

**Key Capabilities:**
- Intent classification with 85%+ accuracy
- Hook-based enforcement preventing Write/Edit in orchestrator context
- State management for resumable workflows
- Clear migration path preserving existing commands
- Integration with MCP validation tools for quality gates

### Non-Goals

- Replacing all existing commands immediately (phased migration)
- Changing underlying agent architecture (reuses 4 core agents)
- Implementing new MCP tools (uses existing search_code, validate_implementation_spec)
- Supporting multi-project workflows (single project at a time)
- Building AI intent classification (keyword-based with fallback)

## Technical Approach

### Architecture

**Two-Layer Hook Enforcement System:**

1. **orchestrator_context.py** (UserPromptSubmit hook)
   - Detects `/do` invocations and orchestrator commands
   - Sets `CLAUDE_ORCHESTRATOR_CONTEXT="do-router"` in environment
   - Persists context to `.claude/data/orchestrator_context.json`

2. **orchestrator_guard.py** (PreToolUse hook)
   - Intercepts all tool usage
   - Blocks `Write`, `Edit`, `MultiEdit`, `NotebookEdit` when orchestrator context active
   - Provides clear error messages directing to delegation via Task tool
   - Allows `Read`, `Grep`, `Glob`, `Bash`, `Task`, `SlashCommand`, etc.

**Intent Classification Algorithm:**

```python
def classify_intent(requirement: str) -> IntentCategory:
    """
    Classify user requirement into workflow category.

    Returns: IntentCategory with confidence score
    Raises: AmbiguousIntentError if confidence < 0.7
    """
    # Priority order (highest to lowest)
    patterns = [
        # 1. GitHub Issue Pattern
        (r'#\d+|issue \d+|bug report|feature request', 'github_issue'),

        # 2. Spec/Planning Pattern
        (r'\b(plan|spec|design|architect)\b', 'spec_planning'),

        # 3. Implementation Pattern
        (r'\b(implement|build|fix|add|create)\b', 'implementation'),

        # 4. Review Pattern
        (r'\b(review|check|audit|PR #\d+)\b', 'review'),

        # 5. Documentation Pattern
        (r'\b(document|docs|readme|write doc)\b', 'documentation'),

        # 6. CI/CD Pattern
        (r'\b(ci|pipeline|deploy|release|publish)\b', 'ci_cd'),

        # 7. Expert Analysis Pattern
        (r'\b(expert|architecture analysis|security review)\b', 'expert_analysis'),
    ]

    # Score each pattern
    scores = score_patterns(requirement, patterns)

    # Return highest confidence if > 0.7
    if scores[0].confidence > 0.7:
        return scores[0].category

    # Raise for human clarification
    raise AmbiguousIntentError(scores)
```

**Routing Handlers:**

```markdown
# /do Command Routing Table

| Intent Category | Route Target | Example Input |
|----------------|--------------|---------------|
| github_issue | `/issues/{type}` or `/workflows/orchestrator` | "#123", "bug report" |
| spec_planning | `/workflows/plan` | "plan API endpoint" |
| implementation | `/workflows/orchestrator` or `/workflows/implement` | "implement feature" |
| review | `/experts/orchestrators/review_panel` | "review PR #456" |
| documentation | `/workflows/document` | "document API" |
| ci_cd | `/ci/*` or `/release/release` | "deploy to staging" |
| expert_analysis | Expert triad commands | "security review" |
```

**ADW State Integration:**

The `/do` command creates an ADW state entry for resumability:

```json
{
  "adw_id": "do-20251210143000-abc123",
  "user_requirement": "implement user authentication",
  "classified_intent": "implementation",
  "confidence_score": 0.92,
  "route_target": "/workflows/orchestrator",
  "delegated_to": "orchestrator-agent",
  "orchestrator_context": "do-router",
  "checkpoints": [
    {
      "timestamp": "2025-12-10T14:30:15",
      "phase": "classification",
      "status": "completed",
      "next_action": "route_to_orchestrator"
    }
  ],
  "created_at": "2025-12-10T14:30:00",
  "updated_at": "2025-12-10T14:35:22"
}
```

**MCP Validation Integration:**

Before routing to implementation workflows:

1. **Pre-Build Quality Gates** (via `analyze_change_impact`):
   - Risk assessment: high (schema/auth), medium (API/features), low (docs/config)
   - Dependency impact analysis
   - Breaking change detection

2. **Validation Level Selection**:
   - L1 (Lint only): Docs, config comments
   - L2 (Integration): Features, bugs, endpoints (DEFAULT)
   - L3 (Full suite): Schema, auth, migrations, high-risk

3. **Post-Implementation Validation** (via `validate_implementation_spec`):
   - Spec compliance checking
   - Test coverage verification
   - Documentation completeness

### Key Modules

#### New Files

**`.claude/commands/do.md`** - Main /do command (350-400 lines)
- Intent classification logic with keyword matching
- Routing decision tree for 7 categories
- AskUserQuestion fallback for ambiguous intents
- ADW state initialization
- Delegation to target workflow via SlashCommand tool
- Checkpoint management for resumability
- Error handling with context preservation

**`.claude/hooks/orchestrator_context.py`** - UserPromptSubmit hook (150-200 lines)
- Detects `/do` and orchestrator command patterns
- Sets `CLAUDE_ORCHESTRATOR_CONTEXT` environment variable
- Persists context to JSON state file
- Cleanup on non-orchestrator commands

**`.claude/hooks/orchestrator_guard.py`** - PreToolUse hook (100-150 lines)
- Intercepts all tool usage
- Checks for orchestrator context
- Blocks Write/Edit/MultiEdit/NotebookEdit
- Provides helpful error messages
- Allows read-only and coordination tools

**`.claude/agents/do-router.md`** - Agent definition (100-120 lines)
- Agent name: `do-router`
- Model: `haiku` (fast classification, low cost)
- Description: Intent classification and workflow routing
- Tools: `Read`, `Grep`, `Glob`, `SlashCommand`, `AskUserQuestion`
- No Write/Edit tools (coordination only)

#### Files to Modify

**`.claude/settings.json`**
```json
{
  "hooks": [
    {
      "name": "orchestrator_context",
      "file": "hooks/orchestrator_context.py",
      "event": "UserPromptSubmit",
      "enabled": true
    },
    {
      "name": "orchestrator_guard",
      "file": "hooks/orchestrator_guard.py",
      "event": "PreToolUse",
      "enabled": true
    },
    {
      "name": "auto_linter",
      "file": "hooks/auto_linter.py",
      "event": "PostToolUse",
      "enabled": true
    },
    {
      "name": "context_builder",
      "file": "hooks/context_builder.py",
      "event": "UserPromptSubmit",
      "enabled": true
    }
  ]
}
```

**`.claude/agents/agent-registry.json`**
```json
{
  "agents": {
    "do-router": {
      "model": "haiku",
      "role": "Intent classification and workflow routing",
      "capabilities": [
        "intent-classification",
        "workflow-routing",
        "requirement-analysis"
      ],
      "tools": {
        "allowed": ["Read", "Grep", "Glob", "SlashCommand", "AskUserQuestion"],
        "denied": ["Write", "Edit", "MultiEdit", "NotebookEdit"]
      },
      "intent_patterns": {
        "github_issue": ["#\\d+", "issue", "bug report", "feature request"],
        "spec_planning": ["plan", "spec", "design", "architect"],
        "implementation": ["implement", "build", "fix", "add"],
        "review": ["review", "check", "audit", "PR #"],
        "documentation": ["document", "docs", "readme"],
        "ci_cd": ["ci", "pipeline", "deploy", "release"],
        "expert_analysis": ["expert", "architecture analysis"]
      }
    },
    "scout-agent": { /* existing */ },
    "build-agent": { /* existing */ },
    "review-agent": { /* existing */ },
    "orchestrator-agent": { /* existing */ }
  },
  "capabilityIndex": {
    "intent-classification": ["do-router"],
    "workflow-routing": ["do-router"],
    "codebase-exploration": ["scout-agent"],
    "implementation": ["build-agent"],
    "code-review": ["review-agent"],
    "workflow-orchestration": ["orchestrator-agent"]
  },
  "modelIndex": {
    "haiku": ["do-router", "scout-agent", "review-agent"],
    "sonnet": ["build-agent"],
    "opus": ["orchestrator-agent"]
  }
}
```

**`.claude/CLAUDE.md`**

Add to "Slash Commands" section:

```markdown
### Universal Entry Point
- `/do <requirement>` - Universal command routing to appropriate workflow
  - Examples:
    - `/do #123` → Routes to issue workflow
    - `/do plan user authentication` → Routes to planning workflow
    - `/do implement login endpoint` → Routes to implementation
    - `/do review PR #456` → Routes to review panel
    - `/do document API` → Routes to documentation workflow
```

Add new section "Orchestrator Pattern Enforcement":

```markdown
## Orchestrator Pattern Enforcement

KotaDB enforces a strict delegation pattern via hooks:

**Philosophy**: Orchestrators plan and coordinate, build agents execute.

**Enforcement Mechanism**:
1. `orchestrator_context.py` (UserPromptSubmit) - Detects orchestrator commands
2. `orchestrator_guard.py` (PreToolUse) - Blocks file modifications in orchestrator context

**Blocked Tools in Orchestrator Context**:
- `Write`, `Edit`, `MultiEdit`, `NotebookEdit`

**Allowed Tools in Orchestrator Context**:
- `Read`, `Grep`, `Glob`, `Bash`
- `Task` (delegation to build agents)
- `SlashCommand` (delegation to other workflows)
- `AskUserQuestion`, `TodoWrite`

**Context Detection**:
- `/do` command
- `/workflows/orchestrator`
- `/experts/orchestrators/*`
- Any command with `orchestrator` in path

**Context Cleanup**:
- Automatically clears when non-orchestrator commands run
- Persisted to `.claude/data/orchestrator_context.json`
```

### Data Impacts

**New State Files**:
- `.claude/data/orchestrator_context.json` - Current orchestrator context
- `.claude/data/do_state/{adw_id}.json` - Per-invocation state

**Environment Variables**:
- `CLAUDE_ORCHESTRATOR_CONTEXT` - Set to "do-router" or orchestrator name
- `CLAUDE_ENV_FILE` - Points to `.claude/data/env` for hook communication

**No Database Changes**: All state is file-based in `.claude/data/`

## Relevant Files

### Existing Files to Reference

**Commands**:
- `.claude/commands/workflows/orchestrator.md` - Pattern for delegation
- `.claude/commands/workflows/plan.md` - Planning workflow structure
- `.claude/commands/workflows/implement.md` - Implementation patterns
- `.claude/commands/experts/orchestrators/planning_council.md` - Expert coordination

**Agents**:
- `.claude/agents/agent-registry.json` - Agent definition structure
- `.claude/agents/scout-agent.md` - Read-only agent pattern
- `.claude/agents/orchestrator-agent.md` - Coordination patterns

**Hooks**:
- `.claude/hooks/auto_linter.py` - PostToolUse hook example
- `.claude/hooks/context_builder.py` - UserPromptSubmit hook example

**Documentation**:
- `.claude/CLAUDE.md` - Command documentation patterns
- `docs/claude-directory-configuration-guide.md` - Hook documentation

**State Management**:
- `.claude/data/session_state.json` - Session state pattern
- `.claude/data/sequence_counter.json` - ID generation pattern

### New Files

- `.claude/commands/do.md` - Main /do command (350-400 lines)
- `.claude/hooks/orchestrator_context.py` - Context detection hook (150-200 lines)
- `.claude/hooks/orchestrator_guard.py` - Tool blocking hook (100-150 lines)
- `.claude/agents/do-router.md` - Router agent definition (100-120 lines)
- `.claude/data/orchestrator_context.json` - State file (created by hook)

## Task Breakdown

### Phase 1: Foundation & Hook Infrastructure (Week 1)

**Days 1-2: Hook Implementation**
- Study existing hooks (`auto_linter.py`, `context_builder.py`)
- Create `orchestrator_context.py` with detection logic
- Create `orchestrator_guard.py` with tool blocking
- Test hooks with manual context setting

**Days 3-4: Intent Classification**
- Design keyword pattern matching algorithm
- Create confidence scoring system
- Implement AmbiguousIntentError fallback
- Test classification with sample requirements

**Day 5: ADW State Integration**
- Design `/do` state schema
- Implement checkpoint save/load
- Create state directory structure
- Test state persistence

### Phase 2: /do Command Implementation (Week 2)

**Days 1-2: Core Routing Logic**
- Create `/do.md` command file
- Implement 7-category routing table
- Add SlashCommand delegation
- Test routing with dry-run

**Days 3-4: Error Handling & Fallbacks**
- Implement AskUserQuestion for ambiguity
- Add error context preservation
- Create helpful error messages
- Test edge cases

**Day 5: Agent Registry Updates**
- Add `do-router` to agent registry
- Update capability indexes
- Add intent pattern mappings
- Validate JSON schema

### Phase 3: Validation & Testing (Week 3)

**Days 1-2: MCP Integration**
- Integrate `analyze_change_impact` pre-checks
- Add validation level selection logic
- Implement `validate_implementation_spec` post-checks
- Test MCP tool responses

**Days 3-4: Integration Testing**
- Test all 7 intent categories end-to-end
- Test hook enforcement (verify blocking)
- Test state resumability
- Test migration scenarios

**Day 5: Documentation**
- Update CLAUDE.md with /do documentation
- Document hook system in guide
- Create migration guide
- Add troubleshooting section

### Phase 4: Migration Strategy (Weeks 4-12)

**Phase 4.1: Parallel Operation (Weeks 4-7)**
- Deploy /do alongside existing commands
- Monitor usage patterns via git history
- Collect user feedback
- Track classification accuracy

**Phase 4.2: Soft Deprecation (Weeks 8-10)**
- Add deprecation warnings to absorbed commands
- Update documentation to prefer /do
- Create redirection aliases
- Monitor migration progress

**Phase 4.3: Hard Deprecation (Weeks 11-12)**
- Add strong warnings to old commands
- Update all documentation to /do
- Plan for eventual removal
- Final migration validation

## Step by Step Tasks

### Task Group 1: Create Hook Infrastructure

**Create `orchestrator_context.py`**:
```python
"""
Hook: orchestrator_context.py
Event: UserPromptSubmit
Purpose: Detect orchestrator commands and set context
"""

import os
import json
from pathlib import Path

ORCHESTRATOR_PATTERNS = [
    "/do",
    "/workflows/orchestrator",
    "/experts/orchestrators/",
]

def on_user_prompt_submit(prompt: str) -> None:
    """
    Detect orchestrator commands and set CLAUDE_ORCHESTRATOR_CONTEXT.

    Sets environment variable and persists to .claude/data/orchestrator_context.json
    """
    # Check if prompt matches orchestrator pattern
    is_orchestrator = any(pattern in prompt for pattern in ORCHESTRATOR_PATTERNS)

    if is_orchestrator:
        # Determine context name
        if "/do" in prompt:
            context_name = "do-router"
        elif "/workflows/orchestrator" in prompt:
            context_name = "workflow-orchestrator"
        elif "/experts/orchestrators/" in prompt:
            context_name = "expert-orchestrator"
        else:
            context_name = "unknown-orchestrator"

        # Set environment variable
        os.environ["CLAUDE_ORCHESTRATOR_CONTEXT"] = context_name

        # Persist to state file
        state_file = Path(".claude/data/orchestrator_context.json")
        state_file.parent.mkdir(parents=True, exist_ok=True)

        state = {
            "context_name": context_name,
            "prompt": prompt[:200],  # First 200 chars
            "timestamp": datetime.utcnow().isoformat()
        }

        state_file.write_text(json.dumps(state, indent=2))

    else:
        # Clear orchestrator context
        os.environ.pop("CLAUDE_ORCHESTRATOR_CONTEXT", None)

        state_file = Path(".claude/data/orchestrator_context.json")
        if state_file.exists():
            state_file.unlink()
```

**Create `orchestrator_guard.py`**:
```python
"""
Hook: orchestrator_guard.py
Event: PreToolUse
Purpose: Block file modifications in orchestrator context
"""

import os
import sys

BLOCKED_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"]

ALLOWED_TOOLS = [
    "Read", "Grep", "Glob", "Bash",
    "Task", "SlashCommand",
    "AskUserQuestion", "TodoWrite",
    "WebFetch", "WebSearch"
]

def on_pre_tool_use(tool_name: str, tool_params: dict) -> None:
    """
    Block file modification tools when in orchestrator context.

    Raises SystemExit with helpful error message if blocked.
    """
    # Check if orchestrator context is active
    orchestrator_context = os.environ.get("CLAUDE_ORCHESTRATOR_CONTEXT")

    if orchestrator_context and tool_name in BLOCKED_TOOLS:
        error_message = f"""
ERROR: Tool '{tool_name}' is blocked in orchestrator context.

Current Context: {orchestrator_context}

Orchestrators must delegate file modifications to build agents.

Instead of using {tool_name} directly:
1. Use the Task tool to spawn a build-agent
2. Or use SlashCommand to delegate to a workflow command

Example delegation:
```
Use the Task tool to spawn build-agent with this requirement:
- Create file: {tool_params.get('file_path', 'target_file.ts')}
- Content: [specification here]
```

Allowed tools in orchestrator context: {', '.join(ALLOWED_TOOLS)}

To disable this enforcement, unset CLAUDE_ORCHESTRATOR_CONTEXT.
        """

        print(error_message, file=sys.stderr)
        sys.exit(1)
```

**Update `settings.json`**:
- Add `orchestrator_context` hook entry
- Add `orchestrator_guard` hook entry
- Set `enabled: true` for both
- Validate JSON schema

### Task Group 2: Implement Intent Classification

**Create classification algorithm in `/do.md`**:
```markdown
## Intent Classification Logic

### Step 1: Extract Keywords

Parse user requirement and extract keywords for pattern matching.

### Step 2: Score Patterns

Score each category based on keyword presence and context:

**GitHub Issue** (Priority 1):
- Patterns: `#\d+`, `issue \d+`, `bug report`, `feature request`
- Confidence boost: +0.3 for issue number

**Spec/Planning** (Priority 2):
- Patterns: `plan`, `spec`, `design`, `architect`
- Confidence boost: +0.2 if no implementation keywords

**Implementation** (Priority 3):
- Patterns: `implement`, `build`, `fix`, `add`, `create`
- Confidence boost: +0.2 if action verb present

**Review** (Priority 4):
- Patterns: `review`, `check`, `audit`, `PR #\d+`
- Confidence boost: +0.3 for PR number

**Documentation** (Priority 5):
- Patterns: `document`, `docs`, `readme`, `write doc`
- Confidence boost: +0.1 if no code keywords

**CI/CD** (Priority 6):
- Patterns: `ci`, `pipeline`, `deploy`, `release`, `publish`
- Confidence boost: +0.2 if deployment keywords

**Expert Analysis** (Priority 7):
- Patterns: `expert`, `architecture analysis`, `security review`
- Confidence boost: +0.15 if expert domain mentioned

### Step 3: Select Highest Confidence

- If max confidence > 0.7: Route to category
- If max confidence 0.5-0.7: Ask clarifying question
- If max confidence < 0.5: Use AskUserQuestion with options
```

### Task Group 3: Create /do Command

**Create `.claude/commands/do.md`** (structure):

```markdown
---
description: Universal entry point for KotaDB workflows
argument-hint: <requirement>
---

# /do - Universal Workflow Router

## Purpose

Route user requirements to appropriate workflow based on intent classification.

## Usage

```bash
/do <requirement>
```

## Variables

USER_REQUIREMENT: $ARGUMENTS

## Workflow

### Phase 1: Intent Classification

[Classification logic from Task Group 2]

### Phase 2: Validation & Risk Assessment

Use MCP tools to assess change impact:

```typescript
// For implementation intents, check risk level
const impact = await analyze_change_impact({
  requirement: USER_REQUIREMENT
});

// Select validation level based on risk
const validation_level =
  impact.risk === "high" ? "L3" :
  impact.risk === "medium" ? "L2" :
  "L1";
```

### Phase 3: Route to Workflow

Based on classified intent:

**GitHub Issue** → `/issues/{type}` or `/workflows/orchestrator #<num>`
**Spec/Planning** → `/workflows/plan <requirement>`
**Implementation** → `/workflows/orchestrator` or `/workflows/implement`
**Review** → `/experts/orchestrators/review_panel <pr-num>`
**Documentation** → `/workflows/document <target>`
**CI/CD** → `/ci/*` or `/release/release`
**Expert Analysis** → Expert triad commands

### Phase 4: State Management

Create ADW state for resumability:

```json
{
  "adw_id": "do-{timestamp}-{random}",
  "user_requirement": "...",
  "classified_intent": "...",
  "confidence_score": 0.92,
  "route_target": "...",
  "validation_level": "L2",
  "checkpoints": []
}
```

### Phase 5: Delegation

Use SlashCommand tool to delegate to target workflow.

### Phase 6: Error Handling

If delegation fails:
- Preserve checkpoint state
- Provide recovery instructions
- Log to `.claude/data/do_state/{adw_id}.json`

## Output Format

```
/do Classification Result:
- Intent: {classified_intent}
- Confidence: {confidence_score}
- Route: {route_target}
- Validation Level: {validation_level}

Delegating to {route_target}...

[Output from delegated workflow]

/do Completion:
- Status: {success|failed}
- ADW ID: {adw_id}
- Checkpoint: {last_checkpoint}
```
```

### Task Group 4: Create Agent Definition

**Create `.claude/agents/do-router.md`**:

```markdown
# do-router Agent

## Agent Configuration

**Name**: do-router
**Model**: haiku
**Role**: Intent classification and workflow routing

## Description

The do-router agent classifies user requirements and routes to appropriate workflows.
It operates in read-only mode, never modifying files directly.

## Capabilities

- Intent classification with keyword pattern matching
- Requirement analysis and risk assessment
- Workflow routing decisions
- Ambiguity detection and clarification

## Tool Access

**Allowed Tools**:
- `Read` - Read existing specs and documentation
- `Grep` - Search codebase for context
- `Glob` - Find relevant files
- `SlashCommand` - Delegate to target workflows
- `AskUserQuestion` - Clarify ambiguous requirements

**Denied Tools**:
- `Write` - No file creation (orchestrator pattern)
- `Edit` - No file modification (orchestrator pattern)
- `MultiEdit` - No bulk edits (orchestrator pattern)
- `NotebookEdit` - No notebook changes (orchestrator pattern)

## Usage Pattern

Invoked automatically by `/do` command:
1. Receive user requirement
2. Classify intent with confidence scoring
3. Assess risk and validation needs
4. Route to target workflow
5. Track state for resumability

## Integration Points

- **Hooks**: orchestrator_context.py sets context before invocation
- **Hooks**: orchestrator_guard.py enforces tool restrictions
- **MCP**: Uses analyze_change_impact for risk assessment
- **ADW**: Creates state entries in .claude/data/do_state/
```

### Task Group 5: Testing & Validation

**Integration Test Scenarios**:

```bash
# Test 1: GitHub Issue Intent
/do #123
# Expected: Routes to /workflows/orchestrator 123

# Test 2: Planning Intent
/do plan user authentication system
# Expected: Routes to /workflows/plan

# Test 3: Implementation Intent
/do implement login endpoint
# Expected: Routes to /workflows/orchestrator

# Test 4: Review Intent
/do review PR #456
# Expected: Routes to /experts/orchestrators/review_panel 456

# Test 5: Documentation Intent
/do document API endpoints
# Expected: Routes to /workflows/document

# Test 6: CI/CD Intent
/do deploy to staging
# Expected: Routes to /ci/deploy or prompts for clarification

# Test 7: Expert Analysis Intent
/do security review of auth flow
# Expected: Routes to security-expert commands

# Test 8: Ambiguous Intent
/do something
# Expected: AskUserQuestion with category options

# Test 9: Hook Enforcement
# Manually set CLAUDE_ORCHESTRATOR_CONTEXT=do-router
# Try /do then attempt Write tool
# Expected: Tool blocked with error message

# Test 10: State Resumability
/do implement feature
# Kill mid-process
# Resume with state file
# Expected: Continues from checkpoint
```

**Hook Testing**:

```bash
# Test orchestrator_context.py
/do test requirement
# Verify: CLAUDE_ORCHESTRATOR_CONTEXT=do-router in env
# Verify: .claude/data/orchestrator_context.json created

# Test orchestrator_guard.py with blocked tool
# Set CLAUDE_ORCHESTRATOR_CONTEXT=do-router
# Attempt Write tool usage
# Verify: Tool blocked with helpful error

# Test orchestrator_guard.py with allowed tool
# Set CLAUDE_ORCHESTRATOR_CONTEXT=do-router
# Use Read tool
# Verify: Tool executes normally

# Test context cleanup
# Run non-orchestrator command
# Verify: CLAUDE_ORCHESTRATOR_CONTEXT cleared
# Verify: .claude/data/orchestrator_context.json removed
```

**MCP Integration Testing**:

```bash
# Test analyze_change_impact integration
/do implement database schema change
# Verify: MCP tool called
# Verify: Risk level assessed
# Verify: Validation level selected (L3 for schema)

# Test validate_implementation_spec integration
# Complete /do implementation flow
# Verify: Post-implementation validation runs
# Verify: Spec compliance checked
```

### Task Group 6: Documentation Updates

**Update `.claude/CLAUDE.md`**:
- Add `/do` to "Slash Commands" section
- Create "Orchestrator Pattern Enforcement" section
- Document hook system
- Add troubleshooting guide

**Update `docs/claude-directory-configuration-guide.md`**:
- Document hook architecture
- Explain orchestrator context system
- Provide hook development guide
- Add /do command reference

**Create migration guide** (`docs/DO_COMMAND_MIGRATION.md`):
- Explain parallel operation phase
- Provide command equivalency table
- Document deprecation timeline
- Troubleshooting common issues

### Task Group 7: Agent Registry Updates

**Update `.claude/agents/agent-registry.json`**:
- Add `do-router` agent entry
- Update `capabilityIndex` with intent-classification
- Update `modelIndex` with haiku assignment
- Add `intent_patterns` to do-router

**Validate registry**:
```bash
# Validate JSON syntax
cat .claude/agents/agent-registry.json | jq .

# Test agent lookup by capability
jq '.capabilityIndex["intent-classification"]' .claude/agents/agent-registry.json
# Expected: ["do-router"]

# Test model index
jq '.modelIndex.haiku' .claude/agents/agent-registry.json
# Expected: includes "do-router"
```

## Risks & Mitigations

### Risk: Intent Misclassification

**Impact**: User routed to wrong workflow, wastes time
**Mitigation**:
- Confidence threshold at 0.7 (70% certainty)
- AskUserQuestion fallback for 0.5-0.7 confidence
- Show classification reasoning to user
- Allow manual override with `/do --force-route <category>`
- Track misclassifications in state for improvement

### Risk: Hook Performance Overhead

**Impact**: Every tool use incurs hook latency
**Mitigation**:
- Keep guard hook logic minimal (<10ms)
- Cache context state in memory
- Only check blocked tools (skip check for allowed tools)
- Profile hook execution in CI

### Risk: State File Corruption

**Impact**: Cannot resume workflows, lost progress
**Mitigation**:
- Atomic writes with temp file + rename
- JSON schema validation before writing
- Checkpoint history (keep last 5)
- Manual recovery documentation
- State file backup before updates

### Risk: Hook Bypass

**Impact**: Orchestrator modifies files despite guard
**Mitigation**:
- Hook runs at framework level (cannot bypass)
- Guard hook is PreToolUse (blocks before execution)
- Environment variable checked, not honor system
- Integration tests verify blocking
- Code review on hook changes

### Risk: Migration Friction

**Impact**: Users resist new /do command
**Mitigation**:
- Parallel operation for 4 weeks (no breaking changes)
- Clear equivalency documentation
- Soft warnings in old commands (weeks 5-8)
- Strong warnings (weeks 9-12)
- Never force migration (deprecate, not remove)
- Monitor adoption via git history

### Risk: Ambiguous Requirements

**Impact**: Classification fails, user frustrated
**Mitigation**:
- AskUserQuestion with clear options
- Show classification reasoning
- Provide examples of better phrasing
- Learn from ambiguous cases (log to state)
- Improve patterns based on feedback

### Risk: MCP Tool Unavailability

**Impact**: Risk assessment fails, cannot select validation level
**Mitigation**:
- Graceful degradation (default to L2 validation)
- Retry with exponential backoff
- Log MCP errors for debugging
- Manual validation level override: `/do --validation L3`
- Document MCP setup requirements

## Validation Strategy

### Automated Tests

**Hook Unit Tests** (`tests/hooks/test_orchestrator_hooks.py`):
- Test context detection for /do, /workflows/orchestrator, /experts/orchestrators/
- Test context cleanup on non-orchestrator commands
- Test tool blocking for Write/Edit/MultiEdit/NotebookEdit
- Test tool allowing for Read/Grep/Glob/Task/SlashCommand
- Test error messages for blocked tools
- Coverage target: 100% for hook code

**Intent Classification Tests** (`tests/do/test_intent_classification.py`):
- Test all 7 category patterns with sample requirements
- Test confidence scoring algorithm
- Test ambiguity detection (0.5-0.7 range)
- Test AskUserQuestion fallback (<0.5 confidence)
- Test priority ordering (GitHub issue > planning > implementation)
- Coverage target: 100% for classification logic

**Integration Tests** (`tests/do/test_do_command_integration.py`):
- Test end-to-end flow for each intent category
- Test routing to correct workflow commands
- Test state creation and checkpoint persistence
- Test MCP tool integration (analyze_change_impact, validate_implementation_spec)
- Test hook enforcement during /do execution
- Test resumability from checkpoints
- Coverage target: 90% for /do command paths

### Manual Validation

**Validation Level 2** (Feature with integration):
```bash
# Lint and type check
cd app && bun run lint
cd app && bunx tsc --noEmit

# Hook tests
pytest tests/hooks/test_orchestrator_hooks.py -v

# Intent classification tests
pytest tests/do/test_intent_classification.py -v

# Integration tests
pytest tests/do/test_do_command_integration.py -v
```

**Manual Test Suite**:
1. Test /do with each category (10 scenarios from Task Group 5)
2. Test hook enforcement (set context, verify blocking)
3. Test state persistence (check .claude/data/do_state/)
4. Test resumability (kill and resume workflow)
5. Test ambiguity handling (vague requirements)
6. Test MCP integration (verify tool calls)
7. Test migration scenarios (parallel operation with old commands)

**Evidence Collection**:
- Hook test results with 100% coverage
- Classification test results with example requirements
- Integration test results with MCP mock verification
- Manual test logs from .claude/data/do_state/
- Screenshots of hook blocking errors
- State file examples showing checkpoints

## Validation Commands

**Python Test Suite**:
```bash
# All /do-related tests
pytest tests/do/ tests/hooks/ -v

# With coverage report
pytest tests/do/ tests/hooks/ \
  --cov=.claude/commands \
  --cov=.claude/hooks \
  --cov-report=term-missing

# Specific test suites
pytest tests/hooks/test_orchestrator_hooks.py -v
pytest tests/do/test_intent_classification.py -v
pytest tests/do/test_do_command_integration.py -v
```

**Hook Validation**:
```bash
# Verify hooks registered in settings.json
jq '.hooks[] | select(.name | contains("orchestrator"))' .claude/settings.json

# Test hook file syntax
python3 -m py_compile .claude/hooks/orchestrator_context.py
python3 -m py_compile .claude/hooks/orchestrator_guard.py

# Test hook execution (dry-run)
CLAUDE_ORCHESTRATOR_CONTEXT=do-router python3 .claude/hooks/orchestrator_guard.py
```

**Agent Registry Validation**:
```bash
# Validate JSON schema
cat .claude/agents/agent-registry.json | jq .

# Verify do-router registered
jq '.agents["do-router"]' .claude/agents/agent-registry.json

# Verify capability index
jq '.capabilityIndex["intent-classification"]' .claude/agents/agent-registry.json

# Verify intent patterns
jq '.agents["do-router"].intent_patterns' .claude/agents/agent-registry.json
```

**Documentation Validation**:
```bash
# Verify CLAUDE.md updated
grep -i "/do" .claude/CLAUDE.md
grep -i "orchestrator.*enforcement" .claude/CLAUDE.md

# Verify migration guide exists
test -f docs/DO_COMMAND_MIGRATION.md && echo "Migration guide present"

# Verify hook documentation
grep -i "orchestrator_context\|orchestrator_guard" docs/claude-directory-configuration-guide.md
```

**State File Validation**:
```bash
# Test state creation
mkdir -p .claude/data/do_state
echo '{"test": "state"}' > .claude/data/do_state/test.json
jq . .claude/data/do_state/test.json  # Validate JSON

# Test orchestrator context persistence
cat .claude/data/orchestrator_context.json | jq .
```

## Migration Plan

### Phase 1: Parallel Operation (Weeks 1-4)

**Week 1: Deployment**
- Merge /do command implementation
- Enable hooks in settings.json
- Deploy to development environment
- Monitor for hook errors

**Week 2: Internal Testing**
- Team uses /do alongside existing commands
- Collect classification accuracy metrics
- Identify misclassification patterns
- Update intent patterns based on feedback

**Week 3: Documentation**
- Update all guides to mention /do
- Create equivalency table (old command → /do phrasing)
- Record training videos
- Update onboarding materials

**Week 4: Soft Launch**
- Announce /do in team channels
- Encourage usage but don't deprecate old commands
- Monitor adoption rate
- Collect user feedback

### Phase 2: Soft Deprecation (Weeks 5-8)

**Week 5: Add Warnings**
- Add notices to absorbed commands:
  ```markdown
  > **Note**: Consider using `/do <requirement>` instead.
  > This command will be deprecated in the future.
  > See docs/DO_COMMAND_MIGRATION.md for details.
  ```
- Update command help text
- Track warning acknowledgements

**Week 6: Documentation Migration**
- Rewrite examples to use /do
- Update troubleshooting guides
- Create comparison charts
- Publish migration blog post

**Week 7: Measure Adoption**
- Analyze git log for command usage
- Calculate /do adoption rate (target: 60%)
- Identify holdouts and blockers
- Address feedback and concerns

**Week 8: Enhanced Warnings**
- Upgrade warnings to recommendations
- Add "Use /do instead" to command output
- Update command descriptions
- Send migration reminders

### Phase 3: Hard Deprecation (Weeks 9-12)

**Week 9: Strong Warnings**
- Add prominent warnings to old commands:
  ```markdown
  > **WARNING**: This command is deprecated and will be removed.
  > Please use `/do <requirement>` instead.
  > Migration guide: docs/DO_COMMAND_MIGRATION.md
  ```
- Log deprecation usage to monitoring
- Send individual migration notices

**Week 10: Final Migration Push**
- Office hours for migration questions
- One-on-one migration assistance
- Update CI/CD to prefer /do
- Target 90% adoption rate

**Week 11: Removal Plan**
- Identify remaining old command usage
- Create removal timeline
- Document exceptions and blockers
- Plan graceful degradation

**Week 12: Final Validation**
- Verify 90%+ adoption rate
- Document remaining use cases for old commands
- Make go/no-go decision on full removal
- Plan Phase 4 if proceeding with removal

### Command Equivalency Table

| Old Command | New /do Phrasing |
|-------------|------------------|
| `/workflows/orchestrator #123` | `/do #123` |
| `/workflows/plan <spec>` | `/do plan <spec>` |
| `/workflows/implement <spec>` | `/do implement <spec>` |
| `/issues/feature <title>` | `/do feature request <title>` |
| `/issues/bug <title>` | `/do bug report <title>` |
| `/experts/orchestrators/review_panel <pr>` | `/do review PR #<pr>` |
| `/workflows/document <target>` | `/do document <target>` |
| `/ci/deploy staging` | `/do deploy to staging` |
| `/release/release` | `/do release to production` |

### Success Metrics

**Week 4 (End of Phase 1)**:
- [ ] /do classification accuracy > 85%
- [ ] Zero hook performance regressions
- [ ] All integration tests passing
- [ ] At least 20% team adoption

**Week 8 (End of Phase 2)**:
- [ ] /do adoption rate > 60%
- [ ] Less than 5 reported misclassifications/week
- [ ] Migration guide used by 80% of team
- [ ] Positive feedback > 70%

**Week 12 (End of Phase 3)**:
- [ ] /do adoption rate > 90%
- [ ] Zero classification errors for common intents
- [ ] All documentation migrated
- [ ] Ready for old command removal (Phase 4)

## Issue Relationships

- **Depends On**: #474 (claude directory standardization) - COMPLETED
- **Depends On**: #482 (CLAUDE.md navigation gateway) - COMPLETED
- **Depends On**: #483 (expert system architecture) - COMPLETED
- **Related To**: #187 (/workflows/orchestrator) - Pattern inspiration
- **Related To**: #485 (hooks quality enforcement) - Hook infrastructure
- **Blocks**: Future workflow consolidation efforts
- **Enables**: Simplified onboarding (single entry point)

## Deliverables

**Code Changes**:
- `.claude/commands/do.md` - Universal entry point command (350-400 lines)
- `.claude/hooks/orchestrator_context.py` - Context detection hook (150-200 lines)
- `.claude/hooks/orchestrator_guard.py` - Tool blocking hook (100-150 lines)
- `.claude/agents/do-router.md` - Agent definition (100-120 lines)
- `tests/hooks/test_orchestrator_hooks.py` - Hook test suite (200-250 lines)
- `tests/do/test_intent_classification.py` - Classification tests (300-350 lines)
- `tests/do/test_do_command_integration.py` - Integration tests (400-450 lines)

**Config Updates**:
- `.claude/settings.json` - Hook registration
- `.claude/agents/agent-registry.json` - do-router agent registration

**Documentation Updates**:
- `.claude/CLAUDE.md` - /do command and orchestrator enforcement
- `docs/claude-directory-configuration-guide.md` - Hook system documentation
- `docs/DO_COMMAND_MIGRATION.md` - Migration guide (NEW)

**Test Coverage**:
- Hook code: 100% coverage
- Intent classification: 100% coverage
- /do command paths: 90% coverage
- Integration scenarios: All 7 categories tested

## Commit Message Validation

All commits for this feature will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements:
  - `feat(commands): add /do universal entry point` ✓
  - `feat(hooks): add orchestrator pattern enforcement` ✓
  - `test(do): add intent classification tests` ✓
  - `docs(migration): add /do command migration guide` ✓

## References

**Internal Documentation**:
- `docs/claude-directory-configuration-guide.md` - Hook system patterns (lines 731-943)
- `.claude/CLAUDE.md` - Command documentation conventions
- `docs/specs/feature-187-orchestrator-slash-command.md` - Orchestrator pattern reference
- `docs/specs/feature-483-expert-system-architecture.md` - Expert system architecture

**External Resources**:
- Anthropic Claude Code Hooks: https://docs.anthropic.com/claude-code/hooks
- Conventional Commits: https://www.conventionalcommits.org/
- ADW Pattern: Internal KotaDB architecture documentation

**Related GitHub Issues**:
- #187 - /workflows/orchestrator implementation
- #483 - Expert system architecture
- #485 - Automation hooks quality enforcement
