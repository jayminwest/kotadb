# Logging Standards

Standardized output mechanisms for TypeScript and Python layers to enable structured logging, programmatic parsing, and uniform observability.

## Overview

KotaDB enforces consistent logging patterns across all layers:

- **TypeScript/Application Layer** (`app/src/`): Use `process.stdout.write()` and `process.stderr.write()`
- **Python/Automation Layer** (`automation/adws/`): Use `sys.stdout.write()` and `sys.stderr.write()`

**NEVER use `console.log()` in TypeScript or `print()` in Python** (except standalone scripts).

## TypeScript Logging Standards

### Approved Methods

✅ **Use**: `process.stdout.write()` for informational output
✅ **Use**: `process.stderr.write()` for errors and warnings

❌ **Never use**: `console.log()`, `console.error()`, `console.warn()`, `console.info()`

### Examples

```typescript
// CORRECT
process.stdout.write("Indexing completed\n");
process.stderr.write("Error: Failed to connect\n");

// INCORRECT - will fail pre-commit hooks and CI
console.log("Indexing completed");
console.error("Error: Failed to connect");
```

### Rationale

Direct stream writing enables:
- Structured logging frameworks (Winston, Pino)
- Log suppression during tests
- Uniform formatting and filtering
- Better control over output buffering

## Python Logging Standards

### Approved Methods

✅ **Use**: `sys.stdout.write()` for informational output
✅ **Use**: `sys.stderr.write()` for errors and warnings

❌ **Never use**: `print()` (except in standalone scripts under `adws/scripts/`)

### Examples

```python
# CORRECT
import sys
sys.stdout.write("Indexing completed\n")
sys.stderr.write("Error: Failed to connect\n")

# INCORRECT - will fail pre-commit hooks and CI
print("Indexing completed")
print("Error: Failed to connect", file=sys.stderr)
```

### Exception: Standalone Scripts

`print()` is allowed in standalone scripts under `automation/adws/scripts/` (e.g., `analyze_logs.py`).

### Rationale

Direct stream writing enables:
- Integration with logging frameworks (structlog, loguru)
- Testability and output capture
- Consistent formatting across modules
- Better subprocess communication

## Enforcement

### Pre-commit Hooks

Pre-commit hooks validate logging standards before allowing commits:

- **TypeScript**: Biome linter blocks `console.*` usage
- **Python**: Ruff linter blocks `print()` usage

Violations will block commits. Use `git commit --no-verify` only in emergencies.

### CI Validation

CI blocks PRs with non-compliant logging patterns:

- **TypeScript**: Biome config `app/biome.json` enables `suspicious/noConsole` rule
- **Python**: Ruff config `automation/pyproject.toml` enables `T201` (flake8-print) rule

## Configuration Files

### TypeScript (Biome)

File: `app/biome.json`

Rule: `suspicious/noConsole`

### Python (Ruff)

File: `automation/pyproject.toml`

Rule: `T201` (flake8-print)

## Related Documentation

- [Pre-commit Hooks](./.claude/commands/app/pre-commit-hooks.md)
- [Testing Guide](./.claude/commands/testing/testing-guide.md)
- [CI Configuration](./.claude/commands/ci/ci-configuration.md)
