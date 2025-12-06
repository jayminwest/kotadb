# CC Hook Expert Analysis - Issue #465
## MCP Endpoint Returns 406 for Claude Code Clients

**Analysis Date**: 2025-12-05
**Issue**: #465 - MCP endpoint returns 406 for Claude Code clients
**Root Cause**: MCP SDK's `StreamableHTTPServerTransport` requires both `application/json` AND `text/event-stream` in Accept header
**Expert**: CC Hook Expert (Claude Code hooks and automation perspective)

---

## Executive Summary

Issue #465 reveals a critical integration point between Claude Code client configuration, MCP SDK requirements, and pre-commit hook validation. The 406 error occurs when Claude Code clients send incomplete Accept headers. This analysis identifies:

1. **Pre-commit hook opportunities** for validating MCP client configuration
2. **Logging standard compliance** for new MCP-related code
3. **Claude Code hook configuration impacts** on client behavior
4. **Automation opportunities** for header validation and client config generation
5. **Hook-based documentation linting** for MCP protocol documentation

---

## Problem Analysis

### Root Cause Details

The MCP SDK's `StreamableHTTPServerTransport` implements strict HTTP content negotiation per MCP specification:

```typescript
// app/docs/mcp-sdk-migration.md (lines 329-335)
// Custom Implementation: Accepted `Accept: application/json`
// SDK Requirement: `Accept: application/json, text/event-stream`
// The SDK requires BOTH content types even in JSON-only mode (enableJsonResponse: true)
```

**Why Both Headers?**
- `application/json`: For JSON response mode (our stateless config)
- `text/event-stream`: For SSE fallback capability per MCP spec content negotiation

### Impact Scope

**Affected Clients**:
- Claude Desktop (via `.mcp.json` configuration)
- Claude Code (via HTTP transport setup)
- Custom HTTP clients not including both headers
- Automated scripts/integrations missing header validation

**Current Status**:
- Issue: RESOLVED (documented in `app/docs/mcp-sdk-migration.md` section "Issue: 406 Not Acceptable")
- Tests: Updated to include correct headers (122/132 passing)
- Clients: Need configuration updates to reflect SDK requirements

---

## CC Hook Perspective Analysis

### 1. Pre-Commit Hook Implications for Documentation Changes

#### Current Hook Infrastructure

**Location**: `.claude/hooks/auto_linter.py` (PostToolUse hook)
**Trigger**: Write|Edit on .ts/.tsx/.js/.jsx files
**Timeout**: 45 seconds (45000ms)

#### Required Hook Enhancements

**Hook Type Recommendation**: **PostToolUse + New Validation Hook**

```python
# Proposed: .claude/hooks/mcp_docs_validator.py
# PostToolUse hook for documentation changes
# Validates:
# 1. MCP protocol documentation accuracy
# 2. Accept header examples in code/docs
# 3. Client configuration examples match SDK requirements
```

**Why This Hook**:
- Detects when documentation files change (`**/mcp*.md`)
- Validates example code snippets include correct headers
- Prevents outdated client config examples from being committed
- Ensures consistency across documentation

**Pattern Compliance**:
✅ Advisory decision ("continue") - no blocking
✅ Timeout: 15 seconds (lightweight validation)
✅ Uses `sys.stdout.write()` per logging standards
✅ Returns JSON with "additionalContext" for feedback

#### Implementation Details

