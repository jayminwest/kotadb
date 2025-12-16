---
description: Analyze changes and update UX expert knowledge
---

# UX Expert - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Workflow

### 1. Analyze Recent Changes

```bash
git log --oneline -30 --all -- "app/src/**" ".claude/**"
```

Review recent commits affecting user experience, CLI output, or error handling.

### 2. Extract Learnings

**Identify Successful Patterns:**
- Review merged PRs for new output formatting patterns
- Note error message improvements that worked well
- Document progress indicator implementations

**Pattern Categories to Track:**
- Output formatting conventions
- Error message structure
- Progress feedback patterns
- Accessibility improvements
- Interactive prompt patterns

### 3. Update Expertise Sections

Edit the following files to incorporate learnings:
- `ux_expert_plan.md` → Update "KotaDB UX Knowledge Areas"
- `ux_expert_review.md` → Update "Review Focus Areas"
- `.claude/agents/leaf/expert-ux.md` → Update leaf agent knowledge base

**Rules for Updates:**
- **PRESERVE** existing patterns unless confirmed obsolete
- **APPEND** new learnings with evidence from commit history
- **DATE** new entries with commit reference (e.g., "Added after #123")
- **REMOVE** only patterns contradicted by multiple recent implementations

**Synchronization Requirements:**
- Any improvements to UX knowledge MUST be reflected in BOTH:
  1. The original expertise files (`ux_expert_plan.md` and `ux_expert_review.md`)
  2. The leaf agent knowledge base (`.claude/agents/leaf/expert-ux.md`)
- The leaf agent file is used when experts are spawned via MCP, so it must contain the most current knowledge

### 4. Document Anti-Patterns

**Sources for Anti-Patterns:**
- PRs with requested changes for UX issues
- User feedback or issue reports about confusing output
- Accessibility-related bug fixes

**Format for New Anti-Patterns:**
```
- [Anti-pattern description] (discovered in #PR_NUMBER)
  - Why it failed: [explanation]
  - Better alternative: [recommendation]
```

### 5. Validate Updates

After updating expertise sections:
1. Review changes for consistency across all three files
2. Ensure no contradictions with existing patterns
3. Verify examples still represent current practices
4. Confirm leaf agent file contains all critical knowledge

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

**Leaf Agent Sync:**
- [Confirmation that `.claude/agents/leaf/expert-ux.md` was updated]
