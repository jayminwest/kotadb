---
description: Coordinate multiple experts for comprehensive planning analysis
argument-hint: <issue-context>
---

# Planning Council

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

PLANNING_CONTEXT: $ARGUMENTS

## Purpose

Coordinate Architecture, Testing, Security, Integration, UX, CC Hook, and Claude Config experts to provide comprehensive planning analysis. Synthesizes multiple perspectives into a single unified plan contribution.

## Workflow

### Phase 1: Expert Invocation

Invoke all domain experts in parallel using the SlashCommand tool:

```
/experts:architecture-expert:architecture_expert_plan <PLANNING_CONTEXT>
/experts:testing-expert:testing_expert_plan <PLANNING_CONTEXT>
/experts:security-expert:security_expert_plan <PLANNING_CONTEXT>
/experts:integration-expert:integration_expert_plan <PLANNING_CONTEXT>
/experts:ux-expert:ux_expert_plan <PLANNING_CONTEXT>
/experts:cc_hook_expert:cc_hook_expert_plan <PLANNING_CONTEXT>
/experts:claude-config:claude_config_plan <PLANNING_CONTEXT>
```

**Expert Invocation Strategy (added after #490):**
- Invoke ALL 7 experts in a single message for true parallelism
- Use Task tool with `subagent_type: general-purpose` and `model: haiku` for cost efficiency
- Handle partial failures gracefully - one expert failure shouldn't block others

### Phase 2: Response Collection

Wait for all expert responses. Each expert will provide:
- Domain-specific analysis
- Recommendations with rationale
- Risks with severity ratings

### Phase 3: Synthesis

Analyze all expert outputs to identify:

**Cross-Cutting Concerns:**
- Issues flagged by multiple experts
- Conflicting recommendations requiring resolution
- Dependencies between expert recommendations

**Priority Ranking:**
1. Issues flagged as CRITICAL/HIGH by any expert
2. Issues flagged by multiple experts (consensus)
3. Domain-specific issues with clear rationale

**Conflict Resolution (enhanced after #483):**
- When experts disagree, document both perspectives with supporting evidence
- Recommend based on risk severity (CRITICAL > HIGH > MEDIUM > LOW)
- Note trade-offs for human decision with specific questions
- Architecture + Security conflicts: Security usually takes precedence
- Testing + Integration conflicts: Favor test isolation over integration complexity
- UX + Architecture conflicts: Consider user-facing impact first

### Phase 4: Unified Output

**CRITICAL: Single Output Constraint**

The Planning Council produces ONE synthesized analysis, NOT separate reports per expert. The output format below is the complete deliverable.

## Output Format

### Planning Council Analysis

**Context:**
[Brief summary of PLANNING_CONTEXT]

**Expert Consensus:**
- [Items agreed upon by multiple experts]

**Architecture Considerations:**
- [Key architectural points]

**Testing Requirements:**
- [Test scope and approach]

**Security Requirements:**
- [Security controls needed]

**Integration Points:**
- [External system considerations]

**UX Considerations:**
- [CLI output and user experience factors]

**Hook/Automation Impacts:**
- [Pre-commit, automation, or Claude Code hook implications]

**Configuration Changes:**
- [CLAUDE.md, settings.json, or MCP configuration needs]

**Cross-Cutting Concerns:**
- [Issues spanning multiple domains]

**Priority Recommendations:**
1. [CRITICAL/HIGH: recommendation]
2. [HIGH: recommendation]
3. [MEDIUM: recommendation]

**Risks Summary:**
| Risk | Severity | Domain | Mitigation |
|------|----------|--------|------------|
| [risk] | CRITICAL/HIGH/MEDIUM/LOW | [domain] | [mitigation] |

**Open Questions:**
- [Items requiring human decision due to expert disagreement]

**Implementation Notes:**
- [Practical guidance for implementation]

## Anti-Patterns to Avoid (added after #490)

- **Invoking experts sequentially**: Always invoke all 7 experts in parallel for efficiency
- **Ignoring partial failures**: If 1-2 experts fail, synthesize from successful ones
- **Creating multiple output files**: Planning Council produces ONE synthesized analysis
- **Omitting expert sources**: Always attribute recommendations to specific expert domains
- **Skipping cross-cutting analysis**: Cross-domain concerns are the primary value-add
