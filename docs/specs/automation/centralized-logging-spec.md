# Centralized Logging for Automation Layer

**Status**: Draft  
**Issue**: #66  
**Created**: 2026-01-30  
**Feature Type**: Automation Infrastructure Enhancement

## Purpose

Implement centralized diagnostic logging for the automation layer to provide visibility into agent workflow execution. After running workflows, operators currently see only progress dots with no insight into agent decisions, tool calls, or failure reasons. This spec establishes a structured logging system that captures workflow execution details for debugging and analysis.

## Objectives

1. **Diagnostic Visibility**: Capture all SDK message streams for post-execution analysis
2. **Structured Storage**: Organize logs by issue and timestamp for easy retrieval
3. **Machine-Readable Format**: Use JSON for automated parsing and analysis
4. **Security**: Prevent logging of sensitive data (API keys, tokens)
5. **Integration**: Seamlessly integrate with existing workflow.ts SDK streaming
6. **Non-Intrusive**: Minimal performance impact on workflow execution

## Current State Analysis

### Existing Infrastructure

**automation/src/workflow.ts**
- Streams SDK messages via async iterator
- Extracts session_id, tokens, cost, PR URL
- Logs progress dots to stderr (lines 90-99)
- Currently discards detailed message content

**automation/src/metrics.ts**
- Stores workflow outcomes in SQLite
- Records: duration, tokens, cost, success/failure
- No detailed execution logs

**automation/.data/ directory**
- Already exists and is gitignored
- Contains metrics.db
- Suitable for log file storage

### Gap Analysis

**Missing Capabilities:**
- Full SDK message stream capture
- Agent input/output preservation
- Structured error logging
- Timing information per agent turn
- Tool call tracking

## Architecture Design

### Module Structure

Create new module: **automation/src/logger.ts**

Responsibilities:
- Initialize log directory structure
- Write structured log files (JSON + text)
- Sanitize sensitive data
- Provide logging API for workflow.ts integration
- Handle file I/O errors gracefully

### Directory Structure

```
automation/.data/logs/{issue-number}/{timestamp}/
├── workflow.log         # Human-readable workflow events
├── agent-input.json     # Initial prompt sent to SDK
├── agent-output.json    # Complete SDK message stream
└── errors.log           # Error messages with stack traces
```

**Naming Convention:**
- `issue-number`: GitHub issue number (e.g., "123")
- `timestamp`: ISO 8601 format with milliseconds (e.g., "2026-01-30T15-30-45-123Z")

**Rationale:**
- Issue-based organization for easy correlation
- Timestamp-based subdirectories support re-runs on same issue
- Separate files for different log types enable targeted analysis
- JSON for machine parsing, .log for human reading

### File Formats

#### workflow.log (Text Format)

```
[2026-01-30T15:30:45.123Z] WORKFLOW_START issue=#123 dry_run=false
[2026-01-30T15:30:45.200Z] SDK_INIT session_id=abc123
[2026-01-30T15:30:46.500Z] ASSISTANT_MESSAGE turn=1 tokens=150
[2026-01-30T15:30:48.800Z] TOOL_CALL tool=Read file=/path/to/file.ts
[2026-01-30T15:31:20.400Z] WORKFLOW_COMPLETE success=true duration_ms=35281
```

**Format:**
- `[ISO_TIMESTAMP]` - Precise timing for each event
- `EVENT_TYPE` - Uppercase event identifier
- `key=value` pairs for structured data

#### agent-input.json (JSON Format)

```json
{
  "timestamp": "2026-01-30T15:30:45.123Z",
  "issue_number": 123,
  "prompt": "/do #123",
  "dry_run": false,
  "sdk_options": {
    "maxTurns": 100,
    "permissionMode": "bypassPermissions",
    "cwd": "/path/to/project",
    "mcpServers": {
      "kotadb": {
        "type": "stdio",
        "command": "bunx",
        "args": ["--bun", "kotadb"]
      }
    }
  }
}
```

#### agent-output.json (JSON Format)

