---
description: Analyze changes and update CC Hook expert knowledge
---

# CC Hook Expert - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Workflow

### 1. Analyze Recent Changes

```bash
git log --oneline -30 --all -- ".claude/hooks/**" ".claude/settings.json" ".claude/settings*.json"
```

Review recent commits affecting Claude Code hooks and configuration.

### 2. Extract Learnings

**Identify Successful Patterns:**
- Review merged PRs for new hook implementations
- Note configuration patterns that worked well
- Document error handling improvements

**Pattern Categories to Track:**
- Hook trigger patterns
- Timeout configurations
- Error recovery strategies
- JSON I/O patterns
- Matcher syntax patterns

### 3. Update Expertise Sections

Edit the following files to incorporate learnings:
- `cc_hook_expert_plan.md` → Update "Claude Code Hook Knowledge Areas"
- `cc_hook_expert_review.md` → Update "Review Focus Areas"
- `.claude/agents/leaf/expert-cc-hook.md` → Update leaf agent knowledge base

**Rules for Updates:**
- **PRESERVE** existing patterns unless confirmed obsolete
- **APPEND** new learnings with evidence from commit history
- **DATE** new entries with commit reference (e.g., "Added after #123")
- **REMOVE** only patterns contradicted by multiple recent implementations

**Synchronization Requirements:**
- Any improvements to CC Hook knowledge MUST be reflected in BOTH:
  1. The original expertise files (`cc_hook_expert_plan.md` and `cc_hook_expert_review.md`)
  2. The leaf agent knowledge base (`.claude/agents/leaf/expert-cc-hook.md`)
- The leaf agent file is used when experts are spawned via MCP, so it must contain the most current knowledge

### 4. Document Anti-Patterns

**Sources for Anti-Patterns:**
- PRs with requested changes for hook issues
- CI failures related to hook timeouts
- Runtime errors from hook execution

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
3. Verify hook examples still function correctly
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
- [Confirmation that `.claude/agents/leaf/expert-cc-hook.md` was updated]
