# Bug Plan: Fix ADW Bot Escaped Newlines in GitHub Comments

## Bug Summary

**Observed Behaviour:**
ADW bot comments posted to GitHub issues contain escaped newline characters (`\n`) instead of actual line breaks, making JSON state snapshots and multi-line messages unreadable. For example, JSON state dumps appear as single-line strings with visible `\n` escape sequences.

**Expected Behaviour:**
GitHub comments should render with proper line breaks and code block formatting:
- JSON state snapshots displayed as syntax-highlighted multi-line code blocks
- Multi-line command lists rendered as bullet lists with proper spacing
- Error messages with readable formatting

**Suspected Scope:**
8 locations across 3 ADW phase files (`adw_plan.py`, `adw_build.py`, `adw_test.py`) where f-strings use literal `\\n` escape sequences instead of actual newlines.

## Root Cause Hypothesis

**Leading Theory:**
Python f-strings use double-escaped newlines (`\\n`) which create literal backslash-n character pairs in the output string instead of newline characters. When passed to `gh issue comment --body`, GitHub's markdown renderer displays these as visible escape sequences.

**Supporting Evidence:**
- Line 93 in `adw_plan.py`: `f"{...}\\n```json\\n{...}\\n```"` - double backslash creates literal `\n` in string
- Line 328 in `adw_plan.py`: Same pattern for final planning state
- Lines 171, 241 in `adw_build.py`: Same pattern for final build state
- Lines 255-256, 340, 352 in `adw_test.py`: Same pattern for validation messages
- `make_issue_comment()` in `github.py:85-96` passes strings directly to `gh issue comment --body` without processing
- GitHub CLI treats body text literally, expecting actual newline characters for line breaks

## Fix Strategy

**Code Changes:**
Replace all double-escaped newlines (`\\n`) with single-escaped newlines (`\n`) in f-strings. Python will interpret `\n` as a newline character, which `gh issue comment` will render correctly in markdown.

**Approach:**
1. Replace `\\n` with `\n` in all 8 affected f-string literals
2. Verify JSON code blocks use proper markdown fencing: `\n```json\n{json}\n```\n`
3. Ensure multi-line command lists use proper list syntax: `\nCommands:\n- item1\n- item2`
4. Preserve `[ADW-BOT]` prefix format for automation parsing compatibility

**Validation:**
- Add pytest test case that verifies comment formatting by mocking `subprocess.run` in `make_issue_comment()`
- Test should assert that comment body contains actual newline characters (not `\n` strings)
- Manual validation: trigger ADW planning phase and inspect GitHub comment rendering

## Relevant Files

- `automation/adws/adw_phases/adw_plan.py` — Lines 93, 328 (state snapshots)
- `automation/adws/adw_phases/adw_build.py` — Lines 171, 241 (build state comments)
- `automation/adws/adw_phases/adw_test.py` — Lines 255-256, 340, 352 (validation messages)
- `automation/adws/adw_modules/github.py` — Reference only (comment posting logic)
- `automation/adws/adw_modules/workflow_ops.py` — Reference only (`format_issue_message()`)

### New Files

- `automation/adws/adw_tests/test_github_comment_formatting.py` — Unit tests for comment formatting

## Task Breakdown

### Verification
- **Reproduce current failure:**
  1. Trigger ADW planning phase: `uv run automation/adws/adw_plan.py <issue-number>`
  2. Navigate to GitHub issue and observe escaped newlines in bot comments
  3. Confirm JSON blocks render as single-line strings with visible `\n`

- **Logs/metrics to capture:**
  - Screenshot of malformed GitHub comment (before fix)
  - Raw comment body string from `gh issue comment` command (via debug logging)

### Implementation
1. **Fix `adw_plan.py` state snapshots:**
   - Line 93: Replace `\\n` with `\n` in run state snapshot f-string
   - Line 328: Replace `\\n` with `\n` in final planning state f-string
   - Verify JSON code block format: `\n```json\n{json.dumps(state.data, indent=2)}\n```\n`