```python
#!/usr/bin/env python3
"""
PostToolUse hook for MCP documentation validation.

Triggers when documentation files change:
- **/mcp*.md
- .mcp.json examples
- Client configuration samples

Validates:
1. Accept headers include both content types
2. No hardcoded localhost URLs
3. Authorization header format correct
4. MCP-Protocol-Version matches supported versions
"""

def validate_mcp_docs(file_path: str) -> tuple[bool, str]:
    """Validate MCP-related documentation."""
    if not file_path.endswith('.md'):
        return True, ""

    with open(file_path) as f:
        content = f.read()

    issues = []

    # Check 1: Accept header completeness
    if 'application/json' in content and 'Accept:' in content:
        if 'text/event-stream' not in content:
            issues.append("Accept header missing 'text/event-stream' in example")

    # Check 2: No hardcoded localhost in production examples
    if 'https://' in content and 'localhost' in content:
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'https://' in line and 'localhost' in line:
                issues.append(f"Line {i+1}: Hardcoded localhost in HTTPS example")

    # Check 3: MCP-Protocol-Version consistency
    versions = set()
    for match in re.finditer(r'MCP-Protocol-Version["\']?\s*[:=]\s*["\']?(\d{4}-\d{2}-\d{2})', content):
        versions.add(match.group(1))

    if len(versions) > 1:
        issues.append(f"Multiple MCP-Protocol-Version values: {versions}")

    if issues:
        return False, "; ".join(issues)
    return True, "MCP documentation validation passed"
```

**Configuration** (`settings.json`):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/auto_linter.py",
            "timeout": 45000
          },
          {
            "matcher": "**/mcp*.md|.mcp.json",
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/mcp_docs_validator.py",
            "timeout": 15000
          }
        ]
      }
    ]
  }
}
```

### 2. Logging Standard Compliance for New Code

#### Current Status

✅ **Auto-linter**: Compliant
```python
# auto_linter.py line 8: "Per KotaDB logging standards: uses sys.stdout.write(), never print()."
sys.stdout.write(json.dumps(result))  # Correct
```

✅ **Context-builder**: Compliant
```python
# context_builder.py line 8: "Per KotaDB logging standards: uses sys.stdout.write(), never print()."
sys.stdout.write(json.dumps(result))  # Correct
```

✅ **Hook helpers**: Compliant
```python
# hook_helpers.py lines 47-48: Proper JSON I/O pattern
sys.stdout.write(json.dumps(result))
sys.stdout.flush()
```

#### Requirements for #465 Implementation

**New Code Areas** requiring compliance:

1. **MCP SDK endpoint update** (`app/src/api/routes.ts`)
   - Uses TypeScript `process.stdout.write()` ✅ Already compliant
   - See: `app/docs/mcp-sdk-migration.md` - migrated to Express with proper logging

2. **Documentation validation** (if hook created)
   - Must use `sys.stdout.write()` not `print()`
   - Must flush after each write for immediate delivery
   - Never call `sys.exit()` with non-zero code (advisory hooks only)

3. **Client configuration helper** (optional automation)
   - If creating hook to validate/generate `.mcp.json` samples
   - Use JSON stdout output pattern from `hook_helpers.py`

#### Validation Hook Pattern

```python
from hooks.utils.hook_helpers import output_result, read_hook_input

def main() -> None:
    hook_input = read_hook_input()  # JSON from stdin

    # Validate documentation
    file_path = get_file_path_from_input(hook_input)
    success, message = validate_mcp_docs(file_path)

    # Always use output_result() - never print()
    if success:
        output_result("continue", f"[mcp-docs] {message}")
    else:
        output_result("continue", f"[mcp-docs] WARNING: {message}")
```

**Why "continue" (advisory)?**
- Per #485 patterns: blocking decisions reserved for critical safety issues
- Documentation validation failures shouldn't block commits
- User sees warning in hook output but can override if needed
- Aligns with existing hook philosophy (auto_linter, context_builder)

### 3. Claude Code Hook Configuration Impacts

#### MCP Configuration in `.mcp.json`

Current state:
```json
{
  "mcpServers": {
    "kotadb-staging": {
      "type": "http",
      "url": "https://kotadb-staging.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer kota_solo_..."
      }
    }
  }
}
```

**Issue #465 Impact**:
- This HTTP transport config is **incomplete**
- Missing `Accept`, `MCP-Protocol-Version`, `Origin` headers
- Claude Code client will fail with 406 error

#### Required Header Configuration

```json
{
  "mcpServers": {
    "kotadb-staging": {
      "type": "http",
      "url": "https://kotadb-staging.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer kota_solo_...",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        "Origin": "https://claude.ai"
      }
    }
  }
}
```

**Hook Opportunity**: Validate `.mcp.json` structure

```python
# .claude/hooks/mcp_config_validator.py
# PostToolUse hook for .mcp.json changes

