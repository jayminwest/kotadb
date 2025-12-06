---
description: Coordinate multiple experts for comprehensive code review
argument-hint: <pr-number-or-diff-context>
---

# Review Panel

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Purpose

Coordinate Architecture, Testing, Security, Integration, UX, CC Hook, and Claude Config experts to provide comprehensive code review. Aggregates expert findings into a single consolidated review decision.

## Workflow

### Phase 1: Expert Invocation

Invoke all domain experts in parallel using the SlashCommand tool:

```
/experts:architecture-expert:architecture_expert_review <REVIEW_CONTEXT>
/experts:testing-expert:testing_expert_review <REVIEW_CONTEXT>
/experts:security-expert:security_expert_review <REVIEW_CONTEXT>
/experts:integration-expert:integration_expert_review <REVIEW_CONTEXT>
/experts:ux-expert:ux_expert_review <REVIEW_CONTEXT>
/experts:cc_hook_expert:cc_hook_expert_review <REVIEW_CONTEXT>
/experts:claude-config:claude_config_review <REVIEW_CONTEXT>
```

**Expert Invocation Strategy (added after #490):**
- Invoke ALL 7 experts in a single message for true parallelism
- Use Task tool with `subagent_type: general-purpose` and `model: haiku` for cost efficiency
- Handle partial failures gracefully - one expert failure shouldn't block the review

### Phase 2: Response Collection

Wait for all expert responses. Each expert will provide:
- Status: APPROVE | CHANGES_REQUESTED | COMMENT
- Critical issues list
- Suggestions list

### Phase 3: Status Aggregation

**Aggregate Decision Rules:**

| Condition | Panel Status |
|-----------|--------------|
| Any expert returns CHANGES_REQUESTED | CHANGES_REQUESTED |
| All experts return APPROVE | APPROVE |
| Mix of APPROVE and COMMENT (no CHANGES_REQUESTED) | COMMENT |

**Issue Categorization (enhanced after #483):**
- **Blocking:** Issues that prevent merge (CHANGES_REQUESTED triggers)
  - Security vulnerabilities (always blocking)
  - Breaking API contracts
  - Missing required tests
  - RLS policy gaps
- **Important:** Issues worth addressing but not blocking
  - Performance concerns
  - Minor architectural deviations
  - Documentation gaps
- **Suggestions:** Nice-to-have improvements
  - Code style preferences
  - Additional test coverage
  - Refactoring opportunities

**Deduplication Rules (added after #490):**
- Identical findings from multiple experts: Report once, note consensus
- Similar findings: Combine into single issue with contributing domains
- Conflicting findings: Present both perspectives with expert attribution

### Phase 4: Unified Output

**CRITICAL: Single Output Constraint**

The Review Panel produces ONE consolidated review, NOT separate reviews per expert. The output format below is the complete deliverable.

## Output Format

### Review Panel Decision

**Overall Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Context:**
[Brief summary of REVIEW_CONTEXT]

**Expert Status Summary:**
| Expert | Status | Critical Issues |
|--------|--------|-----------------|
| Architecture | [status] | [count] |
| Testing | [status] | [count] |
| Security | [status] | [count] |
| Integration | [status] | [count] |
| UX | [status] | [count] |
| CC Hook | [status] | [count] |
| Claude Config | [status] | [count] |

**Blocking Issues (must fix before merge):**
1. [Issue from expert] - [Domain]
2. [Issue from expert] - [Domain]

**Important Issues (should address):**
1. [Issue from expert] - [Domain]
2. [Issue from expert] - [Domain]

**Suggestions (optional improvements):**
1. [Suggestion from expert] - [Domain]
2. [Suggestion from expert] - [Domain]

**Cross-Domain Findings:**
- [Issues identified by multiple experts]

**Positive Observations:**
- [Good patterns noted by experts]

**Recommended Actions:**
1. [Action to resolve blocking issues]
2. [Action to address important issues]

**Review Summary:**
[1-2 sentence summary of review outcome and key actions needed]

## Anti-Patterns to Avoid (added after #490)

- **Invoking experts sequentially**: Always invoke all 7 experts in parallel for efficiency
- **Ignoring partial failures**: If 1-2 experts fail, aggregate results from successful ones
- **Creating multiple output files**: Review Panel produces ONE consolidated review
- **Duplicate findings**: Deduplicate similar issues, note expert consensus
- **Missing cross-domain findings**: Issues found by multiple experts indicate higher importance
- **Over-blocking**: Only use CHANGES_REQUESTED for genuine blockers (security, breaking changes)

## Integration Points (added after #490)

**With orchestrator.md:**
- Review Panel is invoked during the `review` phase of the orchestrator workflow
- Review output determines `docs/reviews/{spec-name}-review.md` content
- Panel status drives subsequent validate phase scope

**With bulk-update.md:**
- Review Panel patterns improve through `improve_orchestrators` command
- Cross-cutting findings inform expert knowledge base updates