```json
{
  "timestamp": "2026-01-30T15:30:45.123Z",
  "session_id": "abc123",
  "messages": [
    {
      "type": "system",
      "subtype": "init",
      "session_id": "abc123",
      "timestamp": "2026-01-30T15:30:45.200Z"
    },
    {
      "type": "assistant",
      "message": {
        "content": [
          {
            "type": "text",
            "text": "I'll analyze issue #123..."
          }
        ]
      },
      "timestamp": "2026-01-30T15:30:46.500Z"
    },
    {
      "type": "result",
      "usage": {
        "input_tokens": 5000,
        "output_tokens": 2500
      },
      "total_cost_usd": 0.0750,
      "is_error": false,
      "timestamp": "2026-01-30T15:31:20.400Z"
    }
  ],
  "summary": {
    "total_messages": 42,
    "total_input_tokens": 5000,
    "total_output_tokens": 2500,
    "total_cost_usd": 0.0750,
    "duration_ms": 35281
  }
}
```

#### errors.log (Text Format)

```
[2026-01-30T15:35:20.123Z] ERROR workflow_execution
SDK query() failed: Network timeout
Stack:
  at runWorkflow (workflow.ts:65)
  at main (index.ts:138)

[2026-01-30T15:36:10.500Z] ERROR file_write
Failed to write agent-output.json: EACCES permission denied
```

### Data Sanitization

**Sensitive Patterns to Redact:**
- API keys: `ANTHROPIC_API_KEY`, `sk-ant-*`, `Bearer *`
- Tokens: `github_pat_*`, JWT tokens
- Credentials: `password`, `secret`, `credential`
- Personal data: Email addresses (optional)

**Redaction Strategy:**
```typescript
function sanitize(text: string): string {
  return text
    .replace(/sk-ant-[a-zA-Z0-9-_]+/g, "REDACTED_API_KEY")
    .replace(/github_pat_[a-zA-Z0-9_]+/g, "REDACTED_GITHUB_TOKEN")
    .replace(/Bearer [a-zA-Z0-9-_.]+/g, "Bearer REDACTED")
    .replace(/"ANTHROPIC_API_KEY":\s*"[^"]+"/g, '"ANTHROPIC_API_KEY": "REDACTED"');
}
```

**Application Points:**
- Before writing any log file
- Applied to entire message content
- No sanitization of metrics data (already safe)

## Implementation Details

### logger.ts API

```typescript
export interface LoggerOptions {
  issueNumber: number;
  dryRun: boolean;
  projectRoot: string;
}

export interface WorkflowLogEntry {
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
}

export class WorkflowLogger {
  private logDir: string;
  private issueNumber: number;
  private startTime: Date;
  private messages: SDKMessage[];

  constructor(options: LoggerOptions);
  
  // Initialize log directory structure
  initialize(): void;
  
  // Log workflow events to workflow.log
  logEvent(event: string, data: Record<string, unknown>): void;
  
  // Log agent input (prompt + SDK options)
  logAgentInput(prompt: string, options: unknown): void;
  
  // Accumulate SDK messages
  addMessage(message: SDKMessage): void;
  
  // Write complete agent-output.json
  finalizeAgentOutput(summary: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    durationMs: number;
  }): void;
  
  // Log errors to errors.log
  logError(context: string, error: Error): void;
  
  // Get log directory path
  getLogDir(): string;
}
```

### Integration with workflow.ts

**Before query() call:**
```typescript
const logger = new WorkflowLogger({
  issueNumber,
  dryRun,
  projectRoot
});

logger.initialize();
logger.logEvent("WORKFLOW_START", { issueNumber, dryRun });
logger.logAgentInput(prompt, options);
```

**During message streaming:**
```typescript
for await (const message of query(...)) {
  messages.push(message);
  logger.addMessage(message);  // Accumulate for final write
  
  if (isSystemMessage(message)) {
    result.sessionId = message.session_id;
    logger.logEvent("SDK_INIT", { session_id: message.session_id });
  }
  
  if (isAssistantMessage(message)) {
    logger.logEvent("ASSISTANT_MESSAGE", { 
      turn: messages.filter(isAssistantMessage).length,
      has_tool_calls: /* detect tool calls */
    });
    // Progress dots to stderr (existing behavior)
    process.stderr.write(".");
  }
  
  if (isResultMessage(message)) {
    logger.logEvent("RESULT_MESSAGE", {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cost_usd: message.total_cost_usd,
      is_error: message.is_error
    });
  }
}
```

**After workflow completion:**
```typescript
logger.finalizeAgentOutput({
  totalInputTokens: result.inputTokens,
  totalOutputTokens: result.outputTokens,
  totalCostUsd: result.totalCostUsd,
  durationMs
});

logger.logEvent("WORKFLOW_COMPLETE", {
  success: result.success,
  duration_ms: durationMs,
  pr_url: result.prUrl
});

process.stdout.write(`\nLogs saved to: ${logger.getLogDir()}\n`);
```

