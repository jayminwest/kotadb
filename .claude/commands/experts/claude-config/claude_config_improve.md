---
description: Analyze changes and update Claude Config expert knowledge
---

# Claude Config Expert - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Workflow

### 1. Analyze Recent Changes

```bash
git log --oneline -30 --all -- "CLAUDE.md" ".claude/settings*.json" ".claude/commands/**"
```

Review recent commits affecting Claude Code configuration and documentation.

### 2. Extract Learnings

**Identify Successful Patterns:**
- Review merged PRs for new configuration patterns
- Note CLAUDE.md organizational improvements
- Document command structure decisions that worked well

**Pattern Categories to Track:**
- CLAUDE.md section organization
- Command frontmatter patterns
- settings.json configuration patterns
- MCP server configuration
- Conditional documentation routing

### 3. Update Expertise Sections

Edit the following files to incorporate learnings:
- `claude_config_plan.md` → Update "Claude Configuration Knowledge Areas"
- `claude_config_review.md` → Update "Review Focus Areas"

**Rules for Updates:**
- **PRESERVE** existing patterns unless confirmed obsolete
- **APPEND** new learnings with evidence from commit history
- **DATE** new entries with commit reference (e.g., "Added after #123")
- **REMOVE** only patterns contradicted by multiple recent implementations

### 4. Document Anti-Patterns

**Sources for Anti-Patterns:**
- PRs with requested changes for configuration issues
- Documentation that confused users
- Configuration errors that caused runtime failures

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
3. Verify configuration examples are valid

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
