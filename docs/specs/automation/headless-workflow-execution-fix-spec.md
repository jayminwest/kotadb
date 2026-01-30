# Headless Workflow Execution Fix Specification

**Created**: 2026-01-30  
**Domain**: automation  
**Issue**: File operations don't persist and AskUserQuestion fails in headless mode  
**Status**: Implementation Ready

---

## Executive Summary

The automation workflow currently fails to persist file operations and crashes on approval gates because it inherits `.claude/settings.json` permissions that deny Write/Edit tools and attempts to use the interactive AskUserQuestion tool. This spec defines changes to bypass project settings and implement a direct multi-agent orchestration strategy that replaces the `/do` command's approval-gated workflow.

---

## Problem Analysis

### Root Causes

1. **Settings Inheritance**: The SDK's `query()` function loads `.claude/settings.json` by default, which explicitly denies Write and Edit tools
2. **Interactive Tool Usage**: The `/do` command uses AskUserQuestion for approval gates, which requires human interaction
3. **Approval Gates**: The plan-build-improve cycle has user approval between plan and build phases

### Current Behavior

```typescript
// automation/src/workflow.ts - Current implementation
const options = {
  maxTurns: 100,
  cwd: projectRoot,
  permissionMode: "bypassPermissions" as const,
  mcpServers: { /* ... */ }
  // MISSING: settingSources: [] to prevent loading .claude/settings.json
};

const prompt = `/do #${issueNumber}`;  // Uses /do command with approval gates
```

**Problems:**
- `.claude/settings.json` denies Write/Edit despite `permissionMode: "bypassPermissions"`
- `/do` command invokes AskUserQuestion for plan approval
- AskUserQuestion fails in headless automation context

### Expected Behavior

The automation workflow should:
- Bypass all project settings that restrict file operations
- Orchestrate agents directly without approval gates
- Execute the full plan-build-improve cycle automatically
- Handle errors gracefully without requiring human intervention

---

## Solution Design

### Architecture Changes

Replace the single `/do` invocation with a **multi-phase direct orchestration strategy** that:

1. **Bypasses project settings** via `settingSources: []` SDK option
2. **Analyzes the issue** using github-question-agent
3. **Determines expert domain** from analysis response
4. **Orchestrates agents directly** (plan -> build -> improve)
5. **Skips approval gates** (headless execution mode)

### SDK Configuration Update

```typescript
// Add settingSources to SDK options
const options = {
  maxTurns: 100,
  cwd: projectRoot,
  permissionMode: "bypassPermissions" as const,
  settingSources: [],  // NEW: Prevent loading .claude/settings.json
  mcpServers: {
    kotadb: {
      type: "stdio" as const,
      command: "bunx",
      args: ["--bun", "kotadb"],
      env: { KOTADB_CWD: projectRoot }
    }
  }
};
```

**Why This Works:**
- `settingSources: []` tells the SDK to ignore all project settings files
- File operation tools (Write, Edit) become available
- Permission bypass remains active via `permissionMode: "bypassPermissions"`

### Multi-Agent Orchestration Strategy

```typescript
// Phase 1: Issue Analysis
const analysisPrompt = `
QUESTION: Analyze GitHub issue #${issueNumber} and determine:
1. Issue type (feature/bug/chore/refactor)
2. Expert domain (claude-config/agent-authoring/database/api/testing/indexer/github)
3. Key requirements
4. Recommended approach

Provide structured analysis for automation orchestration.
`;

// Run github-question-agent
const analysisResult = await query({ 
  prompt: analysisPrompt, 
  options 
});

// Phase 2: Parse Analysis
const { domain, requirements } = parseAnalysisOutput(analysisResult);

// Phase 3: Plan
const planPrompt = `
USER_PROMPT: ${requirements}

AUTOMATION_MODE: true
HUMAN_IN_LOOP: false

Create a detailed specification for this ${domain} task.
Save spec to: docs/specs/${domain}/<descriptive-name>-spec.md
Return the spec path when complete.
`;

const planResult = await query({ 
  prompt: planPrompt, 
  options 
});

const specPath = extractSpecPath(planResult);

// Phase 4: Build (NO APPROVAL GATE)
const buildPrompt = `
PATH_TO_SPEC: ${specPath}

AUTOMATION_MODE: true

Read the specification and implement the changes.
Report files modified when complete.
`;

const buildResult = await query({ 
  prompt: buildPrompt, 
  options 
});

// Phase 5: Improve (Optional, non-blocking)
const improvePrompt = `
AUTOMATION_MODE: true

Review recent ${domain} changes and update expert knowledge.
Analyze git history, extract learnings, update expertise.yaml
`;