**Error handling:**
```typescript
try {
  // workflow execution
} catch (error) {
  logger.logError("workflow_execution", error);
  throw error;
}
```

### TypeScript Implementation

#### logger.ts Structure

```typescript
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-code";

export interface LoggerOptions {
  issueNumber: number;
  dryRun: boolean;
  projectRoot: string;
}

export class WorkflowLogger {
  private logDir: string;
  private issueNumber: number;
  private startTime: Date;
  private messages: SDKMessage[] = [];
  private workflowLogPath: string;
  private errorsLogPath: string;

  constructor(options: LoggerOptions) {
    this.issueNumber = options.issueNumber;
    this.startTime = new Date();
    
    // automation/.data/logs/{issue}/{timestamp}/
    const timestamp = this.startTime.toISOString().replace(/:/g, "-").replace(/\..+/, "");
    const baseLogDir = join(options.projectRoot, "automation", ".data", "logs");
    this.logDir = join(baseLogDir, String(options.issueNumber), timestamp);
    
    this.workflowLogPath = join(this.logDir, "workflow.log");
    this.errorsLogPath = join(this.logDir, "errors.log");
  }

  initialize(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    
    // Write header to workflow.log
    this.appendToWorkflowLog(
      `Workflow Log for Issue #${this.issueNumber}\n` +
      `Started: ${this.startTime.toISOString()}\n` +
      `${"=".repeat(80)}\n\n`
    );
  }

  logEvent(event: string, data: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const dataStr = Object.entries(data)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");
    
    this.appendToWorkflowLog(`[${timestamp}] ${event} ${dataStr}\n`);
  }

  logAgentInput(prompt: string, options: unknown): void {
    const input = {
      timestamp: new Date().toISOString(),
      issue_number: this.issueNumber,
      prompt,
      sdk_options: options
    };
    
    const sanitized = this.sanitize(JSON.stringify(input, null, 2));
    const inputPath = join(this.logDir, "agent-input.json");
    writeFileSync(inputPath, sanitized, "utf-8");
  }

  addMessage(message: SDKMessage): void {
    // Add timestamp to message
    const timestampedMessage = {
      ...message,
      timestamp: new Date().toISOString()
    };
    this.messages.push(timestampedMessage as SDKMessage);
  }

  finalizeAgentOutput(summary: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    durationMs: number;
  }): void {
    const output = {
      timestamp: this.startTime.toISOString(),
      session_id: this.extractSessionId(),
      messages: this.messages,
      summary: {
        total_messages: this.messages.length,
        total_input_tokens: summary.totalInputTokens,
        total_output_tokens: summary.totalOutputTokens,
        total_cost_usd: summary.totalCostUsd,
        duration_ms: summary.durationMs
      }
    };
    
    const sanitized = this.sanitize(JSON.stringify(output, null, 2));
    const outputPath = join(this.logDir, "agent-output.json");
    writeFileSync(outputPath, sanitized, "utf-8");
  }

  logError(context: string, error: Error): void {
    const timestamp = new Date().toISOString();
    const entry = 
      `[${timestamp}] ERROR ${context}\n` +
      `${error.message}\n` +
      (error.stack ? `Stack:\n${error.stack}\n\n` : "\n");
    
    try {
      const sanitized = this.sanitize(entry);
      const current = existsSync(this.errorsLogPath) 
        ? readFileSync(this.errorsLogPath, "utf-8") 
        : "";
      writeFileSync(this.errorsLogPath, current + sanitized, "utf-8");
    } catch (writeError) {
      // Fallback to stderr if file write fails
      process.stderr.write(`Failed to write error log: ${writeError}\n`);
      process.stderr.write(entry);
    }
  }

  getLogDir(): string {
    return this.logDir;
  }

  private appendToWorkflowLog(content: string): void {
    try {
      const sanitized = this.sanitize(content);
      const current = existsSync(this.workflowLogPath)
        ? readFileSync(this.workflowLogPath, "utf-8")
        : "";
      writeFileSync(this.workflowLogPath, current + sanitized, "utf-8");
    } catch (error) {
      process.stderr.write(`Warning: Failed to write workflow log: ${error}\n`);
    }
  }

  private extractSessionId(): string | null {
    const systemMsg = this.messages.find(m => 
      m.type === "system" && "subtype" in m && m.subtype === "init"
    );
    return systemMsg && "session_id" in systemMsg 
      ? (systemMsg.session_id as string) 
      : null;
  }

  private sanitize(text: string): string {
    return text
      .replace(/sk-ant-[a-zA-Z0-9-_]+/g, "REDACTED_API_KEY")
      .replace(/github_pat_[a-zA-Z0-9_]+/g, "REDACTED_GITHUB_TOKEN")
      .replace(/Bearer [a-zA-Z0-9-_.]+/g, "Bearer REDACTED")
      .replace(/"ANTHROPIC_API_KEY":\s*"[^"]+"/g, '"ANTHROPIC_API_KEY": "REDACTED"')
      .replace(/"password":\s*"[^"]+"/g, '"password": "REDACTED"')
      .replace(/"secret":\s*"[^"]+"/g, '"secret": "REDACTED"');
  }
}
```

### Updated workflow.ts Integration Points

**Imports:**
```typescript
import { WorkflowLogger } from "./logger.ts";
```

**runWorkflow() modifications:**
```typescript
export async function runWorkflow(
  issueNumber: number,
  dryRun = false
): Promise<WorkflowResult> {
  const projectRoot = getProjectRoot();
  const logger = new WorkflowLogger({ issueNumber, dryRun, projectRoot });
  
  try {
    logger.initialize();
    logger.logEvent("WORKFLOW_START", { issue_number: issueNumber, dry_run: dryRun });
    
    const prompt = dryRun ? `/do #${issueNumber} --dry-run` : `/do #${issueNumber}`;
    const options = {
      maxTurns: 100,
      cwd: projectRoot,
      permissionMode: "bypassPermissions",
      mcpServers: { /* ... */ }
    };
    
    logger.logAgentInput(prompt, options);
    
    // ... existing query() loop with logger.addMessage() calls ...
    
    logger.finalizeAgentOutput({
      totalInputTokens: result.inputTokens,
      totalOutputTokens: result.outputTokens,
      totalCostUsd: result.totalCostUsd,
      durationMs: endTime - startTime
    });
    
    logger.logEvent("WORKFLOW_COMPLETE", {
      success: result.success,
      duration_ms: endTime - startTime,
      pr_url: result.prUrl
    });
    
    // Print log location
    process.stdout.write(`\nLogs: ${logger.getLogDir()}\n`);
    
  } catch (error) {
    logger.logError("workflow_execution", error as Error);
    throw error;
  }
  
  return result;
}
```

## Error Handling

### File System Errors

**Strategy**: Graceful degradation with stderr warnings

```typescript
try {
  writeFileSync(path, content);
} catch (error) {
  process.stderr.write(`Warning: Failed to write log: ${error}\n`);
  // Continue workflow execution
}
```

**Rationale**: Logging failures should not abort workflows. Operator sees warning but workflow completes.

### Permission Errors

**Prevention**: 
- Use automation/.data/ which automation scripts create
- mkdir with `{ recursive: true }` creates parent directories
- Validate write permissions during logger.initialize()

**Handling**:
```typescript
initialize(): void {
  try {
    mkdirSync(this.logDir, { recursive: true });
    // Test write permissions
    const testFile = join(this.logDir, ".writetest");
    writeFileSync(testFile, "test");
    unlinkSync(testFile);
  } catch (error) {
    process.stderr.write(`ERROR: Cannot write to log directory ${this.logDir}: ${error}\n`);
    throw new Error("Log directory not writable");
  }
}
```

### Disk Space

**Detection**: Catch ENOSPC errors during write

**Response**: 
1. Log error to stderr
2. Continue workflow (best effort)
3. Mention in workflow summary

```typescript
} catch (error) {
  if (error.code === "ENOSPC") {
    process.stderr.write("WARNING: Disk full, logging disabled\n");
  }
}
```

## Performance Considerations

### Memory Usage

**Concern**: Accumulating all SDK messages in memory

**Mitigation**:
- SDK messages already accumulated in workflow.ts (line 62)
- Logger reuses same array, no duplication
- Typical workflow: 50-200 messages ≈ 1-5MB
- Acceptable for automation context

**Alternative**: Stream to file incrementally (future enhancement)

### File I/O Impact

**Analysis**:
- 4 files written per workflow
- agent-output.json written once at end (largest file)
- workflow.log appended ~10-50 times
- Synchronous writes acceptable (not critical path)

**Optimization**: Use async writeFile if performance issues arise

### CPU Overhead

**Sanitization**: Regex operations on strings
- Applied 3 times: agent-input, agent-output, workflow.log
- Total text: <10MB typical
- Overhead: <100ms

**JSON serialization**: Built-in JSON.stringify
- Already used in metrics.ts
- Minimal impact

## Testing Requirements

### Unit Tests

**File**: `automation/tests/logger.test.ts`

```typescript
import { test, expect } from "bun:test";
import { WorkflowLogger } from "../src/logger.ts";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

