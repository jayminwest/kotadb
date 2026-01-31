# Security Vulnerability Scanning Guide

## Overview

KotaDB uses a multi-layered approach to dependency security:

1. **Dependabot**: Automated dependency updates with vulnerability alerts
2. **CI Security Scanning**: Runtime vulnerability detection in all PRs
3. **Manual Audits**: Periodic security reviews

## Dependabot Configuration

### Monitored Ecosystems

| Ecosystem | Directory | Schedule | PR Limit |
|-----------|-----------|----------|----------|
| npm (Bun) | `/app` | Weekly (Monday 9am PT) | 10 |
| pip (uv) | `/automation` | Weekly (Monday 9am PT) | 10 |
| github-actions | `/` | Weekly (Monday 9am PT) | 5 |

### Dependabot PR Workflow

1. **Automated PRs**: Dependabot creates PRs with version updates
2. **CI Validation**: All CI checks must pass (including security scans)
3. **Review**: Engineering team reviews changes
4. **Merge**: Approve and merge if all checks pass

### Labels

- `dependencies`: All Dependabot PRs
- `security`: Security-related updates
- `ci`: GitHub Actions updates

## CI Security Scanning

### App CI (npm audit)

**Severity Threshold**: High and Critical
**Failure Behavior**: CI fails if high/critical vulnerabilities found
**Artifacts**: JSON audit results uploaded (30-day retention)

**Viewing Results**:
1. Check GitHub Step Summary for vulnerability counts
2. Download `app-security-audit` artifact for detailed JSON report
3. Review npm advisory links in audit output

### Automation CI (pip-audit)

**Severity Threshold**: Any vulnerability with available fix
**Failure Behavior**: CI fails if vulnerabilities found
**Artifacts**: JSON audit results uploaded (30-day retention)

**Viewing Results**:
1. Check GitHub Step Summary for affected packages
2. Download `automation-security-audit` artifact for detailed JSON report
3. Review CVE links in pip-audit output

## Vulnerability Response Process

### Step 1: Identification

Vulnerabilities are identified through:
- Dependabot security alerts
- CI security scan failures
- Manual security audits

### Step 2: Assessment

1. **Review Severity**: Critical > High > Moderate > Low
2. **Check Exploitability**: Is the vulnerable code path used?
3. **Evaluate Impact**: What data/systems are at risk?
4. **Verify Fix Availability**: Is a patched version available?

### Step 3: Remediation

**Priority Levels**:

| Severity | Response Time | Action |
|----------|---------------|--------|
| Critical | Immediate | Emergency patch release |
| High | 24-48 hours | Hotfix PR |
| Moderate | 1 week | Include in next release |
| Low | 30 days | Routine update |

**Remediation Options**:
1. **Update Dependency**: Preferred - use latest patched version
2. **Workaround**: Disable vulnerable feature if not used
3. **Accept Risk**: Document decision if fix unavailable (rare)

### Step 4: Verification

1. Run CI security scans locally:
   ```bash
   # App (Bun/npm)
   cd app && npm audit --audit-level=high

   # Automation (Python)
   cd automation && uv run pip-audit
   ```

2. Verify fix resolves vulnerability
3. Ensure all tests pass
4. Confirm no new vulnerabilities introduced

### Step 5: Documentation

1. Update CHANGELOG.md with security fix
2. Create GitHub Security Advisory if public disclosure needed
3. Notify stakeholders if user action required

## Troubleshooting

### False Positives

**Problem**: Audit reports vulnerability in unused code path

**Solution**:
1. Verify code path is not used (grep/code search)
2. Add audit exception with justification:
   ```bash
   # npm
   npm audit --audit-level=high --omit=dev

   # pip
   uv run pip-audit --ignore-vuln VULN-ID-HERE
   ```
3. Document exception in PR description

### Audit Failures

**Problem**: CI security scan fails due to infrastructure issue

**Solution**:
1. Check GitHub Actions status page
2. Retry workflow
3. If persistent, manually run audit and attach results to PR

### Conflicting Dependencies

**Problem**: Security update breaks compatibility

**Solution**:
1. Check breaking changes in dependency changelog
2. Update consuming code to match new API
3. Consider major version update if extensive changes needed
4. Test thoroughly before merging

## Best Practices

1. **Review Dependabot PRs promptly** - Don't let security updates sit
2. **Test security updates** - Automated PRs can introduce breaking changes
3. **Monitor audit artifacts** - Download and review JSON reports periodically
4. **Keep lockfiles committed** - Ensures reproducible builds
5. **Update uv.lock after manual changes** - Run `cd automation && uv lock` after editing pyproject.toml

## References

- [npm audit documentation](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [pip-audit documentation](https://pypi.org/project/pip-audit/)
- [Dependabot documentation](https://docs.github.com/en/code-security/dependabot)
- [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories)
