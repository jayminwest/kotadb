# /release

**Template Category**: Action

Create a production release by merging `develop` → `main` with automated versioning, validation, and GitHub release creation.

## Pre-Release Validation

Before creating a release, the command performs comprehensive checks:

1. **Clean Working Tree**: Ensure no uncommitted changes (`git status --short` must be empty)
2. **CI Status**: Verify all GitHub Actions are passing on `develop` branch
3. **Migration Sync**: Run `bun run test:validate-migrations` to check drift
4. **Type Checking**: Execute `bunx tsc --noEmit` for type safety
5. **SQLite Schema Validation**: Verify database schema is correct
6. **Health Checks**: Verify API endpoints are responding correctly

## Version Bumping

Prompt user for version bump type:
- **major**: Breaking changes (1.0.0 → 2.0.0)
- **minor**: New features, backward compatible (1.0.0 → 1.1.0)
- **patch**: Bug fixes, backward compatible (1.0.0 → 1.0.1)

Updates:
- `app/package.json` version field
- Creates version bump commit: `chore: bump version to X.Y.Z`

## Release Process

### Step 1: Prepare Release Branch
```bash
git checkout develop
git pull --rebase origin develop
git checkout -b release/vX.Y.Z
```

### Step 2: Update Version
```bash
cd app
# Update package.json version
bun run version <major|minor|patch>
# Commit version change
git add package.json
git commit -m "chore: bump version to X.Y.Z"
```

### Step 3: Generate Changelog
Extract commits from `develop` since last release:
```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges
```

Group by type:
- **Features**: commits starting with `feat:`
- **Bug Fixes**: commits starting with `fix:`
- **Chore**: commits starting with `chore:`
- **Documentation**: commits starting with `docs:`
- **Performance**: commits starting with `perf:`
- **Refactor**: commits starting with `refactor:`

Format as markdown for release notes.

### Step 4: Create Release PR
```bash
git push -u origin release/vX.Y.Z
gh pr create \
  --base main \
  --head release/vX.Y.Z \
  --title "Release vX.Y.Z" \
  --body "$(cat <<'EOF'
## Release vX.Y.Z

### Summary
Brief description of release highlights

### Changelog
<Generated changelog from commits>

### Pre-Release Checklist
- [x] All CI checks passing on develop
- [x] Clean working tree verified
- [x] Migration sync validated
- [x] Type checking passed
- [x] SQLite schema validated
- [x] Health checks passed locally

### Deployment Plan
1. Merge this PR to main
2. Create GitHub release for distribution
3. Monitor logs for errors
4. Verify local health checks pass

### Rollback Plan
If issues arise:
1. Revert merge commit on main
2. Redeploy previous version
3. Create hotfix branch from main for urgent fixes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 5: Post-Merge Actions
After PR is merged to `main`:

1. **Create Git Tag**:
```bash
git checkout main
git pull origin main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

2. **Create GitHub Release**:
```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "<Changelog from PR>" \
  --verify-tag
```

3. **Sync develop with main**:
```bash
git checkout develop
git merge main --no-ff -m "chore: sync develop with main after vX.Y.Z release"
git push origin develop
```

## Pre-Release Validation Details

### CI Status Check
```bash
gh pr checks <PR_NUMBER> --watch
# Ensure all checks pass before proceeding
```

### Migration Sync Validation
```bash
cd app
bun run test:validate-migrations
# Must exit 0 with no diff reported
```

### SQLite Schema Validation
```bash
cd app
# Verify SQLite database schema is up to date
bun run db:check-schema
# Must exit 0 with schema validated
```

### Health Check Verification
```bash
# Local API health check
curl -f http://localhost:3000/health || exit 1
```

## Versioning Strategy

KotaDB follows **Semantic Versioning** (semver.org):

- **MAJOR**: Incompatible API changes (breaking changes)
  - Database schema changes requiring migrations
  - Removing or renaming public API endpoints
  - Changing authentication mechanisms

- **MINOR**: Backward-compatible functionality additions
  - New API endpoints
  - New optional parameters
  - Performance improvements

- **PATCH**: Backward-compatible bug fixes
  - Security patches
  - Bug fixes with no API changes
  - Documentation updates

## Emergency Hotfix Process

