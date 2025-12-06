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

**Progress Feedback:**
- Long operations: Must show progress within 1 second of starting
- Multi-step workflows: Show current step and total steps (e.g., "Step 2/5: Indexing files")
- Completion summaries: Report counts, timing, and any warnings
- Streaming output: Real-time feedback for operations >5 seconds

**Accessibility Patterns:**
- Screen reader compatibility: Meaningful text without relying on visual formatting
- NO_COLOR environment variable: Respect user preference for colorless output
- Keyboard navigation: Support Ctrl+C graceful cancellation
- Alternative formats: --json flag for all commands producing output

**Anti-Patterns Discovered:**
- Emoji overuse without fallbacks (breaks on some terminals)
- Silent failures (operations complete without confirmation)
- Wall of text errors without actionable guidance
- Inconsistent formatting between similar commands
- Missing --quiet flag for scripting contexts

### User Feedback Patterns

**Confirmation Messages:**
- Success: Brief, positive, include relevant details (e.g., "Created project 'my-project' (id: abc123)")
- Warnings: Yellow/orange, explain impact, suggest resolution
- Info: Neutral, provide context without alarm

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
