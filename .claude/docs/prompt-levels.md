# 7-Level Prompt Maturity Model

This document defines the 7-level prompt maturity model used to classify slash commands in KotaDB. The model provides a framework for understanding command complexity, composability, and self-improvement capabilities.

## Overview

| Level | Name | Key Characteristics |
|-------|------|---------------------|
| 1 | Static | Hardcoded instructions, no variables |
| 2 | Parameterized | Uses `$ARGUMENTS` for input |
| 3 | Conditional | Branches based on input or state |
| 4 | Contextual | References external files or context |
| 5 | Higher Order | Invokes other commands, accepts complex context |
| 6 | Self-Modifying | Updates own content based on execution |
| 7 | Meta-Cognitive | Reflects on and improves other commands |

## Level Definitions

### Level 1: Static

Commands with fixed, hardcoded instructions that produce consistent output regardless of context.

**Characteristics:**
- No use of `$ARGUMENTS`
- No external file references
- Predictable, deterministic output
- Simple task automation

**KotaDB Examples:**
- `/tools:tools` - Lists available tools
- `/docs:anti-mock` - Displays antimocking philosophy

**Template Pattern:**
```markdown
# /command-name

**Template Category**: Message-Only

[Fixed instructions that never change]
```

### Level 2: Parameterized

Commands that accept input via `$ARGUMENTS` to customize behavior.

**Characteristics:**
- Uses `$ARGUMENTS` variable
- Input validation may be present
- Output varies based on input
- No complex branching logic

**KotaDB Examples:**
- `/automation:generate_branch_name` - Generates branch name from issue context
- `/worktree:make_worktree_name` - Creates worktree name from branch

**Template Pattern:**
```markdown
# /command-name

**Template Category**: Message-Only

Input: `$ARGUMENTS`

[Instructions that use $ARGUMENTS]
```

### Level 3: Conditional

Commands that branch execution based on input values or system state.

**Characteristics:**
- If/else logic in instructions
- Multiple execution paths
- State-dependent behavior
- May validate prerequisites

**KotaDB Examples:**
- `/issues:classify_issue` - Routes to appropriate issue template
- `/workflows:validate-implementation` - Selects validation level based on change scope

**Template Pattern:**
```markdown
# /command-name

**Template Category**: Action

If [condition]:
  [Path A instructions]
Else:
  [Path B instructions]
```

### Level 4: Contextual

Commands that reference external files, documentation, or system state to inform execution.

**Characteristics:**
- References specific files (e.g., `CLAUDE.md`, config files)
- Uses file content to guide behavior
- May read multiple files
- Context-aware decisions

**KotaDB Examples:**
- `/docs:architecture` - References and explains path aliases from codebase
- `/docs:database` - Provides schema guidance based on actual migrations
- `/workflows:prime` - Builds context from multiple project files

**Template Pattern:**
```markdown
# /command-name

**Template Category**: Action

Read the following files for context:
- `path/to/file1.md`
- `path/to/file2.ts`

[Instructions that use file content]
```

### Level 5: Higher Order

Commands that invoke other commands or accept complex structured context.

**Characteristics:**
- Invokes other slash commands
- Accepts multi-line or structured `$ARGUMENTS`
- Coordinates multiple operations
- May spawn subagents or parallel work

**KotaDB Examples:**
- `/workflows:implement` - Follows a plan file and invokes validation commands
- `/workflows:plan` - Creates structured specification documents
- `/experts:architecture-expert:architecture_expert_plan` - Analyzes from domain perspective
- `/experts:orchestrators:planning_council` - Invokes multiple experts in parallel

**Template Pattern:**
```markdown
# /command-name

**Template Category**: Action

Context: `$ARGUMENTS`

## Instructions
1. [Step that may invoke /other:command]
2. [Step that coordinates multiple operations]

## Expertise Section
[Domain-specific knowledge that informs execution]
```

### Level 6: Self-Modifying

Commands that update their own content based on execution results or learning.

**Characteristics:**
- Modifies own template file
- Accumulates knowledge over time
- Updates Expertise sections
- Reflects on execution outcomes

**KotaDB Examples:**
- `/experts:architecture-expert:architecture_expert_improve` - Updates own expertise
- `/experts:testing-expert:testing_expert_improve` - Learns from codebase changes
- `/experts:security-expert:security_expert_improve` - Accumulates security patterns

**Template Pattern:**
```markdown
# /command-name

**Template Category**: Action

## Instructions
1. Analyze recent git history for patterns
2. Extract learnings relevant to domain
3. Update the Expertise section in `_plan` and `_review` commands

## Self-Improvement Protocol
[How to identify and incorporate new knowledge]
```

### Level 7: Meta-Cognitive

Commands that analyze, evaluate, and improve other commands in the system.

**Characteristics:**
- Operates on other command templates
- Evaluates command effectiveness
- Proposes or applies improvements to other files
- System-wide optimization capability

**KotaDB Examples:**
- `/experts:bulk-update` - Invokes all expert `_improve` commands in parallel
- Future: Command quality analyzer, template optimizer

**Template Pattern:**
```markdown
# /command-name

**Template Category**: Action

## Instructions
1. Scan command directory for improvement candidates
2. Evaluate each command against quality criteria
3. Apply improvements or generate recommendations
4. Verify system integrity after changes
```

## Level Requirements

### Required Sections by Level

| Level | Template Category | $ARGUMENTS | Expertise Section | Self-Update | Cross-Command |
|-------|------------------|------------|-------------------|-------------|---------------|
| 1 | Required | No | No | No | No |
| 2 | Required | Yes | No | No | No |
| 3 | Required | Optional | No | No | No |
| 4 | Required | Optional | Optional | No | No |
| 5 | Required | Yes | Recommended | No | Optional |
| 6 | Required | Optional | Required | Yes | No |
| 7 | Required | Optional | Required | Yes | Yes |

### Template Category Declaration

All commands must declare their Template Category at the top of the file:

```markdown
# /command-name

**Template Category**: [Message-Only|Path Resolution|Action|Structured Data]
```

## Prompt Level Progression

Commands naturally evolve through levels as requirements grow:

1. **Level 1 → 2**: Add `$ARGUMENTS` support
2. **Level 2 → 3**: Add conditional logic
3. **Level 3 → 4**: Reference external context
4. **Level 4 → 5**: Invoke other commands or add Expertise sections
5. **Level 5 → 6**: Add self-modification capability
6. **Level 6 → 7**: Extend to modify other commands

## Best Practices

### Level Selection

- Start at the lowest level that meets requirements
- Avoid over-engineering simple commands
- Document level explicitly in command header

### Expertise Sections

For Level 5+ commands:
```markdown
## Expertise

### [Domain Knowledge Area]
- [Specific pattern or best practice]
- [Common pitfall to avoid]
- [Project-specific convention]

### [Another Knowledge Area]
- [Additional learnings]
```

### Self-Improvement Protocol

For Level 6+ commands:
```markdown
## Self-Improvement Protocol

1. **Trigger**: [When to run improvement]
2. **Sources**: [What to analyze - git log, PRs, issues]
3. **Extraction**: [How to identify new knowledge]
4. **Integration**: [Where to add new knowledge]
5. **Validation**: [How to verify improvement is valid]
```

## Cross-References

- **Command Templates**: `.claude/commands/README.md`
- **Agent Registry**: `.claude/agents/agent-registry.json`
- **Expert System**: `.claude/commands/experts/` directory
- **Conditional Docs**: `.claude/commands/docs/conditional_docs/`