For critical issues requiring immediate fix:

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/vX.Y.Z+1

# Make minimal fix
# ... edit files ...
git add <files>
git commit -m "fix: critical issue description"

# Bump patch version
cd app
bun run version patch
git add package.json
git commit -m "chore: bump version to X.Y.Z+1"

# Push and create PR to main
git push -u origin hotfix/vX.Y.Z+1
gh pr create --base main --head hotfix/vX.Y.Z+1 --title "Hotfix vX.Y.Z+1: <issue>"

# After merge to main:
# 1. Tag release
# 2. Merge main back into develop
git checkout develop
git merge main --no-ff -m "chore: sync develop with hotfix vX.Y.Z+1"
git push origin develop
```

## Release Checklist Template

Copy this checklist when creating release PR:

```markdown
## Pre-Release Validation
- [ ] All CI checks passing on develop
- [ ] Clean working tree (no uncommitted changes)
- [ ] Migration sync validated (`bun run test:validate-migrations`)
- [ ] Type checking passed (`bunx tsc --noEmit`)
- [ ] SQLite schema validated
- [ ] Health checks passed locally API
- [ ] Local health checks passed
- [ ] Version bumped in package.json
- [ ] Changelog generated and reviewed

## Post-Merge Actions
- [ ] Git tag created (vX.Y.Z)
- [ ] GitHub release published
- [ ] develop synced with main
- [ ] Release verified
- [ ] Log monitoring checked (no new errors)
- [ ] API health checks passing post-deployment
```

## Automation Scripts

Consider creating helper scripts in `app/scripts/`:

**release-prepare.sh**:
```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION_TYPE="${1:-}"
if [[ ! "$VERSION_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: $0 <major|minor|patch>"
  exit 1
fi

# Validation checks
echo "Running pre-release validation..."
cd "$(dirname "$0")/.."

echo "✓ Checking working tree..."
if [[ -n $(git status --short) ]]; then
  echo "✗ Working tree not clean"
  exit 1
fi

echo "✓ Validating migrations..."
bun run test:validate-migrations || exit 1

echo "✓ Type checking..."
bunx tsc --noEmit || exit 1

echo "✓ All validation checks passed"

# Version bump
echo "Bumping version ($VERSION_TYPE)..."
bun run version "$VERSION_TYPE"

NEXT_VERSION=$(jq -r .version package.json)
echo "Next version: $NEXT_VERSION"

# Create release branch
git checkout -b "release/v$NEXT_VERSION"
git add package.json
git commit -m "chore: bump version to $NEXT_VERSION"

echo "Release branch created: release/v$NEXT_VERSION"
echo "Next: git push -u origin release/v$NEXT_VERSION"
```

**release-finalize.sh**:
```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> (e.g., 1.2.3)"
  exit 1
fi

# Tag and push
git checkout main
git pull origin main
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"

# Sync develop
git checkout develop
git merge main --no-ff -m "chore: sync develop with main after v$VERSION release"
git push origin develop

echo "✓ Release v$VERSION finalized"
echo "✓ Tag pushed: v$VERSION"
echo "✓ develop synced with main"
```

## Rollback Procedure

If a release introduces critical issues:

```bash
# 1. Identify merge commit on main
git checkout main
git log --oneline -n 5

# 2. Revert the merge
git revert -m 1 <merge-commit-sha>
git push origin main

# 3. Deploy previous version
# (Tag release on main branch)

# 4. Create post-mortem issue
gh issue create --title "Post-mortem: v$VERSION rollback" \
  --body "Document what went wrong and prevention steps"

# 5. Fix on develop and prepare new release
git checkout develop
# ... apply fixes ...
# ... follow normal release process ...
```

## Related Documentation

- [Branching Strategy](../../CLAUDE.md#branching-strategy) - Git flow overview
- [Local Development](../../docs/development.md) - Local development setup
- [CI Configuration](../ci/ci-configuration.md) - GitHub Actions workflows
- [Testing Guide](../testing/testing-guide.md) - Validation tests

## Notes

- **Never force-push** to `main` or `develop`
- **Always require PR approval** for releases
- **Monitor logs** for 24h post-release
- **Document breaking changes** prominently in release notes
- **Coordinate with team** before major releases
