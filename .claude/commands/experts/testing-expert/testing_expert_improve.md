---
description: Analyze changes and update testing expert knowledge
---

# Testing Expert - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Workflow

### 1. Analyze Recent Test Changes

```bash
git log --oneline -30 --all -- "app/tests/**"
```

Review recent commits affecting test infrastructure and patterns.

### 2. Extract Learnings

**Identify Successful Patterns:**
- Test helper functions that improved test clarity
- Fixture strategies that reduced test flakiness
- Cleanup patterns that prevented data leaks
- Integration patterns that caught real bugs

**Track Flaky Test Resolutions:**
- Tests that were marked flaky and how they were fixed
- Timing-dependent tests and their stabilization
- Environment-dependent failures and their solutions

**Document Test Utilities:**
- New helpers added to `app/tests/helpers/`
- Assertion patterns that improved error messages
- Setup/teardown patterns that improved isolation

### 3. Update Expertise Sections

Edit the following files to incorporate learnings:
- `testing_expert_plan.md` → Update "Test Data Strategies" and "MCP Testing Patterns"
- `testing_expert_review.md` → Update "Test Quality Criteria"
- `.claude/agents/leaf/expert-testing.md` → Update leaf agent knowledge base

**Rules for Updates:**
- **PRESERVE** antimocking philosophy - never weaken these rules
- **APPEND** new test patterns with evidence from commits
- **DATE** entries with commit reference (e.g., "Stabilized in #123")
- **REMOVE** patterns that consistently caused flakiness

**Synchronization Requirements:**
- Any improvements to testing knowledge MUST be reflected in BOTH:
  1. The original expertise files (`testing_expert_plan.md` and `testing_expert_review.md`)
  2. The leaf agent knowledge base (`.claude/agents/leaf/expert-testing.md`)
- The leaf agent file is used when experts are spawned via MCP, so it must contain the most current knowledge
- **CRITICAL**: Ensure antimocking philosophy is consistently enforced in all files

### 4. Document Anti-Patterns

**Sources for Test Anti-Patterns:**
- PRs with test failures that required fixes
- Flaky tests identified in CI
- Tests removed or rewritten due to maintenance burden

**Format for New Anti-Patterns:**
```
- [Anti-pattern description] (discovered in #PR_NUMBER)
  - Why it failed: [explanation]
  - Better alternative: [recommendation]
```

### 5. Review Antimocking Compliance

After each improvement cycle:
1. Verify no mock patterns crept into expertise
2. Confirm real-service patterns still emphasized
3. Update checklist if new mock patterns discovered
4. Ensure antimocking principles are consistent across all files

## Output

Return summary of changes made to Expertise sections:

**Patterns Added:**
- [New test pattern with source reference]

**Flaky Tests Resolved:**
- [Test stabilization with technique used]

**Test Utilities Added:**
- [New helper functions documented]

**Anti-Patterns Documented:**
- [New anti-pattern with evidence]

**Antimocking Reinforcement:**
- [Any updates to antimocking checklist]

**Leaf Agent Sync:**
- [Confirmation that `.claude/agents/leaf/expert-testing.md` was updated]
