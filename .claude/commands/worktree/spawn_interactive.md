# /spawn_interactive

Create an isolated git worktree in `automation/trees/` for interactive development with ADW-like isolation patterns.

## Purpose

This command creates a new git worktree specifically designed for interactive Claude Code sessions that need isolation from the main working directory. The worktree follows the same patterns used by the AI Developer Workflow (ADW) system to prevent conflicts during concurrent development.

## Inputs

- `$1` (task_description): Description of the task or feature being worked on
- `$2` (issue_number): Optional GitHub issue number (e.g., "123" or "#123")
- `$3` (base_branch): Optional base branch to branch from (default: current branch)

## Workflow

### 1. Generate Worktree Name

First, create a descriptive worktree name from the task description and optional issue number:

```bash
# Extract key concepts, convert to kebab-case, limit to 60 chars
# Format (with issue): interactive-{issue_number}-{description-slug}
# Format (without issue): interactive-{description-slug}
# Example: "Add rate limiting", issue #123 → "interactive-123-add-rate-limiting"
# Example: "Add rate limiting", no issue → "interactive-add-rate-limiting"
```

**Naming Rules:**
- Prefix with `interactive-` to distinguish from ADW worktrees
- Include issue number after prefix if provided (strip '#' prefix)
- Lowercase with hyphens (kebab-case)
- Remove special characters (keep alphanumeric and hyphens only)
- Collapse multiple hyphens into single hyphen
- Maximum 60 characters total
- No leading/trailing hyphens

### 2. Verify Pre-conditions

Before creating the worktree:

1. Check current git status
2. Verify worktree doesn't already exist
3. Confirm base branch exists (or use current branch)

```bash
# List existing worktrees
git worktree list

# Check if base branch exists
git rev-parse --verify {base_branch}
```

### 3. Create Worktree

Create the worktree in `automation/trees/` directory:

```bash
# Create worktree with new branch
git worktree add automation/trees/{worktree_name} -b {worktree_name} {base_branch}

# Verify creation
git worktree list | grep {worktree_name}
```

**Key Patterns (matching ADW behavior):**
- Location: `automation/trees/{worktree_name}` (same directory as ADW worktrees)
- Branch: Creates new branch with same name as worktree
- Base: Branches from specified base (or current branch)
- Isolation: Completely independent working directory

### 4. Setup Worktree Environment

After creation, set up the worktree for interactive work:

1. **Verify directory structure:**
   ```bash
   ls -la automation/trees/{worktree_name}
   ```

2. **Check application files are accessible:**
   ```bash
   ls -la automation/trees/{worktree_name}/app/
   ```

3. **Display worktree info:**
   ```bash
   cd automation/trees/{worktree_name}
   git status
   git branch --show-current
   ```

### 5. Provide Navigation Instructions

After successful creation, provide the user with:

1. **Absolute path** to the worktree
2. **Navigation command** to change directory
3. **Cleanup command** for when done
4. **Branch information** for reference

## Example Output

### With Issue Number

```
✓ Created interactive worktree: interactive-123-add-rate-limiting

Location: /Users/username/Projects/kota-db-ts/automation/trees/interactive-123-add-rate-limiting
Branch: interactive-123-add-rate-limiting (based on develop)
Issue: #123

To start working in the isolated environment:
  cd automation/trees/interactive-123-add-rate-limiting

The application code is available at:
  automation/trees/interactive-123-add-rate-limiting/app/

When finished, clean up the worktree:
  git worktree remove automation/trees/interactive-123-add-rate-limiting --force
  git branch -D interactive-123-add-rate-limiting
```

### Without Issue Number

```
✓ Created interactive worktree: interactive-add-rate-limiting

Location: /Users/username/Projects/kota-db-ts/automation/trees/interactive-add-rate-limiting
Branch: interactive-add-rate-limiting (based on develop)

To start working in the isolated environment:
  cd automation/trees/interactive-add-rate-limiting

The application code is available at:
  automation/trees/interactive-add-rate-limiting/app/

When finished, clean up the worktree:
  git worktree remove automation/trees/interactive-add-rate-limiting --force
  git branch -D interactive-add-rate-limiting
```

## Error Handling

### Worktree Already Exists

```
Error: Worktree 'interactive-123-add-rate-limiting' already exists at:
  automation/trees/interactive-123-add-rate-limiting

To use the existing worktree:
  cd automation/trees/interactive-123-add-rate-limiting

To remove and recreate:
  git worktree remove automation/trees/interactive-123-add-rate-limiting --force
  git branch -D interactive-123-add-rate-limiting
```

### Branch Name Conflict

```
Error: Branch 'interactive-123-add-rate-limiting' already exists

Options:
1. Use a different task description to generate a unique name
2. Delete the existing branch:
   git branch -D interactive-123-add-rate-limiting
3. Checkout the existing branch in a worktree:
   git worktree add automation/trees/interactive-123-add-rate-limiting interactive-123-add-rate-limiting
```