try {
  const improveResult = await query({ 
    prompt: improvePrompt, 
    options 
  });
} catch (error) {
  logger.logError("improve_phase", error);
  // Continue - improve is optional
}
```

### Prompt Strategy Changes

**OLD (via /do command):**
```typescript
const prompt = dryRun 
  ? `/do #${issueNumber} --dry-run`
  : `/do #${issueNumber}`;
```

**NEW (direct orchestration):**
```typescript
// Phase-specific prompts with explicit agent instructions
// No /do command, no approval gates
// Direct agent invocation with AUTOMATION_MODE flags
```

---

## Implementation Plan

### 1. Module Structure

**Files to Modify:**
- `automation/src/workflow.ts` - Core orchestration logic
- `automation/src/index.ts` - CLI flags and result reporting

**New Modules:**
- `automation/src/orchestrator.ts` - Multi-phase workflow orchestration
- `automation/src/parser.ts` - Analysis output parsing

### 2. Orchestrator Module

```typescript
// automation/src/orchestrator.ts

import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import type { WorkflowLogger } from "./logger.ts";

export interface OrchestrationResult {
  domain: string;
  specPath: string | null;
  filesModified: string[];
  improveStatus: "success" | "failed" | "skipped";
}

export interface OrchestrationOptions {
  issueNumber: number;
  projectRoot: string;
  logger: WorkflowLogger;
  dryRun: boolean;
}

/**
 * Multi-phase workflow orchestration
 * Bypasses /do command and approval gates for headless execution
 */
export async function orchestrateWorkflow(
  opts: OrchestrationOptions
): Promise<OrchestrationResult> {
  const { issueNumber, projectRoot, logger, dryRun } = opts;

  // SDK options with settingSources: [] to bypass .claude/settings.json
  const sdkOptions = {
    maxTurns: 100,
    cwd: projectRoot,
    permissionMode: "bypassPermissions" as const,
    settingSources: [],  // Critical: prevents loading project settings
    mcpServers: {
      kotadb: {
        type: "stdio" as const,
        command: "bunx",
        args: ["--bun", "kotadb"],
        env: { KOTADB_CWD: projectRoot }
      }
    }
  };

  // Phase 1: Analyze Issue
  logger.logEvent("PHASE_START", { phase: "analysis" });
  const analysisResult = await analyzeIssue(issueNumber, sdkOptions, logger);
  const { domain, requirements } = parseAnalysis(analysisResult);
  logger.logEvent("PHASE_COMPLETE", { phase: "analysis", domain });

  // Phase 2: Plan
  logger.logEvent("PHASE_START", { phase: "plan", domain });
  const specPath = await executePlan(domain, requirements, sdkOptions, logger, dryRun);
  logger.logEvent("PHASE_COMPLETE", { phase: "plan", spec_path: specPath });

  // Phase 3: Build
  logger.logEvent("PHASE_START", { phase: "build", domain });
  const filesModified = await executeBuild(domain, specPath, sdkOptions, logger, dryRun);
  logger.logEvent("PHASE_COMPLETE", { phase: "build", files_count: filesModified.length });

  // Phase 4: Improve (optional)
  logger.logEvent("PHASE_START", { phase: "improve", domain });
  let improveStatus: "success" | "failed" | "skipped" = "success";
  try {
    if (!dryRun) {
      await executeImprove(domain, sdkOptions, logger);
    } else {
      improveStatus = "skipped";
    }
  } catch (error) {
    logger.logError("improve_phase", error);
    improveStatus = "failed";
  }
  logger.logEvent("PHASE_COMPLETE", { phase: "improve", status: improveStatus });

  return {
    domain,
    specPath,
    filesModified,
    improveStatus
  };
}

async function analyzeIssue(
  issueNumber: number,
  options: any,
  logger: WorkflowLogger
): Promise<string> {
  const prompt = `
You are analyzing GitHub issue #${issueNumber} for automation orchestration.

TASK: Provide structured analysis with:
1. Issue type (feature/bug/chore/refactor)
2. Expert domain (claude-config/agent-authoring/database/api/testing/indexer/github/automation)
3. Core requirements (bullet points)
4. Recommended approach

FORMAT:
## Issue Analysis
**Type**: <type>
**Domain**: <domain>
**Requirements**:
- <requirement 1>
- <requirement 2>
- ...

**Approach**: <recommended strategy>

Use github-question-agent expertise to analyze the issue.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }

  // Extract text from final assistant message
  return extractTextFromMessages(messages);
}

async function executePlan(
  domain: string,
  requirements: string,
  options: any,
  logger: WorkflowLogger,
  dryRun: boolean
): Promise<string> {
  const prompt = `
You are the ${domain}-plan-agent.

USER_PROMPT: ${requirements}

AUTOMATION_MODE: true
HUMAN_IN_LOOP: false
${dryRun ? "DRY_RUN: true" : ""}

Create a detailed specification following ${domain} domain standards.
Save spec to: docs/specs/${domain}/<descriptive-slug>-spec.md

Return the absolute spec path when complete.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }

  const output = extractTextFromMessages(messages);
  return extractSpecPath(output);
}