2. **Fix `adw_build.py` state snapshots:**
   - Line 171: Replace `\\n` with `\n` in final build state (error path)
   - Line 241: Replace `\\n` with `\n` in final build state (success path)
   - Ensure consistent formatting with plan phase

3. **Fix `adw_test.py` validation messages:**
   - Line 255: Replace `\\n` with `\n` in validation start message
   - Line 256: Replace `\\n` with `\n` in command list formatting
   - Line 340: Replace `\\n` with `\n` in validation failure message
   - Line 352: Replace `\\n` with `\n` in test phase state snapshot

4. **Add unit tests:**
   - Create `automation/adws/adw_tests/test_github_comment_formatting.py`
   - Mock `subprocess.run` to intercept `gh issue comment` calls
   - Assert comment body contains actual `\n` characters (not backslash-n strings)
   - Test all 3 comment types: state snapshots, command lists, error messages
   - Verify `[ADW-BOT]` prefix format preserved

### Validation
- **Tests to add/update:**
  - `test_github_comment_formatting.py`:
    - `test_state_snapshot_formatting()` - verifies JSON code blocks have newlines
    - `test_command_list_formatting()` - verifies bullet lists have line breaks
    - `test_error_message_formatting()` - verifies multi-line errors render correctly
  - All tests use `unittest.mock.patch` to intercept `subprocess.run` calls
  - Assertions check `comment` parameter contains actual newline characters

- **Manual checks:**
  1. Trigger full ADW workflow on test issue: `uv run automation/adws/adw_plan.py <test-issue>`
  2. Verify GitHub comment rendering:
     - JSON state snapshots display as syntax-highlighted code blocks
     - Command lists render as bulleted lists with proper spacing
     - Error messages have readable multi-line formatting
  3. Confirm `[ADW-BOT]` prefix parsing still works for automation
  4. Verify no regressions in ADW phase execution

## Step by Step Tasks

### Code Changes
1. Open `automation/adws/adw_phases/adw_plan.py`
2. Replace line 93: change `\\n` to `\n` in f-string (3 occurrences)
3. Replace line 328: change `\\n` to `\n` in f-string (3 occurrences)
4. Open `automation/adws/adw_phases/adw_build.py`
5. Replace line 171: change `\\n` to `\n` in f-string (3 occurrences)
6. Replace line 241: change `\\n` to `\n` in f-string (3 occurrences)
7. Open `automation/adws/adw_phases/adw_test.py`
8. Replace line 255: change `\\n` to `\n` in f-string (1 occurrence)
9. Replace line 256: change `\\n` to `\n` in f-string (2 occurrences)
10. Replace line 340: change `\\n` to `\n` in f-string (2 occurrences)
11. Replace line 352: change `\\n` to `\n` in f-string (3 occurrences)

### Test Coverage
12. Create `automation/adws/adw_tests/test_github_comment_formatting.py`
13. Import required modules: `unittest.mock`, `automation.adws.adw_modules.github`, `json`
14. Implement `test_state_snapshot_formatting()`:
    - Mock `subprocess.run` in `make_issue_comment()`
    - Create test state dict with nested structure
    - Format comment with `f"{format_issue_message(...)}\\n```json\\n{json.dumps(state)}\\n```"`
    - Assert mock call args contain actual `\n` characters (not literal backslash-n)
15. Implement `test_command_list_formatting()`:
    - Mock `subprocess.run`
    - Format multi-line command list with bullet points
    - Assert newlines rendered correctly in comment body
16. Implement `test_error_message_formatting()`:
    - Mock `subprocess.run`
    - Format error message with multi-line stack trace
    - Assert line breaks preserved

