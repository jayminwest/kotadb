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
- Invalid JSON in settings.json or settings.local.json (discovered #486)
- CLAUDE.md references to non-existent commands (discovered #491)
- Missing description frontmatter in new commands (discovered #487)
- Missing Template Category or Prompt Level in commands (discovered #487)
- Breaking changes to command paths without migration
- MCP server configurations that reference missing tools
- Hook configuration with invalid matchers or timeout values (discovered #485)
- Hook configuration missing nested "hooks" array structure (discovered #214)
- Agent registry missing capability or model indexes (discovered #214)
- PreToolUse hooks without proper tool enforcement documentation (discovered #214)
- Missing orchestrator context detection/guard hooks in settings (discovered #214)
- ADW state variable adw_id documentation missing find_by_issue pattern (discovered #214)

**Important Concerns (COMMENT level):**
- CLAUDE.md sections exceeding 50 lines without subsections (discovered #482)
- Command descriptions that don't match actual behavior (discovered #491)
- Inconsistent naming between similar commands
- Missing argument-hint for commands that require arguments
- Outdated documentation in conditional_docs/ (discovered #486)
- CLAUDE.md with meta-commentary patterns in output (discovered #482)
- Hook scripts missing shared utility imports (discovered #485)
- Orchestrator phase parameters not documented in argument-hint (discovered #490)
- Tier 2 orchestrators without consistent response format (discovered #491)
- Layer-specific docs not referenced in CLAUDE.md when added (discovered #491)
- Hook timeout values inconsistent between PostToolUse and UserPromptSubmit (discovered #508)
- Hook matcher patterns not using pipe operator for multiple tool names (discovered #508)
- settings.json environment variable format inconsistency (discovered #508)
- Agent coordinator logic not using leaf_spawner tools (discovered #214)
- Missing /do universal entry point command registration (discovered #214)
- Orchestrator context hook not properly triggering enforcement (discovered #214)

**Pattern Violations to Flag:**
- Command files without required frontmatter (description, Template Category, Prompt Level)
- settings.json with commented-out code (use settings.local.json) (discovered #486)
- CLAUDE.md with hardcoded paths instead of command references (discovered #482)
- Duplicate command functionality across categories
- Missing Template Category or Prompt Level in commands (discovered #487)
- Hook configurations with mismatched timeout values (less than 10 or more than 120 seconds)
- Agent registry without capability or model indexes (discovered #483)
- Orchestrator commands with undefined or inconsistent phase list (discovered #490)
- Tier 2/Tier 3 orchestrator boundaries without clear responsibility delegation (discovered #491)
- Multi-phase workflow commands missing spec/review file path logic (discovered #490)
- Hook "matcher" field present but "hooks" array missing (discovered #214)
- PreToolUse hooks in settings without proper guard implementation (discovered #214)
- ADW commands without optional adw_id and issue auto-discovery (discovered #214)

### Documentation Standards

**CLAUDE.md Updates (Discovered #482):**
- Keep BLUF section under 10 lines for scannability
- Add navigation gateway pattern with Quick Start 4-step workflow
- Add "When Things Go Wrong" diagnostic mappings
- Update command tables when adding new commands
- Maintain alphabetical ordering within categories
- Cross-reference related documentation
- Avoid meta-commentary patterns in output
- Document new hook patterns (orchestrator context, guard enforcement)
- Reference agent registry and coordinator patterns

**Command Documentation (Updated #487):**
- Description: One sentence, starts with verb
- argument-hint: Shows expected input format (required if command takes args)
- Template Category: Message-Only, Path Resolution, Action, or Structured Data (required, added #474)
- Prompt Level: 1-7 based on complexity (1=static, 7=self-modifying with reasoning, required, added #474)
- For multi-phase commands: document phase parameters in argument-hint (Added after #214)
- For orchestrator commands: reference ADW ID auto-discovery pattern (Added after #214)

**settings.json Validation (Updated #508, added #485, #486):**
- Valid JSON syntax (no trailing commas, discovered #486)
- Hook commands reference existing scripts in .claude/hooks/
- Timeout values in milliseconds (45000-10000 range, discovered #508)
- Matcher patterns using pipe operator for multiple tools (Write|Edit, discovered #508)
- Environment variables use $CLAUDE_PROJECT_DIR format (discovered #508)
- statusLine configuration points to valid python script (discovered #486)
- Hooks include PostToolUse and UserPromptSubmit sections (discovered #485)
- Multiple hooks per hook type allowed with sequential execution (discovered #508)
- Hook configuration uses nested "hooks" array for multiple scripts (Added after #214)
- PreToolUse hooks for orchestrator context enforcement (Added after #214)
- Hook matcher for PreToolUse should reference orchestrator guard logic (Added after #214)

**Agent Registry Configuration (Added #214):**
- JSON schema with $schema field for IDE validation
- Complete capability index mapping capabilities to available agents
- Complete model index mapping models (haiku, sonnet, opus) to agents
- Complete tool matrix mapping all tools to compatible agents
- readOnly field set appropriately (true for analysis, false for modification)
- Agent descriptions start with verb and end with specialty
- Coordinator agents have access to mcp__leaf_spawner tools
- Agent tool lists must match actual agent capability definitions

**Orchestrator Command Configuration (Added #490, #491, #214):**
- Multi-phase orchestrators have clear phase definitions in output documentation
- Tier 2 orchestrators in cascading patterns have consistent response schemas
- Phase parameters documented in argument-hint with valid phase list
- All phases reference output file paths where applicable (specs, reviews)
- Build phase includes file dependency analysis (parallel vs sequential)
- Review/validate phases have clear success/failure criteria
- Context passing between phases documented in orchestrator prompt
- /do command documents issue classification and auto-discovery patterns
- /do command has end-to-end workflow with auto-fix loops

**Orchestrator Hook Configuration (Added #214):**
- UserPromptSubmit hook includes orchestrator_context.py pattern detection
- PreToolUse hook includes orchestrator_guard.py tool enforcement
- Hook state file location documented in both hooks: .claude/data/orchestrator_context.json
- Guard hook blocks modification tools (Write, Edit, MultiEdit, NotebookEdit)
- Guard hook allows query/delegation tools (Task, SlashCommand, Read, Grep, etc.)
- Guard hook provides helpful error message with fix instructions

## Workflow

1. **Parse Diff**: Identify configuration files in REVIEW_CONTEXT
2. **Check JSON**: Validate JSON syntax in settings files
3. **Check CLAUDE.md**: Verify command references and structure
4. **Check Commands**: Validate frontmatter and organization
5. **Check Hooks**: Verify hook configuration patterns and script existence
6. **Check Agents**: Validate agent registry structure and tool assignments
7. **Synthesize**: Produce consolidated review with findings

## Output

### Claude Config Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List if any, empty if none]

**Documentation Issues:**
- [CLAUDE.md, command docs, or conditional docs problems]

**Configuration Issues:**
- [settings.json, hook, or agent registry problems]

**Suggestions:**
- [Improvement suggestions for non-blocking items]

**Positive Observations:**
- [Good configuration patterns noted in the changes]
