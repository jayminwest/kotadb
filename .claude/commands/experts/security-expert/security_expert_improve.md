---
description: Analyze changes and update security expert knowledge
---

# Security Expert - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Workflow

### 1. Analyze Security-Related Changes

```bash
git log --oneline -30 --all -- "app/src/auth/**" "app/src/db/migrations/**"
```

Review recent commits affecting authentication, authorization, and database security.

### 2. Extract Learnings

**Identify Security Patterns:**
- New RLS policy patterns that worked well
- Authentication flow improvements
- Input validation patterns adopted
- Rate limiting enhancements

**Track Vulnerability Resolutions:**
- Security issues found in code review
- Vulnerabilities discovered in testing
- Production security incidents (if any)

**Document Security Utilities:**
- New validation helpers
- Security-focused middleware
- Audit logging patterns

### 3. Update Expertise Sections

Edit the following files to incorporate learnings:
- `security_expert_plan.md` → Update "RLS Patterns" and "Input Validation Patterns"
- `security_expert_review.md` → Update "Security Checklist"
- `.claude/agents/leaf/expert-security.md` → Update leaf agent knowledge base

**Rules for Updates:**
- **PRESERVE** all existing security rules - security knowledge is cumulative
- **APPEND** new patterns with evidence from commits
- **DATE** entries with commit reference (e.g., "Added after #123 security fix")
- **NEVER REMOVE** security patterns unless superseded by stronger controls

**Synchronization Requirements:**
- Any improvements to security knowledge MUST be reflected in BOTH:
  1. The original expertise files (`security_expert_plan.md` and `security_expert_review.md`)
  2. The leaf agent knowledge base (`.claude/agents/leaf/expert-security.md`)
- The leaf agent file is used when experts are spawned via MCP, so it must contain the most current knowledge
- **CRITICAL**: Security knowledge is cumulative - never weaken security rules in any file

### 4. Document Vulnerability Patterns

**Sources for Vulnerability Patterns:**
- PRs with security-related requested changes
- Security audit findings
- Dependency vulnerability reports
- Community security advisories

**Format for New Vulnerability Patterns:**
```
- [Vulnerability type] (discovered in #PR_NUMBER)
  - Attack vector: [how it could be exploited]
  - Impact: [potential damage]
  - Remediation: [how to fix]
  - Prevention: [how to avoid in future]
```

### 5. Update OWASP Mapping

After security-relevant changes:
1. Review OWASP Top 10 relevance
2. Update coverage assessment
3. Document any new attack vectors
4. Add mitigations to expertise

### 6. Validate RLS Coverage

Periodically verify:
```bash
# List tables without RLS
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT IN (SELECT tablename FROM pg_policies);
```

Document any gaps and required policies.

## Output

Return summary of changes made to Expertise sections:

**Security Patterns Added:**
- [New security pattern with source reference]

**Vulnerabilities Documented:**
- [Vulnerability pattern with remediation]

**RLS Updates:**
- [New policy patterns or coverage improvements]

**Checklist Updates:**
- [New security checklist items]

**OWASP Coverage:**
- [Updates to OWASP alignment assessment]

**Leaf Agent Sync:**
- [Confirmation that `.claude/agents/leaf/expert-security.md` was updated]