REQUIRED_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
}

def validate_mcp_config(config_path: str) -> tuple[bool, str]:
    """Validate .mcp.json header completeness."""
    with open(config_path) as f:
        config = json.load(f)

    issues = []
    for server_name, server_config in config.get("mcpServers", {}).items():
        if server_config.get("type") == "http":
            headers = server_config.get("headers", {})
            for header, value in REQUIRED_HEADERS.items():
                if header not in headers:
                    issues.append(f"{server_name}: Missing '{header}' header")
                elif headers[header] != value and header != "Authorization":
                    issues.append(f"{server_name}: {header} = {headers[header]} (expected {value})")

    return (True, "Valid") if not issues else (False, "; ".join(issues))
```

#### Claude Code Settings Impact

**Current hooks in `.claude/settings.json`**:
```json
{
  "hooks": {
    "PostToolUse": [...],
    "UserPromptSubmit": [...]
  }
}
```

**Recommended additions**:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {"type": "command", "command": "python3 ...", "timeout": 45000},
          // NEW: MCP docs validation
          {"matcher": "**/mcp*.md", "type": "command", ...},
          // NEW: .mcp.json validation
          {"matcher": ".mcp.json", "type": "command", ...}
        ]
      }
    ]
  }
}
```

**Impact on Claude Code Behavior**:
1. User creates/edits `.mcp.json`
2. PostToolUse hook validates structure
3. Hook suggests missing headers
4. User fixes config before testing
5. Prevents 406 errors from incomplete config

### 4. Automation Opportunities for Validation

#### Opportunity 1: MCP Client Config Generator

**Type**: UserPromptSubmit hook
**Trigger**: Keywords: "mcp", "http", "transport"
**Purpose**: Provide client config template when user mentions MCP setup

```python
# .claude/hooks/mcp_config_generator.py
# UserPromptSubmit hook

CONTEXT_SUGGESTIONS = {
    "mcp": [
        "Run: python3 $CLAUDE_PROJECT_DIR/.claude/tools/generate_mcp_config.py",
        "See /docs:mcp-usage-guidance for MCP transport decision matrix",
        "Ensure Accept header includes both 'application/json, text/event-stream'"
    ]
}
```

#### Opportunity 2: Accept Header Linting

**Type**: PostToolUse on TypeScript/JavaScript files
**Purpose**: Detect hardcoded fetch/axios calls with incomplete Accept headers

```python
def lint_accept_headers(file_path: str) -> list[str]:
    """Find fetch/axios calls with incomplete Accept headers."""
    if not is_js_ts_file(file_path):
        return []

    with open(file_path) as f:
        content = f.read()

    issues = []

    # Pattern: fetch or axios with Accept header
    for match in re.finditer(
        r'(fetch|axios\.(?:get|post))\([^)]*Accept[\'"]?:\s*[\'"]([^\'"]+)[\'"]',
        content
    ):
        method, accept = match.groups()
        if 'application/json' in accept and 'text/event-stream' not in accept:
            issues.append(
                f"{method}() call missing 'text/event-stream' in Accept header"
            )

    return issues
```

#### Opportunity 3: Automated Test Header Updates

**Type**: PreToolUse on test file creation
**Purpose**: Inject correct MCP headers into test templates

