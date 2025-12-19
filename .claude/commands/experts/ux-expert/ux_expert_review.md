---
description: Review code changes from UX perspective
argument-hint: <pr-number-or-diff-context>
---

# UX Expert - Review

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues (automatic CHANGES_REQUESTED):**
- Error messages without actionable guidance
- Silent failures (no output on error conditions)
- Breaking changes to output format without --json alternative
- Missing progress indicators for operations >5 seconds
- Hardcoded colors without NO_COLOR support
- Try-catch blocks without Sentry error capture (discovered in #439, #440)
- Exposing internal error details to users (violates error context principle)
- Rate limit responses without current usage/limit info (discovered in #423)
- Parameter validation errors without clear guidance (discovered in #541)
- Ambiguous error messages mixing "not found" with "access denied" (discovered in #541)
- Generic "Parameters must be an object" without parameter name context (discovered in #541)

**Important Concerns (COMMENT level):**
- Inconsistent output formatting between similar commands
- Emoji usage without terminal compatibility consideration
- Missing --quiet or --verbose flags for new commands
- Long operations without streaming feedback
- Complex prompts without clear default values
- Missing API version in health check responses (fixed in #453)
- Insufficient quota/usage context in rate limit errors (improved in #423)
- Insufficient error context for debugging (Sentry improvements in #439, #440)
- Batch operations without error aggregation in responses (improved in #541)
- Missing operation metadata in success responses (improved in #541)
- Tool parameters lacking type coercion for optional fields (improved in #541)

**Pattern Violations to Flag:**
- Wall of text without structure or formatting
- Error messages that blame the user
- Missing confirmation for destructive operations
- Inconsistent exit codes
- Mixed output formats (JSON and text in same response)
- Parameter validation errors without parameter names (new in #541)
- UUID validation errors without format guidance (new in #541)
- Data operation results without row/table counts (new in #541)

### Output Standards

**Success Messages:**
- Brief confirmation with relevant identifiers
- Timing information for operations >1 second
- Count summaries for batch operations
- Version information in health checks and meta responses
- Metadata about affected resources (tables, rows, files processed)

**Error Messages:**
- What: Clear statement of what failed
- Why: Brief explanation of the cause (if known)
- How: Actionable steps to resolve
- Reference: Error code or documentation link
- Sentry tracking: All errors must be captured with rich context for observability
- User-safe: Never expose internal implementation details or stack traces to users
- Parameter-specific: When validating params, include parameter name and expected format
- Access transparency: Distinguish between "not found" and "access denied" for security clarity

**Progress Indicators:**
- Determinate: Progress bar with percentage for measurable work
- Indeterminate: Spinner with status text for unknown duration
- Multi-step: Current step, total steps, step description
- Rate limit context: Include current usage and tier information for transparency

**Quota/Rate Limit Responses:**
- Current usage: Show exact counts against limits
- Tier information: Display user's plan level (free/solo/team)
- Reset timing: Clear indication of when limits reset (hourly/daily)
- Upgrade path: Link to upgrade for higher limits
- Dual limits: Communicate both hourly and daily quotas clearly

**Batch/Bulk Operation Responses:**
- Success count: Number of items successfully processed
- Error count: Number of failed items
- Error details: Array of errors with item identifiers and reasons
- Operation timing: Total duration and per-item metrics if relevant
- Partial success handling: Support and clearly communicate partial failures

**Data Operation Responses (Added after #541):**
- Tables affected: List of tables modified or processed
- Row counts: Rows inserted, updated, deleted, or exported
- Duration metrics: Total operation time and per-table times
- Force flags: When force operations are used, acknowledge in response
- Hash-based optimization: Communicate when unchanged data is skipped

## Workflow

1. **Parse Diff**: Identify files changed in REVIEW_CONTEXT
2. **Check Output**: Scan for console output, error handling, user messages
3. **Check Patterns**: Verify compliance with UX patterns
4. **Check Critical**: Identify any automatic CHANGES_REQUESTED triggers
5. **Synthesize**: Produce consolidated review with findings

## Output

### UX Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List if any, empty if none]

**Output Format Issues:**
- [Formatting, structure, or consistency problems]

**Error Handling Issues:**
- [Error message quality problems]

**Suggestions:**
- [Improvement suggestions for non-blocking items]

**Positive Observations:**
- [Good UX patterns noted in the changes]