test("WorkflowLogger creates log directory", () => {
  const logger = new WorkflowLogger({
    issueNumber: 999,
    dryRun: false,
    projectRoot: "/tmp"
  });
  
  logger.initialize();
  expect(existsSync(logger.getLogDir())).toBe(true);
  
  // Cleanup
  rmSync(logger.getLogDir(), { recursive: true });
});

test("WorkflowLogger sanitizes API keys", () => {
  const logger = new WorkflowLogger({
    issueNumber: 999,
    dryRun: false,
    projectRoot: "/tmp"
  });
  
  logger.initialize();
  logger.logAgentInput("/do #999", {
    env: { ANTHROPIC_API_KEY: "sk-ant-secret123" }
  });
  
  const inputPath = join(logger.getLogDir(), "agent-input.json");
  const content = readFileSync(inputPath, "utf-8");
  
  expect(content).not.toContain("sk-ant-secret123");
  expect(content).toContain("REDACTED_API_KEY");
  
  // Cleanup
  rmSync(logger.getLogDir(), { recursive: true });
});

test("WorkflowLogger handles write errors gracefully", () => {
  // Create logger with invalid path
  const logger = new WorkflowLogger({
    issueNumber: 999,
    dryRun: false,
    projectRoot: "/invalid/path"
  });
  
  // Should throw on initialize
  expect(() => logger.initialize()).toThrow();
});
```

### Integration Tests

**File**: `automation/tests/workflow-logging.test.ts`

```typescript
test("runWorkflow creates complete log set", async () => {
  const result = await runWorkflow(999, true);
  
  const logDir = /* extract from result or global state */;
  
  expect(existsSync(join(logDir, "workflow.log"))).toBe(true);
  expect(existsSync(join(logDir, "agent-input.json"))).toBe(true);
  expect(existsSync(join(logDir, "agent-output.json"))).toBe(true);
  
  // Verify agent-output contains messages
  const output = JSON.parse(
    readFileSync(join(logDir, "agent-output.json"), "utf-8")
  );
  expect(output.messages.length).toBeGreaterThan(0);
  expect(output.summary.total_messages).toBe(output.messages.length);
});
```

### Manual Testing

**Procedure**:
1. Run workflow: `bun run src/index.ts 123`
2. Check logs created: `ls -la automation/.data/logs/123/`
3. Verify workflow.log is human-readable
4. Verify agent-input.json contains prompt and options
5. Verify agent-output.json contains all SDK messages
6. Trigger error (invalid issue number) and verify errors.log
7. Check sanitization: search logs for "sk-ant-", "ANTHROPIC_API_KEY"

## Validation Criteria

### Functional Requirements

- [ ] Log directory created at `automation/.data/logs/{issue}/{timestamp}/`
- [ ] workflow.log contains timestamped events
- [ ] agent-input.json contains prompt and SDK options
- [ ] agent-output.json contains complete message stream
- [ ] errors.log created when errors occur
- [ ] API keys redacted in all log files
- [ ] Log path printed to stdout after workflow completion

### Non-Functional Requirements

- [ ] TypeScript compiles without errors: `bunx tsc --noEmit`
- [ ] All tests pass: `bun test`
- [ ] Workflow execution time increase <5%
- [ ] Memory usage increase <10MB
- [ ] File write errors do not abort workflow

### User Experience

- [ ] Operator can find logs by issue number
- [ ] Logs are human-readable (workflow.log)
- [ ] Logs are machine-parseable (JSON files)
- [ ] Error messages include context and stack traces
- [ ] No sensitive data exposed in logs

## Future Enhancements

### Log Retention Policy

Implement automatic cleanup of old logs:
- Keep last 30 days by default
- Configurable via environment variable
- Weekly cron job to prune old logs

### Log Aggregation

Centralized logging for multi-workflow analysis:
- Aggregate agent-output.json across issues
- Token usage trends
- Common error patterns
- Average workflow duration by issue type

### Structured Query Interface

CLI tool for log analysis:
```bash
bun run src/log-query.ts --issue 123 --latest
bun run src/log-query.ts --errors-only --last-week
bun run src/log-query.ts --cost-breakdown
```

### Streaming Logs

Write logs incrementally during workflow:
- Reduce memory usage for long workflows
- Enable real-time monitoring
- Complexity: file locking, append mode management

## Migration Path

### Phase 1: Core Implementation (This Spec)
- Create logger.ts module
- Integrate with workflow.ts
- Add unit tests
- Document in automation/README.md

### Phase 2: Validation & Deployment
- Manual testing on sample issues
- Integration tests
- Deploy to CI automation workflow
- Monitor for errors/performance issues

### Phase 3: Enhancements
- Log retention policy
- Query tool
- Metrics integration (correlate logs with metrics.db)

## Dependencies

### Internal
- automation/src/workflow.ts - Integration point
- automation/src/index.ts - Log path output
- automation/.data/ directory - Storage location

### External
- @anthropic-ai/claude-code - SDKMessage types
- bun:fs - File operations
- bun:path - Path manipulation

### TypeScript
- Type definitions for SDKMessage
- Strict mode compliance
- No new dependencies required

## Security Considerations

### Sensitive Data Exposure

**Risk**: API keys, tokens, credentials in logs

**Mitigation**: Comprehensive sanitization regex patterns

**Verification**: Manual audit of sample logs + automated tests

### File Permissions

**Default**: Files inherit umask (typically 0644 = rw-r--r--)

**Recommendation**: Logs in .data/ directory (already gitignored)

**Enhancement**: Explicitly set file permissions to 0600 (owner-only)
```typescript
writeFileSync(path, content, { mode: 0o600 });
```

### Log Injection

**Risk**: Malicious input in issue titles/descriptions affects logs

**Mitigation**: 
- JSON.stringify escapes special characters
- Workflow.log uses simple key=value format
- No eval() or script execution on logs

## Documentation Requirements

### automation/README.md Updates

Add section:
```markdown
## Logging

