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

**Important Concerns (COMMENT level):**
- Inconsistent output formatting between similar commands
- Emoji usage without terminal compatibility consideration
- Missing --quiet or --verbose flags for new commands
- Long operations without streaming feedback
- Complex prompts without clear default values
- Missing API version in health check responses (fixed in #453)
- Insufficient quota/usage context in rate limit errors (improved in #423)
- Insufficient error context for debugging (Sentry improvements in #439, #440)

**Pattern Violations to Flag:**
- Wall of text without structure or formatting
- Error messages that blame the user
- Missing confirmation for destructive operations
- Inconsistent exit codes
- Mixed output formats (JSON and text in same response)

### Output Standards

**Success Messages:**
- Brief confirmation with relevant identifiers
- Timing information for operations >1 second
- Count summaries for batch operations
- Version information in health checks and meta responses

**Error Messages:**
- What: Clear statement of what failed
- Why: Brief explanation of the cause (if known)
- How: Actionable steps to resolve
- Reference: Error code or documentation link
- Sentry tracking: All errors must be captured with rich context for observability
- User-safe: Never expose internal implementation details or stack traces to users

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
