/**
 * Centralized logging for automation workflow execution
 * 
 * Provides structured logging of SDK message streams, agent I/O, and errors
 * for post-execution debugging and analysis.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { SDKMessage, SDKSystemMessage, SDKResultMessage } from "@anthropic-ai/claude-code";

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

/**
 * SDK message with timestamp added for logging
 */
interface TimestampedMessage {
  timestamp: string;
  message: SDKMessage;
}

/**
 * WorkflowLogger captures execution details for automation workflows
 * 
 * Directory structure: automation/.data/logs/{issue-number}/{timestamp}/
 * - workflow.log: Human-readable event timeline
 * - agent-input.json: Initial prompt and SDK options
 * - agent-output.json: Complete SDK message stream with summary
 * - errors.log: Error messages with stack traces
 */
export class WorkflowLogger {
  private logDir: string;
  private issueNumber: number;
  private startTime: Date;
  private messages: TimestampedMessage[] = [];
  private workflowLogPath: string;
  private errorsLogPath: string;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private sessionId: string | null = null;

  constructor(options: LoggerOptions) {
    this.issueNumber = options.issueNumber;
    this.startTime = new Date();
    
    // Format timestamp for filesystem (replace colons, strip milliseconds)
    const timestamp = this.startTime.toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
    const baseLogDir = join(options.projectRoot, "automation", ".data", "logs");
    this.logDir = join(baseLogDir, String(options.issueNumber), timestamp);
    
    this.workflowLogPath = join(this.logDir, "workflow.log");
    this.errorsLogPath = join(this.logDir, "errors.log");
  }

  /**
   * Initialize log directory structure and test write permissions
   * Throws if directory cannot be created or is not writable
   */
  initialize(): void {
    try {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      
      // Test write permissions
      const testFile = join(this.logDir, ".writetest");
      writeFileSync(testFile, "test", "utf-8");
      unlinkSync(testFile);
      
      // Write header to workflow.log
      this.appendToWorkflowLog(
        `Workflow Log for Issue #${this.issueNumber}\n` +
        `Started: ${this.startTime.toISOString()}\n` +
        `${"=".repeat(80)}\n\n`
      );
    } catch (error) {
      process.stderr.write(`ERROR: Cannot write to log directory ${this.logDir}: ${error}\n`);
      throw new Error("Log directory not writable");
    }
  }

  /**
   * Log workflow events to workflow.log
   * Format: [ISO_TIMESTAMP] EVENT_TYPE key=value key=value
   */
  logEvent(event: string, data: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const dataStr = Object.entries(data)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");
    
    this.appendToWorkflowLog(`[${timestamp}] ${event} ${dataStr}\n`);
  }

  /**
   * Log agent input (prompt and SDK options) to agent-input.json
   */
  logAgentInput(prompt: string, options: unknown): void {
    const input = {
      timestamp: new Date().toISOString(),
      issue_number: this.issueNumber,
      prompt,
      sdk_options: options
    };
    
    const sanitized = this.sanitize(JSON.stringify(input, null, 2));
    const inputPath = join(this.logDir, "agent-input.json");
    
    try {
      writeFileSync(inputPath, sanitized, { encoding: "utf-8", mode: 0o600 });
    } catch (error) {
      process.stderr.write(`Warning: Failed to write agent-input.json: ${error}\n`);
    }
  }

  /**
   * Accumulate SDK message for final agent-output.json write
   * Adds timestamp to message for precise timing
   */
  addMessage(message: SDKMessage): void {
    this.messages.push({
      timestamp: new Date().toISOString(),
      message
    });
    
    // Track usage from result messages
    if (message.type === "result") {
      const resultMsg = message as SDKResultMessage;
      this.totalInputTokens += resultMsg.usage.input_tokens;
      this.totalOutputTokens += resultMsg.usage.output_tokens;
      this.totalCostUsd += resultMsg.total_cost_usd;
    }
    
    // Track session ID from system init message
    if (message.type === "system" && "subtype" in message && message.subtype === "init") {
      const systemMsg = message as SDKSystemMessage;
      this.sessionId = systemMsg.session_id;
    }
  }

  /**
   * Write complete agent-output.json with message stream and summary
   * Called once at workflow completion
   */
  finalizeAgentOutput(summary: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    durationMs: number;
  }): void {
    const output = {
      timestamp: this.startTime.toISOString(),
      session_id: this.sessionId,
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
    
    try {
      writeFileSync(outputPath, sanitized, { encoding: "utf-8", mode: 0o600 });
    } catch (error) {
      process.stderr.write(`Warning: Failed to write agent-output.json: ${error}\n`);
    }
  }

  /**
   * Log errors to errors.log with timestamp, context, and stack trace
   * Handles write failures gracefully by falling back to stderr
   */
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
      writeFileSync(this.errorsLogPath, current + sanitized, { encoding: "utf-8", mode: 0o600 });
    } catch (writeError) {
      // Fallback to stderr if file write fails
      process.stderr.write(`Failed to write error log: ${writeError}\n`);
      process.stderr.write(entry);
    }
  }

  /**
   * Get log directory path for printing to user
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Get metrics tracked across all phases
   */
  getMetrics(): {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    sessionId: string | null;
  } {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalCostUsd: this.totalCostUsd,
      sessionId: this.sessionId
    };
  }

  /**
   * Append content to workflow.log with error handling
   */
  private appendToWorkflowLog(content: string): void {
    try {
      const sanitized = this.sanitize(content);
      const current = existsSync(this.workflowLogPath)
        ? readFileSync(this.workflowLogPath, "utf-8")
        : "";
      writeFileSync(this.workflowLogPath, current + sanitized, { encoding: "utf-8", mode: 0o600 });
    } catch (error) {
      // Log to stderr but don't throw - logging failures should not abort workflow
      process.stderr.write(`Warning: Failed to write workflow log: ${error}\n`);
    }
  }

  /**
   * Sanitize sensitive data from logs
   * 
   * Redacts:
   * - Anthropic API keys (sk-ant-*)
   * - GitHub personal access tokens (github_pat_*)
   * - Bearer tokens
   * - Environment variable values for ANTHROPIC_API_KEY
   * - Generic password/secret fields
   */
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