```python
def inject_mcp_headers(content: str) -> str:
    """Add proper MCP headers to test code."""
    if 'mcp' not in content.lower():
        return content

    headers_template = """{
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      "Origin": "http://localhost",
      "Authorization": "Bearer YOUR_API_KEY"
    }"""

    return content.replace(
        '// TODO: Add MCP headers',
        f'// MCP headers:\n{headers_template}'
    )
```

#### Opportunity 4: MCP Configuration Validation CLI Tool

**Type**: Standalone validation (not hook)
**Command**: `.claude/tools/validate_mcp_config.py`
**Usage**: Run in CI/CD to validate all MCP client configs

```bash
python3 $CLAUDE_PROJECT_DIR/.claude/tools/validate_mcp_config.py \
  --config .mcp.json \
  --sdk-version 1.20.0 \
  --protocol-version "2025-06-18"
```

### 5. Hook-Based Documentation Linting

#### Current Documentation State

**Primary References**:
- `app/docs/mcp-sdk-migration.md` (730+ lines, comprehensive)
- `.mcp.json` (configuration example)
- `CLAUDE.md` (project navigation)

**Risk**: Documentation can become stale as code evolves

#### Documentation Linting Hook

**Type**: PostToolUse on documentation changes
**Matcher**: `*.md` files in `app/docs/` directory

```python
def lint_mcp_documentation(file_path: str) -> list[str]:
    """Validate MCP documentation against SDK implementation."""
    if not file_path.endswith('.md') or 'mcp' not in file_path.lower():
        return []

    with open(file_path) as f:
        lines = f.readlines()

    issues = []
    current_section = ""

    for i, line in enumerate(lines, 1):
        # Track sections
        if line.startswith('#'):
            current_section = line.strip()

        # Check 1: Code block MCP examples
        if '```typescript' in line or '```json' in line:
            # Extract code block
            code_block = []
            j = i
            while j < len(lines) and not lines[j].strip().startswith('```'):
                code_block.append(lines[j])
                j += 1

            code_text = ''.join(code_block)

            # Validate if it's MCP-related
            if 'mcp' in code_text.lower() or 'Accept' in code_text:
                if 'Accept' in code_text:
                    if 'text/event-stream' not in code_text:
                        issues.append(
                            f"Line {i} [{current_section}]: "
                            f"Accept header missing 'text/event-stream'"
                        )

        # Check 2: No "TODO" in MCP documentation
        if 'TODO' in line and current_section:
            issues.append(f"Line {i} [{current_section}]: Unresolved TODO comment")

        # Check 3: Version references
        if 'protocol' in line.lower() and '2025' in line:
            if '2025-06-18' not in line and '2025-' in line:
                issues.append(
                    f"Line {i}: MCP protocol version may be outdated"
                )

    return issues
```

**Configuration**:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "matcher": "**/mcp*.md",
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/mcp_docs_linter.py",
            "timeout": 20000
          }
        ]
      }
    ]
  }
}
```

---

## Recommendations Summary

### Priority 1: Critical (Implement Immediately)

**1.1: Validate `.mcp.json` on Edit**
- **Recommendation**: Create `.claude/hooks/mcp_config_validator.py`
- **Rationale**: Prevents incomplete configurations that cause 406 errors
- **Effort**: Low (50 lines)
- **Impact**: HIGH - Catches config errors before they propagate
- **Pattern**: Follows established hook pattern from #485

```python
# Hook validates:
# - HTTP transport configs include Accept header
# - MCP-Protocol-Version specified
# - No malformed Authorization headers
# - Protocol version matches SDK version
```

**1.2: Update Documentation Examples**
- **Recommendation**: Add header validation to `mcp-sdk-migration.md`
- **Rationale**: Prevents new clients from referencing incomplete examples
- **Effort**: Medium (review all 730 lines, update 5-10 code blocks)
- **Impact**: MEDIUM - Reduces user confusion

### Priority 2: High (Implement This Sprint)

