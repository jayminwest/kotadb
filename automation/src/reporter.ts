/**
 * Console reporter for real-time workflow progress
 * Provides ANSI-formatted output with verbosity control
 */

export interface ConsoleReporterOptions {
  verbose: boolean;
  issueNumber: number;
}

export type WorkflowPhase = 
  | "analysis" 
  | "plan" 
  | "build" 
  | "improve"
  | "pr";

export interface WorkflowSummary {
  success: boolean;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  filesModified: string[];
  specPath: string | null;
  errorMessage?: string;
}

export const ANSI = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  
  // Phase indicators (cyan, bold)
  PHASE: "\x1b[1m\x1b[36m",
  
  // Action indicators (blue)
  ACTION: "\x1b[34m",
  
  // Success (green)
  SUCCESS: "\x1b[32m",
  
  // Error (red, bold)
  ERROR: "\x1b[1m\x1b[31m",
  
  // Warning (yellow)
  WARNING: "\x1b[33m",
  
  // Verbose (gray/dim)
  VERBOSE: "\x1b[2m",
} as const;

export class ConsoleReporter {
  private verbose: boolean;
  private issueNumber: number;
  private phaseStartTime: number | null = null;

  constructor(options: ConsoleReporterOptions) {
    this.verbose = options.verbose;
    this.issueNumber = options.issueNumber;
  }

  /**
   * Get verbosity setting for external use (e.g., hooks)
   */
  isVerbose(): boolean {
    return this.verbose;
  }

  startWorkflow(dryRun: boolean): void {
    const dryRunLabel = dryRun ? " (dry run)" : "";
    this.write(`${ANSI.PHASE}[automation] Starting workflow for issue #${this.issueNumber}${dryRunLabel}${ANSI.RESET}\n`);
  }

  completeWorkflow(result: WorkflowSummary): void {
    const duration = (result.durationMs / 1000).toFixed(1);
    const filesCount = result.filesModified.length;
    const statusColor = result.success ? ANSI.SUCCESS : ANSI.ERROR;
    
    this.write(`${statusColor}[automation] Complete: ${filesCount} files modified (${duration}s)${ANSI.RESET}\n`);
    this.write(`  ${ANSI.DIM}Tokens: ${result.inputTokens.toLocaleString()} in / ${result.outputTokens.toLocaleString()} out${ANSI.RESET}\n`);
    this.write(`  ${ANSI.DIM}Cost: $${result.totalCostUsd.toFixed(4)}${ANSI.RESET}\n`);
    
    if (result.specPath) {
      this.write(`  ${ANSI.DIM}Spec: ${result.specPath}${ANSI.RESET}\n`);
    }
    
    if (result.errorMessage && this.verbose) {
      this.write(`  ${ANSI.ERROR}Error: ${result.errorMessage}${ANSI.RESET}\n`);
    }
  }

  startPhase(phase: WorkflowPhase): void {
    this.phaseStartTime = performance.now();
    const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);
    this.write(`${ANSI.PHASE}[automation] Phase: ${phaseLabel}${ANSI.RESET}\n`);
  }

  completePhase(phase: WorkflowPhase, metadata?: Record<string, unknown>): void {
    const duration = this.phaseStartTime 
      ? ((performance.now() - this.phaseStartTime) / 1000).toFixed(1) 
      : "?";
    
    // Log metadata if present (spec_path, files_count, etc.)
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (key === "spec_path" && value) {
          this.logProgress(`Spec saved: ${value}`);
        } else if (key === "files_count" && value) {
          this.logProgress(`Files modified: ${value}`);
        } else if (key === "domain" && value) {
          this.logProgress(`Domain identified: ${value}`);
        } else if (key === "status" && value === "skipped") {
          this.logProgress("Skipped (dry run)");
        } else if (key === "pr_url" && value) {
          this.logProgress(`PR created: ${value}`);
        }
      }
    }
    
    this.logVerbose(`Phase ${phase} completed in ${duration}s`);
    this.phaseStartTime = null;
  }

  logToolUse(toolName: string, summary: string): void {
    if (this.verbose) {
      this.write(`  ${ANSI.ACTION}-> [VERBOSE] Tool: ${toolName}${ANSI.RESET}\n`);
      if (summary) {
        this.write(`    ${ANSI.DIM}${summary}${ANSI.RESET}\n`);
      }
    }
  }

  logToolComplete(toolName: string, summary: string): void {
    if (this.verbose && summary) {
      this.write(`  ${ANSI.ACTION}-> ${summary}${ANSI.RESET}\n`);
    }
  }

  /**
   * Log key action (file creation/modification) - always shown
   */
  logKeyAction(message: string): void {
    this.write(`  ${ANSI.ACTION}->${ANSI.RESET} ${message}\n`);
  }

  logProgress(message: string): void {
    this.write(`  ${ANSI.ACTION}->${ANSI.RESET} ${message}\n`);
  }

  logError(message: string, error?: Error): void {
    this.write(`${ANSI.ERROR}[ERROR]${ANSI.RESET} ${message}\n`);
    if (error && this.verbose && error.stack) {
      this.write(`${ANSI.DIM}${error.stack}${ANSI.RESET}\n`);
    }
  }

  logWarning(message: string): void {
    this.write(`${ANSI.WARNING}[WARN]${ANSI.RESET} ${message}\n`);
  }

  logVerbose(message: string): void {
    if (this.verbose) {
      this.write(`  ${ANSI.VERBOSE}${message}${ANSI.RESET}\n`);
    }
  }

  private write(text: string): void {
    try {
      process.stdout.write(text);
    } catch {
      // Fallback to stderr if stdout fails
      try {
        process.stderr.write(text);
      } catch {
        // Silent failure - cannot write to either stream
      }
    }
  }
}

/**
 * Summarize tool input for logging
 */
export function summarizeToolInput(toolName: string, toolInput: unknown): string {
  if (!toolInput || typeof toolInput !== "object") return "";
  
  const input = toolInput as Record<string, unknown>;
  
  switch (toolName) {
    case "Read":
      return `file: ${input.file_path}`;
    case "Write":
      return `file: ${input.file_path}`;
    case "Edit":
      return `file: ${input.file_path}`;
    case "Bash": {
      const cmd = String(input.command || "");
      return `cmd: ${cmd.length > 60 ? cmd.substring(0, 60) + "..." : cmd}`;
    }
    case "Grep":
      return `pattern: "${input.pattern}"`;
    case "Glob":
      return `pattern: "${input.pattern}"`;
    case "mcp__kotadb__search_code":
      return `term: "${input.term}"`;
    case "mcp__kotadb__search_dependencies":
      return `symbol: "${input.symbol}"`;
    default:
      return "";
  }
}

/**
 * Summarize tool output for key actions
 */
export function summarizeToolOutput(toolName: string, toolInput: unknown): string {
  if (!toolInput || typeof toolInput !== "object") return "";
  
  const input = toolInput as Record<string, unknown>;
  
  switch (toolName) {
    case "Write":
      return `Created: ${input.file_path || "unknown"}`;
    case "Edit":
      return `Modified: ${input.file_path || "unknown"}`;
    case "Bash": {
      const cmd = String(input.command || "");
      if (cmd.includes("test")) {
        return "Running tests...";
      }
      if (cmd.includes("tsc")) {
        return "Type checking...";
      }
      if (cmd.includes("lint")) {
        return "Linting...";
      }
      return "";
    }
    default:
      return "";
  }
}

/**
 * Determine if tool action should always be logged (not just verbose)
 */
export function isKeyAction(toolName: string): boolean {
  return ["Write", "Edit"].includes(toolName);
}
