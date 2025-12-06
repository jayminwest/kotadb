---
description: Review code changes from Claude configuration perspective
argument-hint: <pr-number-or-diff-context>
---

# Claude Config Expert - Review

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues (automatic CHANGES_REQUESTED):**
- Invalid JSON in settings.json or settings.local.json
- CLAUDE.md references to non-existent commands
- Missing description frontmatter in new commands
- Breaking changes to command paths without migration
- MCP server configurations that reference missing tools

**Important Concerns (COMMENT level):**
- CLAUDE.md sections that exceed 50 lines without subsections
- Command descriptions that don't match actual behavior
- Inconsistent naming between similar commands
- Missing argument-hint for commands that require arguments
- Outdated documentation in conditional_docs/

**Pattern Violations to Flag:**
- Command files without required frontmatter
- settings.json with commented-out code (use settings.local.json)
- CLAUDE.md with hardcoded paths instead of command references
- Duplicate command functionality across categories
- Missing Template Category or Prompt Level in commands

### Documentation Standards

**CLAUDE.md Updates:**
- Keep BLUF section under 10 lines
- Update command tables when adding new commands
- Maintain alphabetical ordering within categories
- Cross-reference related documentation

**Command Documentation:**
- Description: One sentence, starts with verb
- argument-hint: Shows expected input format
- Template Category: Message-Only, Structured Data, or Action
- Prompt Level: 1-7 based on complexity

**settings.json Validation:**
- Valid JSON syntax (no trailing commas)
- Hook commands reference existing scripts
- Timeout values are reasonable (10-120 seconds)
- Matcher patterns are correctly formatted

## Workflow

1. **Parse Diff**: Identify configuration files in REVIEW_CONTEXT
2. **Check JSON**: Validate JSON syntax in settings files
3. **Check CLAUDE.md**: Verify command references and structure
4. **Check Commands**: Validate frontmatter and organization
5. **Synthesize**: Produce consolidated review with findings

## Output

### Claude Config Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List if any, empty if none]

**Documentation Issues:**
- [CLAUDE.md, command docs, or conditional docs problems]

**Configuration Issues:**
- [settings.json or MCP configuration problems]

**Suggestions:**
- [Improvement suggestions for non-blocking items]

**Positive Observations:**
- [Good configuration patterns noted in the changes]