**2.1: MCP Documentation Linting Hook**
- **Recommendation**: `.claude/hooks/mcp_docs_linter.py`
- **Rationale**: Catches stale examples as documentation evolves
- **Effort**: Medium (100 lines, regex patterns)
- **Impact**: MEDIUM - Prevents future documentation drift

**2.2: Context Builder Enhancement**
- **Recommendation**: Add MCP to keyword suggestions in `context_builder.py`
- **Rationale**: When user asks about MCP, suggest relevant docs
- **Effort**: Low (5 lines in CONTEXT_SUGGESTIONS dict)
- **Impact**: LOW - Nice-to-have UX improvement

```python
CONTEXT_SUGGESTIONS = {
    "mcp": [
        "See /docs:mcp-integration for MCP server architecture",
        "See /docs:mcp-usage-guidance for decision matrix",
        "Ensure Accept header includes 'text/event-stream'",  # NEW
    ],
}
```

### Priority 3: Medium (Plan for Next Sprint)

**3.1: MCP Client Config Generator**
- **Recommendation**: `.claude/tools/generate_mcp_config.py`
- **Rationale**: Automate correct client config generation
- **Effort**: High (200 lines, template engine)
- **Impact**: LOW-MEDIUM - Quality-of-life tool

**3.2: Accept Header Linting**
- **Recommendation**: PostToolUse hook for TypeScript/JavaScript files
- **Rationale**: Catch hardcoded fetch calls with wrong headers
- **Effort**: High (regex patterns, false positive handling)
- **Impact**: LOW - Edge case scenario

---

## Risk Assessment

### High Risks

**Risk 1: Hook Timeout on Large Documentation Files**
- **Severity**: HIGH
- **Scenario**: MCP docs grow to 1000+ lines, linting takes > 20s
- **Mitigation**:
  - Set timeout to 25000ms
  - Implement early exit for non-MCP files
  - Use incremental validation (only check changed lines)
- **Ownership**: CC Hook Expert validation

**Risk 2: False Positives in Accept Header Detection**
- **Severity**: MEDIUM
- **Scenario**: Comment containing "Accept: application/json" flagged as code
- **Mitigation**:
  - Exclude lines starting with `//` or `#`
  - Only match within fetch/axios calls
  - Require `text/event-stream` only in real HTTP headers
- **Ownership**: Hook maintainer

### Medium Risks

**Risk 3: Regex Patterns Break with Formatting**
- **Severity**: MEDIUM
- **Scenario**: Multi-line fetch calls, different quote styles
- **Mitigation**:
  - Use AST-based parsing for TypeScript files
  - Test patterns against real codebase
  - Keep patterns simple and broad
- **Ownership**: Hook testing

**Risk 4: Documentation Examples Become Stale**
- **Severity**: MEDIUM
- **Scenario**: SDK updates to new protocol version, docs not updated
- **Mitigation**:
  - Add CI check to validate MCP protocol version against installed SDK
  - Document version update process in CONTRIBUTING.md
  - Add CHANGELOG entry when protocol version changes
- **Ownership**: Release process

### Low Risks

**Risk 5: Hook Performance Impact**
- **Severity**: LOW
- **Scenario**: Multiple hooks on same file (auto_linter + mcp_validator)
- **Mitigation**:
  - Both hooks have separate matchers (linter: .ts/js, mcp_validator: .md/.json)
  - Timeouts are independent (45s + 20s max total)
  - Hooks run sequentially, acceptable delays
- **Ownership**: System design

---

## Implementation Checklist

### Phase 1: Documentation & Config Validation (Week 1)

- [ ] Create `.claude/hooks/mcp_config_validator.py`
  - [ ] Validate Accept header presence
  - [ ] Validate MCP-Protocol-Version
  - [ ] Test with `.mcp.json` examples
  - [ ] Add error messages to additionalContext
- [ ] Update `.claude/settings.json` with new hook
  - [ ] Add `.mcp.json` matcher
  - [ ] Set timeout to 15000ms
  - [ ] Test hook execution
