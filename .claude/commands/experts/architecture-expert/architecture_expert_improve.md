---
description: Analyze changes and update architecture expert knowledge
---

# Architecture Expert - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Workflow

### 1. Analyze Recent Changes

```bash
git log --oneline -30 --all -- "app/src/**"
```

Review recent commits affecting application architecture.

### 2. Extract Learnings

**Identify Successful Patterns:**
- Review merged PRs for new architectural patterns
- Note component boundary decisions that worked well
- Document data flow improvements

**Pattern Categories to Track:**
- Import organization patterns
- Error handling at boundaries
- Type sharing strategies
- Middleware composition patterns

### 3. Update Expertise Sections

Edit the following files to incorporate learnings:
- `architecture_expert_plan.md` → Update "KotaDB Architecture Knowledge Areas"
- `architecture_expert_review.md` → Update "Review Focus Areas"

**Rules for Updates:**
- **PRESERVE** existing patterns unless confirmed obsolete
- **APPEND** new learnings with evidence from commit history
- **DATE** new entries with commit reference (e.g., "Added after #123")
- **REMOVE** only patterns contradicted by multiple recent implementations

### 4. Document Anti-Patterns

**Sources for Anti-Patterns:**
- PRs with requested changes for architecture issues
- CI failures related to import cycles
- Runtime errors from boundary violations

**Format for New Anti-Patterns:**
```
- [Anti-pattern description] (discovered in #PR_NUMBER)
  - Why it failed: [explanation]
  - Better alternative: [recommendation]
```

### 5. Validate Updates

After updating expertise sections:
1. Review changes for consistency
2. Ensure no contradictions with existing patterns
3. Verify code examples still compile conceptually

## Output

Return summary of changes made to Expertise sections:

**Patterns Added:**
- [New pattern with source reference]

**Patterns Updated:**
- [Existing pattern refined, reason for update]

**Anti-Patterns Documented:**
- [New anti-pattern with evidence]

**Patterns Removed:**
- [Obsolete pattern, reason for removal]