async function executeBuild(
  domain: string,
  specPath: string,
  options: any,
  logger: WorkflowLogger,
  dryRun: boolean
): Promise<string[]> {
  const prompt = `
You are the ${domain}-build-agent.

PATH_TO_SPEC: ${specPath}

AUTOMATION_MODE: true
${dryRun ? "DRY_RUN: true (validate only, no file writes)" : ""}

Read the specification and implement the changes.
Report absolute file paths for all files modified.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }

  const output = extractTextFromMessages(messages);
  return extractFilePaths(output);
}

async function executeImprove(
  domain: string,
  options: any,
  logger: WorkflowLogger
): Promise<void> {
  const prompt = `
You are the ${domain}-improve-agent.

AUTOMATION_MODE: true

Review recent ${domain} changes from git history.
Extract learnings and update expertise.yaml with new patterns.
`;

  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options })) {
    messages.push(message);
    logger.addMessage(message);
  }
}

// Helper functions
function extractTextFromMessages(messages: SDKMessage[]): string {
  // Implementation: extract text blocks from assistant messages
  // ...
}

function parseAnalysis(text: string): { domain: string; requirements: string } {
  // Implementation: parse structured analysis output
  // ...
}

function extractSpecPath(text: string): string {
  // Implementation: extract spec file path from output
  // ...
}

function extractFilePaths(text: string): string[] {
  // Implementation: extract list of modified files
  // ...
}
```

### 3. Parser Module

```typescript
// automation/src/parser.ts

/**
 * Parse github-question-agent analysis output
 */
export function parseAnalysis(output: string): {
  domain: string;
  requirements: string;
  issueType: string;
} {
  const domainMatch = output.match(/\*\*Domain\*\*:\s*(\S+)/);
  const typeMatch = output.match(/\*\*Type\*\*:\s*(\S+)/);
  
  // Extract requirements section
  const reqMatch = output.match(/\*\*Requirements\*\*:\s*([\s\S]*?)(?=\*\*|$)/);
  
  return {
    domain: domainMatch?.[1] || "unknown",
    requirements: reqMatch?.[1]?.trim() || output,
    issueType: typeMatch?.[1] || "unknown"
  };
}

/**
 * Extract spec path from plan-agent output
 */
export function extractSpecPath(output: string): string {
  // Match absolute paths to markdown files in docs/specs/
  const pathPattern = /\/[^\s]+\/docs\/specs\/[^\s]+\.md/;
  const match = output.match(pathPattern);
  
  if (!match) {
    throw new Error("Spec path not found in plan-agent output");
  }
  
  return match[0];
}

/**
 * Extract modified file paths from build-agent output
 */
export function extractFilePaths(output: string): string[] {
  // Match absolute paths
  const pathPattern = /\/[^\s]+\.(ts|js|md|yaml|json)/g;
  const matches = output.match(pathPattern);
  
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Extract text content from SDK messages
 */
export function extractTextFromMessages(messages: SDKMessage[]): string {
  const textBlocks: string[] = [];
  
  for (const message of messages) {
    if (message.type === "assistant") {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            textBlocks.push(block.text);
          }
        }
      }
    }
  }
  
  return textBlocks.join("\n\n");
}
```

### 4. Workflow.ts Updates

```typescript
// automation/src/workflow.ts - Updated

import { orchestrateWorkflow } from "./orchestrator.ts";
import { WorkflowLogger } from "./logger.ts";

export async function runWorkflow(
  issueNumber: number,
  dryRun = false
): Promise<WorkflowResult> {
  const projectRoot = getProjectRoot();
  const logger = new WorkflowLogger({ issueNumber, dryRun, projectRoot });
  
  const result: WorkflowResult = {
    success: false,
    sessionId: null,
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    prUrl: null,
    errorMessage: null,
    logDir: null,
  };

  try {
    logger.initialize();
    logger.logEvent("WORKFLOW_START", { issue_number: issueNumber, dry_run: dryRun });
    
    const startTime = performance.now();

    // NEW: Use orchestrator instead of single /do invocation
    const orchResult = await orchestrateWorkflow({
      issueNumber,
      projectRoot,
      logger,
      dryRun
    });

    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);

    // Extract metrics from logger
    const { inputTokens, outputTokens, totalCostUsd } = logger.getMetrics();
    
    result.success = true;
    result.inputTokens = inputTokens;
    result.outputTokens = outputTokens;
    result.totalCostUsd = totalCostUsd;
    result.logDir = logger.getLogDir();
    
    logger.logEvent("WORKFLOW_COMPLETE", {
      success: true,
      duration_ms: durationMs,
      domain: orchResult.domain,
      files_modified: orchResult.filesModified.length
    });
    
  } catch (error) {
    result.success = false;
    result.errorMessage = error instanceof Error ? error.message : String(error);
    logger.logError("workflow_execution", error instanceof Error ? error : new Error(String(error)));
    result.logDir = logger.getLogDir();
  }

  return result;
}
```

### 5. Logger Updates

```typescript
// automation/src/logger.ts - Add metrics tracking

export class WorkflowLogger {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  
  addMessage(message: SDKMessage): void {
    this.messages.push(message);
    
    // Track usage from result messages
    if (message.type === "result") {
      this.totalInputTokens += message.usage.input_tokens;
      this.totalOutputTokens += message.usage.output_tokens;
      this.totalCostUsd += message.total_cost_usd;
    }
    
    // ... existing logging code
  }
  
  getMetrics(): {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
  } {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalCostUsd: this.totalCostUsd
    };
  }
}
```

---

## Technical Details

### SDK Option: settingSources

**Purpose**: Control which settings files the SDK loads

**Default Behavior**:
```typescript
// By default, SDK loads:
// 1. Global settings (~/.claude/settings.json)
// 2. Project settings (<project>/.claude/settings.json)
```

**Override Behavior**:
```typescript
// Empty array = load NO settings files
settingSources: []

// This makes permissionMode: "bypassPermissions" effective
// File operation tools become available
```

**Why It's Critical**:
- `.claude/settings.json` explicitly denies Write and Edit
- Even with `permissionMode: "bypassPermissions"`, settings override it
- `settingSources: []` prevents loading the deny list entirely

### Agent Prompt Format

**Key Flags for Headless Mode**:
```typescript
const prompt = `
You are the <domain>-<stage>-agent.

USER_PROMPT: <requirements>

AUTOMATION_MODE: true        // Signals headless execution
HUMAN_IN_LOOP: false         // Disable approval prompts
DRY_RUN: <true/false>        // Optional: validate only

<Stage-specific instructions>
`;
```

**AUTOMATION_MODE Flag**:
- Tells agent to skip interactive features
- No AskUserQuestion calls
- No approval wait states
- Proceed directly through workflow

**HUMAN_IN_LOOP Flag**:
- Explicitly disables approval gates
- Plan agents proceed to implementation specs
- Build agents execute without confirmation

### Multi-Phase Execution Flow

```
┌─────────────────────────────────────────────────────┐
│ Issue #N                                             │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│ Phase 1: Analyze Issue                               │
│ - Use github-question-agent                          │
│ - Determine domain and requirements                  │
│ - Output: { domain, requirements, issueType }        │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│ Phase 2: Plan                                        │
│ - Invoke {domain}-plan-agent                         │
│ - Pass requirements + AUTOMATION_MODE                │
│ - Output: spec_path                                  │
└─────────────┬───────────────────────────────────────┘
              │
              ▼ (NO APPROVAL GATE)
┌─────────────────────────────────────────────────────┐
│ Phase 3: Build                                       │
│ - Invoke {domain}-build-agent                        │
│ - Pass spec_path + AUTOMATION_MODE                   │
│ - Output: files_modified[]                           │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│ Phase 4: Improve (optional, non-blocking)            │
│ - Invoke {domain}-improve-agent                      │
│ - Pass AUTOMATION_MODE                               │
│ - Failure doesn't fail workflow                      │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│ Complete                                             │
│ - Record metrics                                     │
│ - Post GitHub comment                                │
│ - Return success/failure                             │
└─────────────────────────────────────────────────────┘
```

---

## Error Handling

### Phase-Specific Error Strategy

**Phase 1 - Analysis Fails**:
- Workflow cannot proceed (no domain to route to)
- Record error in metrics
- Mark workflow as failed
- Abort remaining phases

**Phase 2 - Plan Fails**:
- Workflow cannot proceed (no spec to implement)
- Record error in metrics
- Mark workflow as failed
- Abort remaining phases

**Phase 3 - Build Fails**:
- Preserve spec (implementation may be retryable)
- Record error in metrics
- Mark workflow as failed
- Skip improve phase (no changes to analyze)

**Phase 4 - Improve Fails**:
- Log error but continue
- Mark improve_status as "failed"
- Workflow overall status: success
- Rationale: Expertise updates are opportunistic

### Graceful Degradation

```typescript
// Improve phase failure doesn't fail workflow
try {
  await executeImprove(domain, options, logger);
  improveStatus = "success";
} catch (error) {
  logger.logError("improve_phase", error);
  improveStatus = "failed";
  // Continue - improve is optional
}

// Workflow still returns success if build succeeded
result.success = true;
result.improveStatus = improveStatus;
```

---

## Testing Strategy

### Unit Tests

**Parser Module**:
```typescript
// automation/tests/parser.test.ts

import { describe, test, expect } from "bun:test";
import { parseAnalysis, extractSpecPath, extractFilePaths } from "../src/parser.ts";

describe("parseAnalysis", () => {
  test("extracts domain from structured output", () => {
    const output = `
## Issue Analysis
**Type**: feature
**Domain**: database
**Requirements**:
- Add migration
- Update schema
`;
    
    const result = parseAnalysis(output);
    expect(result.domain).toBe("database");
    expect(result.issueType).toBe("feature");
  });
});

describe("extractSpecPath", () => {
  test("extracts absolute path to spec", () => {
    const output = "Spec saved to: /Users/user/project/docs/specs/database/user-table-spec.md";
    const path = extractSpecPath(output);
    expect(path).toBe("/Users/user/project/docs/specs/database/user-table-spec.md");
  });
  
  test("throws if no spec path found", () => {
    expect(() => extractSpecPath("No path here")).toThrow("Spec path not found");
  });
});

describe("extractFilePaths", () => {
  test("extracts multiple file paths", () => {
    const output = `
Modified:
- /path/to/file1.ts
- /path/to/file2.yaml
- /path/to/file3.md
`;
    
    const paths = extractFilePaths(output);
    expect(paths).toContain("/path/to/file1.ts");
    expect(paths).toContain("/path/to/file2.yaml");
    expect(paths.length).toBe(3);
  });
});
```

**Orchestrator Module**:
```typescript
// automation/tests/orchestrator.test.ts

import { describe, test, expect, mock } from "bun:test";
import { orchestrateWorkflow } from "../src/orchestrator.ts";

describe("orchestrateWorkflow", () => {
  test("executes all phases in sequence", async () => {
    // Mock SDK query function
    const queryMock = mock((args) => {
      // Return appropriate responses based on prompt
    });
    
    const result = await orchestrateWorkflow({
      issueNumber: 123,
      projectRoot: "/test/project",
      logger: mockLogger,
      dryRun: false
    });
    
    expect(result.domain).toBeDefined();
    expect(result.specPath).toBeDefined();
    expect(result.filesModified).toBeArray();
  });
});
```

### Integration Tests

**Dry Run Validation**:
```typescript
// automation/tests/integration/dry-run.test.ts

test("dry run workflow validates without writing files", async () => {
  const result = await runWorkflow(123, true);
  
  expect(result.success).toBe(true);
  expect(result.logDir).toBeDefined();
  
  // Verify no files were actually modified
  // (check git status, file timestamps, etc.)
});
```

**Full Workflow**:
```typescript
// automation/tests/integration/full-workflow.test.ts

test("full workflow executes plan-build-improve", async () => {
  const result = await runWorkflow(123, false);
  
  expect(result.success).toBe(true);
  expect(result.inputTokens).toBeGreaterThan(0);
  expect(result.outputTokens).toBeGreaterThan(0);
  expect(result.totalCostUsd).toBeGreaterThan(0);
  expect(result.logDir).toBeDefined();
});
```

### Manual Testing

**Test Plan**:

1. **Settings Bypass Validation**:
   ```bash
   cd automation
   bun run src/index.ts 123
   
   # Check logs: should NOT see permission errors
   # Check files: should see Write operations succeed
   ```

2. **Multi-Phase Execution**:
   ```bash
   # Monitor logs for phase transitions
   PHASE_START: analysis
   PHASE_COMPLETE: analysis
   PHASE_START: plan
   PHASE_COMPLETE: plan
   PHASE_START: build
   PHASE_COMPLETE: build
   PHASE_START: improve
   PHASE_COMPLETE: improve
   ```

3. **Error Recovery**:
   ```bash
   # Test with invalid issue number
   bun run src/index.ts 99999
   
   # Should fail gracefully with clear error
   ```

4. **Dry Run Mode**:
   ```bash
   bun run src/index.ts 123 --dry-run
   
   # Verify no file modifications
   git status  # Should be clean
   ```

---

## Migration Plan

### Phase 1: Add New Modules (No Breaking Changes)

1. Create `automation/src/orchestrator.ts`
2. Create `automation/src/parser.ts`
3. Add unit tests for new modules
4. Verify tests pass: `bun test`

### Phase 2: Update Workflow.ts (Minimal Risk)

1. Import orchestrator functions
2. Add `settingSources: []` to SDK options
3. Replace `/do` invocation with orchestrator
4. Keep existing logger and metrics integration
5. Test with dry-run mode first

### Phase 3: Integration Testing

1. Run against test issues in a test repository
2. Validate all phases execute correctly
3. Verify file operations persist
4. Check metrics accuracy
5. Test error scenarios

### Phase 4: Production Deployment

1. Update automation CI workflow
2. Deploy to production environment
3. Monitor first few runs closely
4. Verify GitHub comments post correctly
5. Check metrics database for completeness

### Rollback Strategy

**If orchestrator fails:**
- Revert workflow.ts to use `/do` command
- Keep `settingSources: []` (still beneficial)
- Investigate orchestrator errors

**If settings bypass causes issues:**
- Remove `settingSources: []`
- Modify `.claude/settings.json` to allow Write/Edit
- Continue using orchestrator

---

## Validation Criteria

### Success Criteria

**File Operations**:
- [ ] Write tool operations persist to disk
- [ ] Edit tool operations modify files correctly
- [ ] Git shows expected changes after workflow

**Multi-Phase Execution**:
- [ ] Analysis phase completes without errors
- [ ] Plan phase generates valid spec
- [ ] Build phase implements changes
- [ ] Improve phase updates expertise (or logs error)

**Metrics Tracking**:
- [ ] Input tokens recorded accurately
- [ ] Output tokens recorded accurately
- [ ] Cost calculated correctly
- [ ] Duration tracked per phase

**Error Handling**:
- [ ] Analysis failure aborts workflow gracefully
- [ ] Plan failure aborts workflow gracefully
- [ ] Build failure preserves spec
- [ ] Improve failure doesn't fail workflow

**Logging**:
- [ ] Phase transitions logged
- [ ] Agent outputs captured
- [ ] Errors logged with context
- [ ] Log directory created and populated

### Validation Commands

```bash
# Type-check
cd automation && bunx tsc --noEmit

# Unit tests
cd automation && bun test

# Integration test (dry run)
cd automation && bun run src/index.ts 123 --dry-run

# Full workflow test
cd automation && bun run src/index.ts 123

# Verify metrics recorded
cd automation && bun run src/index.ts --metrics

# Check log output
ls -la automation/.data/logs/
cat automation/.data/logs/<issue-123>/workflow.jsonl
```

---

## Risk Assessment

### High Risk Areas

**SDK Settings Behavior**:
- Risk: `settingSources: []` may have undocumented side effects
- Mitigation: Test thoroughly in dry-run mode first
- Rollback: Remove option, modify .claude/settings.json instead

**Multi-Agent Coordination**:
- Risk: Agents may not produce expected output format
- Mitigation: Robust parsing with fallbacks and validation
- Rollback: Return to /do command orchestration

**Token/Cost Tracking**:
- Risk: Multiple SDK calls may complicate metrics aggregation
- Mitigation: Track per-phase in logger, sum at end
- Rollback: Accept less granular metrics if needed

### Medium Risk Areas

**Domain Detection**:
- Risk: Analysis phase may misidentify expert domain
- Mitigation: Validate domain against known list
- Fallback: Default to github domain if unknown

**Spec Path Extraction**:
- Risk: Plan agent output format may vary
- Mitigation: Multiple regex patterns, fallback strategies
- Validation: Check file exists before proceeding to build

### Low Risk Areas

**Improve Phase Failures**:
- Risk: Low - already non-blocking
- Impact: Only affects expertise updates, not workflow success

**Logging**:
- Risk: Low - append-only operations
- Impact: Missing logs don't affect workflow execution

---

## Performance Considerations

### Token Usage

**OLD (single /do call)**:
- 1 SDK query() call
- ~100K tokens (estimate)

**NEW (multi-phase)**:
- 4-5 SDK query() calls (analysis, plan, build, improve)
- ~150-200K tokens (estimate)
- **30-50% increase in token usage**

**Cost Impact**:
- Increased granularity and reliability
- More detailed logging per phase
- Better error isolation
- Trade-off: Higher cost for better reliability

### Execution Time

**OLD**:
- Single long-running query
- ~3-5 minutes

**NEW**:
- Multiple sequential queries
- ~4-7 minutes
- **Slight increase due to SDK initialization per phase**

**Optimization Opportunities**:
- Reuse SDK session across phases (future)
- Parallel execution where possible (analysis + plan prep)
- Cache domain detection results

---

## Future Enhancements

### Session Reuse

```typescript
// Reuse SDK session across phases for efficiency
const session = createSession({ options });

await session.query(analysisPrompt);
await session.query(planPrompt);
await session.query(buildPrompt);
await session.query(improvePrompt);

await session.close();
```

### Parallel Phase Execution

```typescript
// Where dependencies allow, execute in parallel
const [analysisResult, contextData] = await Promise.all([
  analyzeIssue(issueNumber, options, logger),
  fetchIssueContext(issueNumber)
]);
```

### Workflow Resumption

```typescript
// Support resuming from any phase
bun run src/index.ts 123 --resume-from=build --spec-path=/path/to/spec.md
```

### Domain-Specific Optimizations

```typescript
// Different strategies per domain
const strategy = getDomainStrategy(domain);
await strategy.execute(requirements, options, logger);
```

---

## Documentation Updates

### README.md Updates

```markdown
## How It Works

The automation workflow uses a multi-phase orchestration strategy:

1. **Analysis**: Uses github-question-agent to analyze the issue and determine expert domain
2. **Plan**: Invokes domain-specific plan-agent to create specification
3. **Build**: Invokes domain-specific build-agent to implement changes
4. **Improve**: Invokes domain-specific improve-agent to update expertise (optional)

### Headless Execution

The automation bypasses project settings and approval gates:
- `settingSources: []` prevents loading `.claude/settings.json`
- `AUTOMATION_MODE: true` flag disables interactive prompts
- Direct agent orchestration replaces `/do` command

### Metrics Tracking

Each phase is tracked separately:
- Tokens and cost per phase
- Phase duration and status
- Files modified per phase
- Total workflow metrics
```

### Architecture Diagrams

Add to `automation/README.md`:

```
┌──────────────────────────────────────────────────────────┐
│                    Automation Workflow                    │
└────────────────────┬─────────────────────────────────────┘
                     │
         ┌───────────┴────────────┐
         │  runWorkflow(issue)    │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │  orchestrateWorkflow   │
         │  - settingSources: []  │
         │  - Multi-phase exec    │
         └───────────┬────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
    ┌────▼─────┐         ┌───────▼────────┐
    │ Analysis │         │ SDK Options    │
    │ github-  │         │ - bypass perms │
    │ question │         │ - no settings  │
    └────┬─────┘         │ - kotadb MCP   │
         │               └────────────────┘
    ┌────▼─────┐
    │   Plan   │
    │ {domain} │
    │ -plan    │
    └────┬─────┘
         │
    ┌────▼─────┐
    │  Build   │
    │ {domain} │
    │ -build   │
    └────┬─────┘
         │
    ┌────▼─────┐
    │ Improve  │
    │ {domain} │
    │ -improve │
    └────┬─────┘
         │
    ┌────▼─────┐
    │ Complete │
    │ - metrics│
    │ - comment│
    └──────────┘
```

---

## Appendix A: SDK settingSources Option

### Official Documentation

From `@anthropic-ai/claude-code` SDK documentation:

```typescript
interface QueryOptions {
  settingSources?: SettingSource[];
  // ... other options
}

type SettingSource = 
  | { type: "global" }        // ~/.claude/settings.json
  | { type: "project" }       // <project>/.claude/settings.json
  | { type: "explicit", path: string };  // Custom path

// Default behavior
settingSources: [
  { type: "global" },
  { type: "project" }
]

// Bypass all settings
settingSources: []
```

### Use Cases

**Automation Mode** (our use case):
```typescript
settingSources: []  // No settings loaded, bypass restrictions
```

**Custom Settings Path**:
```typescript
settingSources: [
  { type: "explicit", path: "/custom/settings.json" }
]
```

**Global Only** (ignore project settings):
```typescript
settingSources: [
  { type: "global" }
]
```

---

## Appendix B: Expert Domain Routing

### Domain Detection Logic

```typescript
// automation/src/parser.ts

const DOMAIN_KEYWORDS = {
  "claude-config": ["command", "hook", "settings", "frontmatter", ".claude"],
  "agent-authoring": ["agent", "expert", "registry", "tool selection"],
  "database": ["schema", "migration", "SQLite", "FTS5", "query", "index"],
  "api": ["endpoint", "route", "MCP tool", "API", "OpenAPI"],
  "testing": ["test", "antimocking", "Bun test", "integration"],
  "indexer": ["AST", "parser", "symbol", "indexing", "code analysis"],
  "github": ["issue", "PR", "pull request", "branch", "commit"],
  "automation": ["workflow", "orchestration", "SDK", "automation"]
};

export function detectDomain(requirements: string): string {
  const lowerReq = requirements.toLowerCase();
  
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const matchCount = keywords.filter(kw => 
      lowerReq.includes(kw.toLowerCase())
    ).length;
    
    if (matchCount >= 2) {  // At least 2 keyword matches
      return domain;
    }
  }
  
  // Fallback: check issue labels, file paths, etc.
  return "github";  // Default
}
```

### Agent Name Resolution

```typescript
// automation/src/orchestrator.ts

function getAgentName(domain: string, phase: "plan" | "build" | "improve"): string {
  return `${domain}-${phase}-agent`;
}

// Examples:
getAgentName("database", "plan")    // => "database-plan-agent"
getAgentName("api", "build")        // => "api-build-agent"
getAgentName("automation", "improve") // => "automation-improve-agent"
```

---

## Appendix C: Example Logs

### Successful Workflow

```jsonl
{"timestamp":"2026-01-30T12:00:00.000Z","event":"WORKFLOW_START","data":{"issue_number":123,"dry_run":false}}
{"timestamp":"2026-01-30T12:00:01.000Z","event":"PHASE_START","data":{"phase":"analysis"}}
{"timestamp":"2026-01-30T12:00:15.000Z","event":"PHASE_COMPLETE","data":{"phase":"analysis","domain":"database"}}
{"timestamp":"2026-01-30T12:00:15.100Z","event":"PHASE_START","data":{"phase":"plan","domain":"database"}}
{"timestamp":"2026-01-30T12:01:30.000Z","event":"PHASE_COMPLETE","data":{"phase":"plan","spec_path":"/Users/user/project/docs/specs/database/user-table-spec.md"}}
{"timestamp":"2026-01-30T12:01:30.100Z","event":"PHASE_START","data":{"phase":"build","domain":"database"}}
{"timestamp":"2026-01-30T12:03:00.000Z","event":"PHASE_COMPLETE","data":{"phase":"build","files_count":3}}
{"timestamp":"2026-01-30T12:03:00.100Z","event":"PHASE_START","data":{"phase":"improve","domain":"database"}}
{"timestamp":"2026-01-30T12:03:45.000Z","event":"PHASE_COMPLETE","data":{"phase":"improve","status":"success"}}
{"timestamp":"2026-01-30T12:03:45.500Z","event":"WORKFLOW_COMPLETE","data":{"success":true,"duration_ms":225500,"domain":"database","files_modified":3}}
```

### Failed Build Phase

```jsonl
{"timestamp":"2026-01-30T12:00:00.000Z","event":"WORKFLOW_START","data":{"issue_number":456,"dry_run":false}}
{"timestamp":"2026-01-30T12:00:01.000Z","event":"PHASE_START","data":{"phase":"analysis"}}
{"timestamp":"2026-01-30T12:00:15.000Z","event":"PHASE_COMPLETE","data":{"phase":"analysis","domain":"api"}}
{"timestamp":"2026-01-30T12:00:15.100Z","event":"PHASE_START","data":{"phase":"plan","domain":"api"}}
{"timestamp":"2026-01-30T12:01:30.000Z","event":"PHASE_COMPLETE","data":{"phase":"plan","spec_path":"/Users/user/project/docs/specs/api/search-tool-spec.md"}}
{"timestamp":"2026-01-30T12:01:30.100Z","event":"PHASE_START","data":{"phase":"build","domain":"api"}}
{"timestamp":"2026-01-30T12:02:00.000Z","event":"ERROR","data":{"phase":"build","error":"TypeError: Cannot read property 'content' of undefined"}}
{"timestamp":"2026-01-30T12:02:00.500Z","event":"WORKFLOW_COMPLETE","data":{"success":false,"duration_ms":120500,"domain":"api","error":"Build phase failed"}}
```

---

## Sign-Off

**Specification Author**: automation-plan-agent  
**Date**: 2026-01-30  
**Status**: Implementation Ready  
**Review Required**: Yes (architecture changes)

**Key Changes**:
- SDK configuration: add `settingSources: []`
- Orchestration strategy: multi-phase direct agent invocation
- Prompt format: add AUTOMATION_MODE and HUMAN_IN_LOOP flags
- Error handling: phase-specific strategies with graceful degradation

**Implementation Estimate**: 2-3 hours (coding + testing)  
**Risk Level**: Medium (SDK behavior changes, new orchestration pattern)  
**Testing Priority**: High (integration tests critical)