Workflow execution logs are stored in `automation/.data/logs/{issue}/{timestamp}/`:

- **workflow.log**: Human-readable event timeline
- **agent-input.json**: Initial prompt and SDK configuration
- **agent-output.json**: Complete SDK message stream
- **errors.log**: Error messages with stack traces

Logs include automatic sanitization of API keys and sensitive data.

### Viewing Logs

After running a workflow:
```bash
bun run src/index.ts 123
# Logs saved to: automation/.data/logs/123/2026-01-30T15-30-45/

cat automation/.data/logs/123/*/workflow.log
```
```

### Code Comments

- Document sanitization patterns in logger.ts
- Explain directory structure in constructor
- Note error handling strategy for file I/O

## Open Questions

1. **Log Rotation**: Should we implement max log size limits?
   - Recommendation: Not initially, monitor in production

2. **Compression**: Should old logs be gzipped?
   - Recommendation: Future enhancement, assess storage usage first

3. **Remote Storage**: Upload logs to S3/cloud storage?
   - Recommendation: Not for local-first architecture

4. **PII Detection**: Beyond API keys, detect email/phone numbers?
   - Recommendation: Start with API keys, expand if needed

## Success Metrics

### Implementation Success
- PR merged with logger.ts and integration
- All tests passing in CI
- No workflow execution failures due to logging

### Operational Success (1 week post-deployment)
- 100% of workflows have logs
- Zero workflow failures from logging errors
- <5% performance degradation
- At least 1 debug session uses logs successfully

### Long-term Success (1 month post-deployment)
- Reduced time to debug workflow failures by 50%
- Logs referenced in 80%+ of failure investigations
- No sensitive data leaks reported

## References

### Existing Patterns
- **expertise.yaml**: Automation domain best practices
- **workflow.ts**: SDK message streaming patterns
- **metrics.ts**: SQLite storage patterns

### SDK Documentation
- Claude Agent SDK query() API
- SDKMessage type definitions
- Permission modes and options

### KotaDB Conventions
- Logging standards (process.stdout/stderr)
- Path conventions (automation/.data/)
- TypeScript configuration (strict mode)

---

**Specification Author**: Automation Plan Agent  
**Review Status**: Pending  
**Next Steps**: Create implementation PR with logger.ts + tests
