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

Coordinate Architecture, Testing, Security, and Integration experts to provide comprehensive code review. Aggregates expert findings into a single consolidated review decision.

## Workflow

### Phase 1: Expert Invocation

Invoke all domain experts in parallel using the SlashCommand tool:

```
/experts:architecture-expert:architecture_expert_review <REVIEW_CONTEXT>
/experts:testing-expert:testing_expert_review <REVIEW_CONTEXT>
/experts:security-expert:security_expert_review <REVIEW_CONTEXT>
/experts:integration-expert:integration_expert_review <REVIEW_CONTEXT>
```

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

**Issue Categorization:**
- **Blocking:** Issues that prevent merge (CHANGES_REQUESTED triggers)
- **Important:** Issues worth addressing but not blocking
- **Suggestions:** Nice-to-have improvements

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