### Base Branch Not Found

```
Error: Base branch '{base_branch}' does not exist

Available branches:
  git branch -a
```

## Isolation Benefits

The worktree provides complete isolation:

1. **Independent working directory**: Changes don't affect main directory
2. **Separate git HEAD**: Can be on different branch simultaneously
3. **No merge conflicts**: Work on multiple features concurrently
4. **ADW compatibility**: Can run ADW automation while working interactively
5. **Clean state**: Fresh checkout without stashing current work

## Use Cases

- **Feature development**: Isolate experimental feature work
- **Bug fixes**: Create isolated environment for debugging
- **Testing changes**: Verify changes without affecting main directory
- **Concurrent work**: Work on multiple issues simultaneously
- **ADW interaction**: Inspect ADW-generated code without switching branches

## Cleanup

When finished with the worktree:

```bash
# From any directory
git worktree remove automation/trees/{worktree_name} --force

# Delete the branch (optional)
git branch -D {worktree_name}

# Prune stale worktree metadata
git worktree prune
```

**Note:** The `--force` flag removes the worktree even with uncommitted changes. Commit or stash important work before cleanup.

## CI Trigger Behavior

GitHub Actions CI workflows are configured to run automatically on all feature branch pushes, including interactive worktree branches. This ensures CI validation happens regardless of when you create a PR.

### Supported Branch Patterns

All CI workflows trigger on pushes to these branch patterns:
- `feat/**` - Feature branches
- `bug/**` - Bug fix branches
- `chore/**` - Chore branches
- `fix/**` - Alternative fix branch naming
- `refactor/**` - Refactoring branches
- `interactive-*` - Interactive worktree branches

### When CI Runs

**Push-Before-PR Workflow (Default):**
1. Create worktree with `/spawn_interactive`
2. Make changes and commit
3. Push branch: `git push -u origin {worktree_name}`
4. CI runs automatically on push (before PR creation)
5. Create PR: `gh pr create --title "..." --body "..."`
6. PR shows CI status from step 4
7. Subsequent pushes trigger new CI runs via `pull_request` synchronize event

**PR-Before-Push Workflow (Alternative):**
1. Create worktree with `/spawn_interactive`
2. Create empty PR: `gh pr create --title "..." --body "..."`
3. Make changes and commit
4. Push branch: `git push -u origin {worktree_name}`
5. CI runs on push via `pull_request` synchronize event

### Best Practices

**Ensuring CI Validation:**
- CI runs automatically on first push to any feature branch
- No manual workflow triggering required
- PRs show CI status from most recent push
- Check CI results with: `gh pr checks <pr-number>`

**Monitoring CI Status:**
```bash
# After pushing branch
gh run list --branch {worktree_name} --limit 5

# For specific PR
gh pr checks <pr-number>

# View detailed workflow run
gh run view <run-id>
```

**Troubleshooting:**
- If CI doesn't trigger, verify branch name matches supported patterns
- Check path filters: CI only runs when relevant files changed
- View workflow configuration: `gh workflow view "Application CI"`
- Fork PRs may have delayed CI due to GitHub security restrictions

### Path Filters

CI workflows use path filters to limit runs to relevant changes:
- **Application CI**: `app/**`, `shared/**`, `.github/workflows/app-ci.yml`
- **Automation CI**: `automation/**`, `.github/workflows/automation-ci.yml`
- **Web CI**: `web/**`, `shared/**`, `.github/workflows/web-ci.yml`

Only the workflows matching your changed files will run, reducing unnecessary CI consumption.

## Integration with ADW

This command mirrors ADW patterns from `automation/adws/adw_modules/git_ops.py`:

- Same base directory (`automation/trees/`)
- Same naming convention (kebab-case branch names)
- Same isolation guarantees (independent working directory)
- Compatible with ADW cleanup scripts
- Issue number integration (when provided)

**Naming Comparison:**
- Interactive worktree (with issue): `interactive-{issue_number}-{description-slug}`
- Interactive worktree (no issue): `interactive-{description-slug}`
- ADW worktree: `{type}-{issue}-{adw_id}` (e.g., `feat-123-abc12345-add-rate-limiting`)

The `interactive-` prefix distinguishes user-created worktrees from ADW-managed worktrees. Including the issue number helps correlate interactive development work with GitHub issues while maintaining clear separation from automated ADW workflows.

## Advanced Usage

### Custom Base Path

To create worktree in a different location:

```bash
# Create in custom directory
git worktree add custom/path/{worktree_name} -b {worktree_name} {base_branch}
```

### Reuse Existing Branch

To checkout an existing branch in a worktree:

```bash
# No -b flag (don't create new branch)
git worktree add automation/trees/{worktree_name} {existing_branch}
```

### Multiple Worktrees

You can create multiple worktrees for different tasks:

```bash
git worktree list
# Shows all active worktrees with their branches and locations
```
