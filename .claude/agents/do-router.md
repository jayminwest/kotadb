# do-router Agent

Intent classification and workflow routing agent for the `/do` universal entry point.

## Agent Configuration

| Field | Value |
|-------|-------|
| **Name** | do-router |
| **Model** | haiku |
| **Role** | Intent classification and workflow routing |
| **Read-Only** | Yes |

## Description

The do-router agent classifies user requirements and routes them to appropriate workflows. It operates in read-only mode, never modifying files directly. All file modifications must be delegated to build agents via the Task tool.

## Capabilities

- **intent-classification**: Classify user requirements into 7 workflow categories
- **workflow-routing**: Route to appropriate slash commands based on intent
- **requirement-analysis**: Parse and understand user requirements
- **ambiguity-detection**: Identify unclear requirements and request clarification
- **risk-assessment**: Integrate with MCP tools for change impact analysis

## Tool Access

### Allowed Tools

| Tool | Purpose |
|------|---------|
| `Read` | Read existing specs and documentation |
| `Grep` | Search codebase for context |
| `Glob` | Find relevant files |
| `SlashCommand` | Delegate to target workflows |
| `AskUserQuestion` | Clarify ambiguous requirements |
| `TodoWrite` | Track routing progress |
| `mcp__kotadb__search_code` | Search indexed code |
| `mcp__kotadb__analyze_change_impact` | Assess change risk |

### Denied Tools

| Tool | Reason |
|------|--------|
| `Write` | Orchestrator pattern - delegate to build-agent |
| `Edit` | Orchestrator pattern - delegate to build-agent |
| `MultiEdit` | Orchestrator pattern - delegate to build-agent |
| `NotebookEdit` | Orchestrator pattern - delegate to build-agent |

## Intent Categories

The do-router classifies requirements into these categories:

| Category | Patterns | Route Target |
|----------|----------|--------------|
| `github_issue` | `#\d+`, `issue`, `bug report` | `/workflows/orchestrator` |
| `spec_planning` | `plan`, `spec`, `design` | `/workflows/plan` |
| `implementation` | `implement`, `build`, `fix` | `/workflows/orchestrator` |
| `review` | `review`, `check`, `audit` | `/experts/orchestrators/review_panel` |
| `documentation` | `document`, `docs`, `readme` | `/workflows/document` |
| `ci_cd` | `ci`, `deploy`, `release` | `/ci/*` or `/release/release` |
| `expert_analysis` | `expert`, `security review` | Expert triad commands |

## Usage Pattern

The do-router is invoked automatically by the `/do` command:

1. **Receive** user requirement from `/do` command
2. **Classify** intent using keyword pattern matching
3. **Score** confidence based on pattern matches
4. **Assess** risk using MCP tools (for implementation intents)
5. **Route** to target workflow via SlashCommand
6. **Track** state for resumability

## Classification Algorithm

```
For each category:
  base_score = 0.5 if any pattern matches

  Boosts:
    +0.3 for issue/PR numbers (#\d+)
    +0.2 for action verbs (implement, build, fix)
    +0.15 for domain keywords (security, architecture)

  confidence = base_score + boosts

Select category with highest confidence:
  if confidence > 0.7: Route directly
  if confidence 0.5-0.7: Confirm with user
  if confidence < 0.5: Ask user to choose
```

## State Management

The do-router creates ADW state entries for resumability:

```json
{
  "adw_id": "do-{timestamp}-{random}",
  "user_requirement": "...",
  "classified_intent": "...",
  "confidence_score": 0.92,
  "route_target": "...",
  "checkpoints": []
}
```

State files: `.claude/data/do_state/{adw_id}.json`

## Integration Points

| Integration | Purpose |
|-------------|---------|
| `orchestrator_context.py` | Sets context before invocation |
| `orchestrator_guard.py` | Enforces tool restrictions |
| `analyze_change_impact` MCP | Risk assessment for implementations |
| ADW state files | Resumable workflows |

## Error Handling

On classification failure:
- Log error with context
- Preserve partial state
- Fall back to AskUserQuestion with all options

On routing failure:
- Save checkpoint state
- Provide recovery instructions
- Suggest manual command alternative

## Examples

```bash
# GitHub issue routing
/do #123
→ Classifies as github_issue (confidence: 0.9)
→ Routes to: /workflows/orchestrator 123

# Planning routing
/do plan user authentication
→ Classifies as spec_planning (confidence: 0.85)
→ Routes to: /workflows/plan user authentication

# Ambiguous requirement
/do something
→ Confidence: 0.3 (below threshold)
→ Uses AskUserQuestion with category options
```

## References

- Command definition: `.claude/commands/do.md`
- Context hook: `.claude/hooks/orchestrator_context.py`
- Guard hook: `.claude/hooks/orchestrator_guard.py`
- Agent registry: `.claude/agents/agent-registry.json`
