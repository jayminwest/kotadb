---
description: Analyze changes and update orchestrator knowledge
---

# Orchestrators - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Purpose

Self-improvement mechanism for the Planning Council and Review Panel orchestrators. Analyzes git history to extract patterns from orchestrator usage and updates the orchestrator files with improved synthesis and coordination patterns.

## Workflow

### 1. Analyze Recent Changes

```bash
git log --oneline -30 --all -- ".claude/commands/experts/orchestrators/**"
```

Review recent commits affecting orchestrator implementations.

### 2. Extract Learnings

**Identify Successful Patterns:**
- Review merged PRs where orchestrators produced useful outputs
- Note coordination patterns that worked well
- Document synthesis improvements

**Pattern Categories to Track:**
- Expert invocation patterns
- Response aggregation strategies
- Conflict resolution approaches
- Status determination rules
- Cross-cutting concern identification

### 3. Update Orchestrator Files

Edit the following files to incorporate learnings:
- `planning_council.md` → Update synthesis workflow, conflict resolution
- `review_panel.md` → Update aggregation rules, status determination

**Rules for Updates:**
- **PRESERVE** existing workflow structure
- **APPEND** new patterns with evidence from usage
- **DATE** new entries with commit reference (e.g., "Added after #123")
- **REMOVE** only patterns that caused coordination failures

### 4. Document Anti-Patterns

**Sources for Anti-Patterns:**
- Orchestrator outputs that required manual correction
- Conflicting expert recommendations that weren't resolved
- Missing cross-cutting concerns that should have been identified

**Format for New Anti-Patterns:**
```
- [Anti-pattern description] (discovered in #PR_NUMBER)
  - Why it failed: [explanation]
  - Better alternative: [recommendation]
```

### 5. Validate Updates

After updating orchestrator files:
1. Review changes for consistency with expert patterns
2. Ensure workflow phases are still coherent
3. Verify output format requirements are maintained

## Output

Return summary of changes made to Orchestrator files:

**Patterns Added:**
- [New coordination pattern with source reference]

**Patterns Updated:**
- [Existing pattern refined, reason for update]

**Anti-Patterns Documented:**
- [New anti-pattern with evidence]

**Patterns Removed:**
- [Obsolete pattern, reason for removal]

## Orchestrator-Specific Updates

### Planning Council Improvements

**Synthesis Patterns:**
- How to identify cross-cutting concerns across expert domains
- Priority ranking algorithms for recommendations
- Conflict resolution when experts disagree

**Integration Points:**
- Which experts to invoke for different planning contexts
- How to handle partial expert failures
- Timeout handling for parallel invocations

### Review Panel Improvements

**Aggregation Rules:**
- Status determination from multiple expert statuses
- Issue categorization (blocking vs. important vs. suggestions)
- Deduplication of similar findings across experts

**Output Quality:**
- Concise summary generation
- Actionable recommendation formatting
- Cross-domain finding synthesis
