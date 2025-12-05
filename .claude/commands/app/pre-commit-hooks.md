# Pre-commit Hooks

**Template Category**: Message-Only
**Prompt Level**: 1 (Static)

Pre-commit hooks automatically run type-check and lint on staged files to prevent TypeScript errors and lint issues from reaching CI.

## Installation

```bash
cd app && bun install                   # Automatically installs hooks via prepare script
```

Hooks are installed automatically when you run `bun install` in the `app/` directory.

## Execution

Hooks run automatically on `git commit` with the following behavior:

- **Type-check**: Runs `bunx tsc --noEmit` in changed directories
  - Triggers only if files in `app/` or `shared/` directories changed
- **Lint**: Runs `bun run lint` in `app/` directory
  - Triggers only if app files changed
- **Skip checks**: Fast commits for docs, config, etc. when no relevant files changed

## Bypass (Emergency Only)

```bash
git commit --no-verify -m "emergency: bypass hooks"    # Skip all pre-commit checks
```

**Warning**: Only bypass hooks in emergencies. CI will still catch issues, but fixing them later wastes time.

## Troubleshooting

### Hook fails with "command not found"
- **Cause**: Bun not installed globally or not in PATH
- **Fix**: Install Bun globally: `curl -fsSL https://bun.sh/install | bash`

### Hook takes too long
- **Cause**: Full project type-check on every commit
- **Note**: `lint-staged` is already configured in `app/.lintstagedrc.json` for incremental checks
- **Fix**: Ensure `.lintstagedrc.json` is being used

### Hook fails on valid code
- **Cause**: TypeScript configuration issue or transient error
- **Debug**: Run `cd app && bunx tsc --noEmit` manually to see full error output
- **Fix**: Address TypeScript errors or investigate configuration

### Disable hooks temporarily
- **Disable**: `git config core.hooksPath /dev/null`
- **Restore**: `git config core.hooksPath .husky`

**Warning**: Don't forget to restore hooks after temporary disable.

## What Hooks Validate

### Logging Standards

- **TypeScript**: Blocks `console.log()`, `console.error()`, etc.
  - Enforced via Biome rule `suspicious/noConsole` in `app/biome.json`
  - Use `process.stdout.write()` and `process.stderr.write()` instead

- **Python**: Blocks `print()` in automation modules
  - Enforced via Ruff rule `T201` in `automation/pyproject.toml`
  - Use `sys.stdout.write()` and `sys.stderr.write()` instead
  - Exception: `print()` allowed in standalone scripts under `adws/scripts/`

### TypeScript Type Safety

- Runs full type-check via `bunx tsc --noEmit`
- Catches type errors before they reach CI
- Validates `app/` and `shared/` directories

### Lint Rules

- Runs Biome linter via `bun run lint`
- Validates code style and catches common errors
- Configured in `app/biome.json`

## Related Documentation

- [Logging Standards](./.claude/commands/testing/logging-standards.md)
- [Development Commands](./.claude/commands/app/dev-commands.md)
- [CI Configuration](./.claude/commands/ci/ci-configuration.md)