- [ ] Review `app/docs/mcp-sdk-migration.md` examples
  - [ ] Mark incomplete examples
  - [ ] Update code blocks with full headers
  - [ ] Add section on "Common Configuration Errors"

### Phase 2: Linting & Enhancement (Week 2)

- [ ] Create `.claude/hooks/mcp_docs_linter.py`
  - [ ] Implement Accept header validation
  - [ ] Implement protocol version checking
  - [ ] Handle code block extraction
  - [ ] Test with real documentation
- [ ] Update `context_builder.py`
  - [ ] Add MCP keyword with proper suggestions
  - [ ] Test keyword detection
- [ ] Update `.claude/settings.json`
  - [ ] Add documentation linting hook
  - [ ] Set appropriate timeout

### Phase 3: Testing & Validation (Week 3)

- [ ] Write tests for all validation hooks
  - [ ] Test valid configurations
  - [ ] Test invalid configurations
  - [ ] Test edge cases (empty headers, missing fields)
- [ ] Run hooks on real files
  - [ ] `.mcp.json`
  - [ ] `app/docs/mcp-sdk-migration.md`
  - [ ] Sample client configs
- [ ] Update pre-commit hook documentation
  - [ ] Document new validations
  - [ ] Add troubleshooting guide

### Phase 4: Automation & Polish (Week 4)

- [ ] Create `.claude/tools/generate_mcp_config.py`
  - [ ] Template for HTTP transport
  - [ ] Template for stdio transport
  - [ ] Validation integration
- [ ] Add CI validation
  - [ ] MCP config linting in GitHub Actions
  - [ ] Protocol version consistency check
- [ ] Update CONTRIBUTING.md
  - [ ] Document MCP client config guidelines
  - [ ] Add examples with correct headers

---

## Pattern Compliance Summary

### ✅ Established Patterns Being Followed

