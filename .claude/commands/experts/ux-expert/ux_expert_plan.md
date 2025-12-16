---
description: Provide UX analysis for planning
argument-hint: <issue-context>
---

# UX Expert - Plan

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### KotaDB UX Knowledge Areas

**CLI Output Formatting:**
- Structured output: JSON for machine consumption, formatted text for human reading
- Progress indicators: Spinners for indeterminate waits, progress bars for measurable tasks
- Color usage: Semantic colors (red=error, yellow=warning, green=success) with NO_COLOR support
- Table formatting: Consistent column alignment, truncation for long values
- Markdown rendering: Support for terminal markdown rendering in appropriate contexts

**Error Message Patterns:**
- Actionable errors: Always include what went wrong AND how to fix it
- Error codes: Unique identifiers for programmatic error handling
- Stack traces: Hidden by default, shown with --verbose or DEBUG=1
- Context preservation: Include relevant identifiers (file paths, IDs, timestamps)
- Exit codes: Non-zero for failures, distinct codes for different error categories
- Parameter validation errors: Provide clear message about what parameter is invalid and expected format (Added after #541, #547)
- Access denied errors: Differentiate between "not found" and "access denied" for security (Added after #541)

**Progress Feedback:**
- Long operations: Must show progress within 1 second of starting
- Multi-step workflows: Show current step and total steps (e.g., "Step 2/5: Indexing files")
- Completion summaries: Report counts, timing, and any warnings
- Streaming output: Real-time feedback for operations >5 seconds
- Operation metadata: Include tables affected, rows processed for data operations (Added after #541)

**Accessibility Patterns:**
- Screen reader compatibility: Meaningful text without relying on visual formatting
- NO_COLOR environment variable: Respect user preference for colorless output
- Keyboard navigation: Support Ctrl+C graceful cancellation
- Alternative formats: --json flag for all commands producing output

**Structured Logging Patterns (Added after #436):**
- JSON logging format: Structured for machine parsing with timestamp, level, message, context
- Sensitive data masking: Automatic redaction of api_keys, tokens, passwords, secrets in logs
- Correlation IDs: Include request_id, user_id, job_id for tracing across operations
- Log level configuration: Respect LOG_LEVEL environment variable (debug/info/warn/error)
- Error context: Include error code, message, and stack (conditionally) in log entries
- Child logger context: Support creating child loggers with additional context to avoid repetition
- Module context: Include module name in base logger context for better trace filtering (Added after #547)

**API Response Patterns (Added after #431, #470):**
- Health check responses: Include API version, status, timestamp, and queue metrics
- Success responses: Brief confirmation with relevant identifiers and timing for ops >1 second
- Error responses: Consistent structure with HTTP status code + error message field
- Entity creation: Return created resource ID for subsequent operations
- List operations: Include counts for batch operations, order by most recent first
- Version information: Always include API version in health checks (fixed after #453)
- Rate limit responses: Include current usage, limit, and reset time headers for transparency
- Partial success responses: For batch operations with errors, return counts and error arrays (Added after #541)

**Error Tracking and Observability (Added after #439, #440):**
- Sentry integration: Capture all try-catch block errors with rich context for debugging
- Error context: Include operation type, user ID, resource identifiers for correlation
- Sensitive data protection: Automatic masking of API keys, tokens, passwords, secrets
- Error metrics: Track error types, frequency, and user impact for observability
- User-facing errors: Never expose internal error details; provide actionable guidance instead
- Rich error objects: Structure error objects with message, stack, and code fields for observability (Added after #547)

**Rate Limiting Messaging (Added after #423):**
- Quota display: Show current usage and tier limits (free/solo/team) clearly
- Dual limits: Communicate both hourly and daily quotas to users
- Limit exceeded: Provide clear error message with reset time and upgrade path
- Proactive warnings: Consider warning at 80% usage for better UX
- Tier information: Include which tier user is on for context

**Tool Parameter Validation (Added after #541):**
- Parameter type validation: Validate params are objects with clear error messages
- UUID validation: Provide meaningful error for invalid UUID format in tool params
- Type coercion: Safe type coercion for optional parameters with defaults (Added after #541)
- Directory path handling: Support optional directory parameters with sensible defaults (Added after #541)

**Data Export/Import UX (Added after #541, #547):**
- Export progress: Report tables being exported with hash-based change detection
- Import result structure: Include success flag, counts, error arrays, duration for transparency
- Migration context: Show which tables were migrated and row counts for verification
- Force flags: Support force operations with clear warning about data implications (Added after #541)

**Anti-Patterns Discovered:**
- Emoji overuse without fallbacks (breaks on some terminals)
- Silent failures (operations complete without confirmation)
- Wall of text errors without actionable guidance
- Inconsistent formatting between similar commands
- Missing --quiet flag for scripting contexts
- Logging with process.stdout/stderr without structured format (discovered in #436 fixes)
- Missing version information in health checks (fixed in #453)
- Untracked errors in try-catch blocks without Sentry capture (fixed in #439, #440)
- Internal error details exposed to users (violates error context principle from #440)
- Generic validation errors without parameter names (fixed in #541)
- Ambiguous error messages mixing "not found" with "access denied" (fixed in #541)

### User Feedback Patterns

**Confirmation Messages:**
- Success: Brief, positive, include relevant details (e.g., "Created project 'my-project' (id: abc123)")
- Warnings: Yellow/orange, explain impact, suggest resolution
- Info: Neutral, provide context without alarm
- Batch operation summaries: Include counts of successful/failed items (Added after #541)

**Interactive Prompts:**
- Default values: Show in brackets, accept Enter for default
- Validation: Immediate feedback on invalid input
- Escape hatch: Clear instructions for cancellation (Ctrl+C)
- Confirmation: Destructive operations require explicit yes/no

## Workflow

1. **Parse Context**: Extract UX-relevant requirements from USER_PROMPT
2. **Identify Touchpoints**: Map to user interaction points (CLI output, prompts, errors)
3. **Assess Experience**: Evaluate against accessibility and usability patterns
4. **Pattern Match**: Compare against known UX patterns in Expertise
5. **Risk Assessment**: Identify UX risks (confusion, accessibility issues)

## Report Format

### UX Perspective

**User Touchpoints:**
- [List interaction points affected by this change]

**Output Format Impact:**
- [How terminal output, formatting, or feedback is affected]

**Recommendations:**
1. [Prioritized UX recommendation with rationale]

**Risks:**
- [UX risk with severity: HIGH/MEDIUM/LOW]

**Pattern Compliance:**
- [Assessment of alignment with established UX patterns]
