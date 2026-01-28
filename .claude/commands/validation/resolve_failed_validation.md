# /resolve_failed_validation

**Template Category**: Action
**Prompt Level**: 3 (Conditional)

Analyze validation failure output and fix the underlying issues.

## Variables
- failure_context: $1 (JSON string with validation failure details)

## Context
You are being invoked as part of an agent resolution retry loop. A validation command has failed, and you need to analyze the failure and fix it.

The failure context JSON contains:
- label: Human-readable command label (e.g., "Lint", "Type Check")
- command: Full command that was executed
- exit_code: Non-zero exit code indicating failure
- stdout: Command standard output (truncated to 1000 chars)
- stderr: Command standard error (truncated to 1000 chars)

## Common Validation Failure Patterns

### Lint Failures (bun run lint)
- **Unused variables**: Remove or prefix with underscore
- **Missing semicolons**: Add semicolons or configure ESLint
- **Import order**: Reorder imports per project style
- **Formatting issues**: Run formatter or fix manually

### Type Check Failures (bunx tsc --noEmit)
- **Type mismatches**: Add type assertions or fix types
- **Missing properties**: Add required properties or make optional
- **Undefined values**: Add null checks or default values
- **Import errors**: Fix import paths or add type definitions

### Test Failures (bun test)
- **Assertion failures**: Fix logic or update test expectations
- **Timeout errors**: Increase timeout or optimize test
- **Mock issues**: Update mocks to match interface changes
- **Environment issues**: Check test environment setup

### Migration Validation Failures (bun run test:validate-migrations)
- **Drift detected**: Verify SQLite migration files are valid and up to date
- **Missing files**: Ensure all migration files are present and valid
- **Content mismatch**: Update migration files to match schema changes

## Instructions

1. **Parse the failure context** from the JSON input
2. **Identify the failure type** based on the command label and error output
3. **Read relevant files** to understand the issue (use Read tool)
4. **Fix the issue** using Edit or Write tools:
   - For lint failures: fix code style issues
   - For type errors: add types, fix imports, or add null checks
   - For test failures: update test expectations or fix implementation
   - For migration drift: sync migration directories
5. **Verify the fix** by reading the modified files

## CRITICAL: Do NOT run validation commands

The orchestration layer will re-run validation commands after you complete your fixes. Your job is ONLY to fix the issues, not to verify them.

## Report Format

Your response should describe what you fixed in plain text. Do NOT include:
- Markdown formatting (no **bold**, no ``` code blocks, no # headers)
- Meta-commentary (no "Based on", "I can see", "Let me")
- Validation command execution (orchestration layer handles this)

**✅ CORRECT output:**
```
Fixed unused variable error in app/src/api/routes.ts by removing unused import statement on line 12. Removed duplicate import of ValidationError that was causing the lint failure.
```

**❌ INCORRECT output:**
```
Based on the error output, I can see that there's an unused import. Let me fix that:

**Changes Made:**
- Removed unused import

I'll now run the lint command to verify the fix.
```

## Output Schema

Plain text description of fixes applied (no markdown, no code execution confirmation).

```json
{
  "type": "string",
  "minLength": 10,
  "maxLength": 500
}
```