1. **JSON I/O Pattern** (from #485)
   - All hooks use `sys.stdout.write()`, never `print()`
   - All hooks use `sys.stdout.flush()` after write
   - All hooks return JSON with "decision" + optional "additionalContext"
   - ✅ **Compliance**: 100%

2. **Advisory vs Blocking Decision** (from #485)
   - Both new hooks use `"continue"` decision (advisory)
   - No blocking for non-critical validation
   - Users can override hook warnings
   - ✅ **Compliance**: 100%

3. **Timeout Configuration** (from #485)
   - PostToolUse hooks: 45-50 seconds maximum
   - UserPromptSubmit hooks: 10 seconds maximum
   - New hooks follow these ranges
   - ✅ **Compliance**: 100%

4. **Error Handling** (from #485)
   - Handle subprocess timeouts gracefully
   - Handle FileNotFoundError (tool not in PATH)
   - Return generic Exception messages
   - Never call `sys.exit()` with non-zero code
   - ✅ **Compliance**: 100%

5. **File Detection** (from #485)
   - Use `CLAUDE_PROJECT_DIR` environment variable
   - Check file paths before operations
   - Handle relative and absolute paths
   - ✅ **Compliance**: 100%

### 🟡 New Patterns Being Introduced

1. **Multi-Matcher Hook Configuration**
   - Each matcher has independent hook list
   - Allows granular control per file type
   - Introduces complexity in settings.json
   - **Recommendation**: Document clearly in settings.json

2. **Documentation Linting in Hooks**
   - First hook to validate non-code files (.md, .json)
   - Introduces regex complexity for validation
   - **Recommendation**: Start simple, expand gradually

---

## Documentation Requirements

### New Documentation to Create

**1. `.claude/commands/docs/mcp-config-guidelines.md`**
- Purpose: Client configuration best practices
- Content:
  - Required headers and their purpose
  - Common errors and fixes (406, timeouts, etc.)
  - Template configurations
  - Validation checklist

**2. `.claude/hooks/README.md`**
- Purpose: Hook documentation and maintenance
- Content:
  - Hook inventory
  - When each hook runs
  - Configuration examples
  - Troubleshooting common hook issues

**3. Update: `CONTRIBUTING.md`**
- Add section: "MCP Configuration Guidelines"
- Add section: "Hook Development Standards"
- Add checklist: "Before Submitting MCP-Related PRs"

### Documentation to Update

**1. `app/docs/mcp-sdk-migration.md`**
- Add: "Common Client Errors" section
- Add: Checklist for client configuration
- Update: All code examples to show complete headers
- Add: Troubleshooting section reference

**2. `CLAUDE.md`**
- Add: MCP configuration reference
- Add: When to use which transport type
- Update: Related Resources section

**3. `.claude/settings.json`**
- Add: Comments explaining each hook
- Add: Examples of hook output
- Document: Matcher syntax and precedence

---

## Claude Code Integration Points

### Hook Lifecycle for Issue #465

1. **User edits `.mcp.json`** (Write tool)
   ↓
2. **PostToolUse hook triggers** (.mcp.json matcher)
   ↓
3. **`mcp_config_validator.py` runs**
   - Reads .mcp.json
   - Validates headers
   - Returns "continue" + additionalContext
   ↓
4. **User sees validation feedback** in Claude Code UI
   ↓
5. **User fixes config** if needed
   ↓
6. **No 406 errors** when testing client

### Configuration Location Impact

| File | Component | Impact | Priority |
|------|-----------|--------|----------|
| `.mcp.json` | Server configs | 🔴 Critical | HIGH |
| `.claude/settings.json` | Hook definitions | 🟠 Important | HIGH |
| `app/docs/mcp-sdk-migration.md` | Examples | 🟠 Important | MEDIUM |
| `.claude/hooks/*.py` | Validation logic | 🟢 Supporting | MEDIUM |
| `CONTRIBUTING.md` | Guidelines | 🟢 Supporting | LOW |

---

## Success Criteria

### Immediate (After Implementation)

1. ✅ Users cannot commit invalid `.mcp.json` without warning
2. ✅ All MCP documentation examples include complete headers
3. ✅ New users can copy/paste examples and connect without 406 errors
4. ✅ All hooks comply with logging standards (sys.stdout, no print())
5. ✅ Tests pass for all new hook implementations

### Medium-term (End of Sprint)

1. ✅ Zero reported 406 errors from incomplete client config
2. ✅ MCP documentation linting prevents future drift
3. ✅ CI validates all MCP configurations on merge
4. ✅ Hook documentation is complete and maintained
5. ✅ Context builder suggests MCP docs when relevant

### Long-term (Continuous)

1. ✅ Hooks adapt automatically when SDK version updates
2. ✅ New hook patterns can be applied to other protocols
3. ✅ Documentation stays in sync with implementation
4. ✅ Pre-commit hooks catch configuration errors early
5. ✅ Zero documentation-related regressions in issues

---

## Appendix: Hook Code Templates

### Template 1: Configuration Validator

```python
#!/usr/bin/env python3
"""
PostToolUse hook for validating MCP client configuration.

Triggers when .mcp.json is edited.
Validates HTTP transport header completeness.
"""

import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hooks.utils.hook_helpers import (
    output_result,
    read_hook_input,
    get_file_path_from_input,
)

REQUIRED_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
}

def validate_mcp_config(config_path: str) -> tuple[bool, str]:
    """Validate .mcp.json header completeness."""
    try:
        with open(config_path) as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON: {e}"

    issues = []

    for server_name, server_config in config.get("mcpServers", {}).items():
        if server_config.get("type") == "http":
            headers = server_config.get("headers", {})

            for header, expected_value in REQUIRED_HEADERS.items():
                if header not in headers:
                    issues.append(
                        f"{server_name}: Missing '{header}' header"
                    )
                elif header == "Accept":
                    actual = headers[header]
                    if not ("application/json" in actual and "text/event-stream" in actual):
                        issues.append(
                            f"{server_name}: Accept header incomplete "
                            f"(got '{actual}', need both JSON and SSE)"
                        )

    if issues:
        return False, "; ".join(issues)
    return True, "MCP config validation passed"

def main() -> None:
    """Main entry point."""
    hook_input = read_hook_input()
    file_path = get_file_path_from_input(hook_input)

    if not file_path or not file_path.endswith(".mcp.json"):
        output_result("continue")
        return

    if not os.path.exists(file_path):
        output_result("continue", f"File not found: {file_path}")
        return

    success, message = validate_mcp_config(file_path)

    if success:
        output_result("continue", f"[mcp-config] {message}")
    else:
        output_result("continue", f"[mcp-config] ⚠️  {message}")

if __name__ == "__main__":
    main()
```

### Template 2: Documentation Linter

```python
#!/usr/bin/env python3
"""
PostToolUse hook for linting MCP documentation.

Triggers when **/mcp*.md files are edited.
Validates code examples and references.
"""

import os
import re
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hooks.utils.hook_helpers import (
    output_result,
    read_hook_input,
    get_file_path_from_input,
)

def validate_mcp_docs(file_path: str) -> tuple[bool, list[str]]:
    """Validate MCP documentation structure and examples."""
    with open(file_path) as f:
        content = f.read()
        lines = content.split('\n')

    issues = []

    # Check 1: Accept header completeness in code blocks
    in_code_block = False
    block_start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith('```'):
            if not in_code_block:
                in_code_block = True
                block_start = i
            else:
                in_code_block = False

        if in_code_block and 'Accept' in line and 'text/event-stream' not in content[content.find(lines[block_start]):content.find(line)]:
            if 'application/json' in line:
                issues.append(
                    f"Line {i+1}: Accept header missing 'text/event-stream'"
                )

    # Check 2: Protocol version consistency
    versions = set()
    for match in re.finditer(r'2025-\d{2}-\d{2}', content):
        versions.add(match.group(0))

    if len(versions) > 1:
        issues.append(f"Multiple protocol versions found: {versions}")

    # Check 3: No unresolved TODOs
    for i, line in enumerate(lines):
        if 'TODO' in line and 'MCP' in content[max(0, i-100):min(len(content), i+100)]:
            issues.append(f"Line {i+1}: Unresolved TODO in MCP documentation")

    return (True, []) if not issues else (False, issues)

def main() -> None:
    """Main entry point."""
    hook_input = read_hook_input()
    file_path = get_file_path_from_input(hook_input)

    if not file_path or not (file_path.endswith('.md') and 'mcp' in file_path.lower()):
        output_result("continue")
        return

    if not os.path.exists(file_path):
        output_result("continue")
        return

    success, issues = validate_mcp_docs(file_path)

    if success:
        output_result("continue", "[mcp-docs] Validation passed")
    else:
        message = "[mcp-docs] Issues found:\n" + "\n".join(f"  - {i}" for i in issues)
        output_result("continue", message)

if __name__ == "__main__":
    main()
```

---

## Summary

**Issue #465** reveals a critical alignment between:
1. **MCP SDK requirements** (Accept header completeness)
2. **Claude Code configuration** (.mcp.json structure)
3. **Pre-commit hook validation** (catch errors before they propagate)
4. **Logging standards compliance** (use sys.stdout.write consistently)
5. **Documentation accuracy** (examples reflect actual requirements)

By implementing the recommended hooks and validation:
- ✅ Users cannot commit broken configurations
- ✅ Documentation stays accurate and up-to-date
- ✅ New users get working examples on first try
- ✅ 406 errors become preventable class of issues
- ✅ Hook infrastructure grows more robust

**Recommended Start**: Priority 1.1 (`.mcp.json` validator) - low effort, high impact, prevents configuration errors at source.