### Validation
17. Run new unit tests: `cd automation/adws && pytest adw_tests/test_github_comment_formatting.py -v`
18. Run full automation test suite: `cd automation/adws && pytest adw_tests/ -v`
19. Manual validation on test issue:
    - Create test issue or use existing low-priority issue
    - Run: `uv run automation/adws/adw_plan.py <issue-number>`
    - Open GitHub issue in browser
    - Verify JSON state snapshot renders as code block with syntax highlighting
    - Verify command lists render as bulleted lists
    - Confirm no visible `\n` escape sequences
20. Verify Python syntax: `python3 -m py_compile automation/adws/adw_phases/*.py`
21. Run type checking (if enabled): `mypy automation/adws/adw_phases/`

### Commit and Push
22. Stage changes: `git add automation/adws/adw_phases/ automation/adws/adw_tests/ docs/specs/`
23. Validate commit message follows Conventional Commits format
24. Commit changes: `git commit -m "fix(adw): render GitHub comments with proper line breaks instead of escaped newlines (#169)"`
25. Push branch: `git push -u origin bug/169-adw-bot-escaped-newlines`

## Regression Risks

**Adjacent Features to Watch:**
- **ADW bot comment parsing:** Automation systems may parse `[ADW-BOT]` prefixed comments for state recovery
  - Risk: If parsers expect escaped newlines, formatting change could break parsing
  - Mitigation: `format_issue_message()` unchanged, only multi-line content affected
  - Validation: Verify state recovery still works by resuming failed ADW run

- **GitHub CLI markdown rendering:** Different GitHub environments may render markdown inconsistently
  - Risk: GitHub Enterprise or mobile web may handle newlines differently
  - Mitigation: Use standard markdown syntax (code fences, list markers)
  - Validation: Test on both github.com web interface and GitHub mobile

- **JSON state snapshot integrity:** JSON serialization must remain valid
  - Risk: Newline characters inside JSON strings could break parsing
  - Mitigation: `json.dumps()` handles string escaping automatically
  - Validation: Verify deserialization works: `json.loads(extracted_json_block)`

**Follow-up Work if Risk Materialises:**
- If comment parsing breaks: Add `strip_bot_comment_formatting()` helper to normalize whitespace before parsing
- If GitHub rendering inconsistent: Switch to `textwrap.dedent()` for complex multi-line messages
- If JSON extraction fails: Add code fence extraction helper with robust regex

## Validation Commands

**Pre-commit validation:**
```bash
# Python syntax check
python3 -m py_compile automation/adws/adw_phases/*.py

# Run new unit tests
cd automation/adws && pytest adw_tests/test_github_comment_formatting.py -v

# Run full automation test suite
cd automation/adws && pytest adw_tests/ -v
```

**Post-fix validation:**
```bash
# Manual ADW workflow test (requires GitHub token)
uv run automation/adws/adw_plan.py <test-issue-number>

# Verify state recovery
# (simulate failure mid-workflow, then resume from checkpoint)
```

**CI validation:**
- Automation CI workflow (`.github/workflows/automation-ci.yml`) will run pytest suite
- No additional CI changes required (existing test infrastructure sufficient)

## Commit Message Validation

All commits for this bug fix will be validated against Conventional Commits format:

**Valid examples:**
- `fix(adw): render GitHub comments with proper line breaks (#169)`
- `test(adw): add unit tests for comment formatting (#169)`
- `docs(adw): update bug fix plan for escaped newlines (#169)`

**Invalid patterns to avoid:**
- ❌ "Looking at the code, this commit fixes escaped newlines"
- ❌ "Based on the issue, here is a fix for comment formatting"
- ❌ "I can see the problem is double-escaped newlines"
- ❌ "The changes address the GitHub rendering issue"
- ❌ "Let me fix the escaped newline bug"

**Direct statement format:**
- ✅ `fix(adw): replace double-escaped newlines with actual line breaks in GitHub comments`
- ✅ `test(adw): verify comment body contains newlines not escape sequences`
