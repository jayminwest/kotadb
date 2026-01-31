/**
 * Unit tests for ConsoleReporter
 */
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { 
  ConsoleReporter, 
  ANSI,
  summarizeToolInput,
  summarizeToolOutput,
  isKeyAction
} from "./reporter.ts";

describe("ConsoleReporter", () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let mockWrite: ReturnType<typeof mock>;
  let capturedOutput: string[];

  beforeEach(() => {
    capturedOutput = [];
    originalStdoutWrite = process.stdout.write;
    mockWrite = mock((text: string) => {
      capturedOutput.push(text);
      return true;
    });
    process.stdout.write = mockWrite as unknown as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  describe("startWorkflow", () => {
    test("outputs correct format with issue number", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.startWorkflow(false);
      
      expect(capturedOutput.length).toBe(1);
      expect(capturedOutput[0]).toContain("[automation] Starting workflow for issue #123");
      expect(capturedOutput[0]).toContain(ANSI.PHASE);
    });

    test("includes dry run label when dryRun is true", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 456 });
      reporter.startWorkflow(true);
      
      expect(capturedOutput[0]).toContain("(dry run)");
    });
  });

  describe("startPhase", () => {
    test("capitalizes phase name", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.startPhase("analysis");
      
      expect(capturedOutput[0]).toContain("Phase: Analysis");
    });

    test("uses PHASE color", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.startPhase("build");
      
      expect(capturedOutput[0]).toContain(ANSI.PHASE);
    });
  });

  describe("completePhase", () => {
    test("logs metadata when present", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.startPhase("plan");
      reporter.completePhase("plan", { spec_path: "/path/to/spec.md" });
      
      const combined = capturedOutput.join("");
      expect(combined).toContain("Spec saved: /path/to/spec.md");
    });

    test("logs domain when present", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.startPhase("analysis");
      reporter.completePhase("analysis", { domain: "automation" });
      
      const combined = capturedOutput.join("");
      expect(combined).toContain("Domain identified: automation");
    });

    test("logs files count when present", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.startPhase("build");
      reporter.completePhase("build", { files_count: 5 });
      
      const combined = capturedOutput.join("");
      expect(combined).toContain("Files modified: 5");
    });

    test("logs skipped status for dry run", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.startPhase("improve");
      reporter.completePhase("improve", { status: "skipped" });
      
      const combined = capturedOutput.join("");
      expect(combined).toContain("Skipped (dry run)");
    });
  });

  describe("logProgress", () => {
    test("formats with arrow prefix", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.logProgress("Test message");
      
      expect(capturedOutput[0]).toContain("->");
      expect(capturedOutput[0]).toContain("Test message");
    });
  });

  describe("logError", () => {
    test("uses red ANSI color with [ERROR] prefix", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.logError("Test error");
      
      expect(capturedOutput[0]).toContain(ANSI.ERROR);
      expect(capturedOutput[0]).toContain("[ERROR]");
      expect(capturedOutput[0]).toContain("Test error");
    });

    test("includes stack trace in verbose mode", () => {
      const reporter = new ConsoleReporter({ verbose: true, issueNumber: 123 });
      const error = new Error("Test error with stack");
      reporter.logError("Error occurred", error);
      
      const combined = capturedOutput.join("");
      expect(combined).toContain("Error: Test error with stack");
    });

    test("does not include stack trace in non-verbose mode", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      const error = new Error("Test error with stack");
      reporter.logError("Error occurred", error);
      
      expect(capturedOutput.length).toBe(1);
      expect(capturedOutput[0]).not.toContain("at ");
    });
  });

  describe("logWarning", () => {
    test("uses yellow ANSI color with [WARN] prefix", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.logWarning("Test warning");
      
      expect(capturedOutput[0]).toContain(ANSI.WARNING);
      expect(capturedOutput[0]).toContain("[WARN]");
      expect(capturedOutput[0]).toContain("Test warning");
    });
  });

  describe("logVerbose", () => {
    test("only outputs when verbose=true", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.logVerbose("Verbose message");
      
      expect(capturedOutput.length).toBe(0);
    });

    test("outputs when verbose=true", () => {
      const reporter = new ConsoleReporter({ verbose: true, issueNumber: 123 });
      reporter.logVerbose("Verbose message");
      
      expect(capturedOutput.length).toBe(1);
      expect(capturedOutput[0]).toContain("Verbose message");
      expect(capturedOutput[0]).toContain(ANSI.VERBOSE);
    });
  });

  describe("logToolUse", () => {
    test("only outputs when verbose=true", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.logToolUse("Read", "file: /path/to/file");
      
      expect(capturedOutput.length).toBe(0);
    });

    test("outputs tool name and summary when verbose=true", () => {
      const reporter = new ConsoleReporter({ verbose: true, issueNumber: 123 });
      reporter.logToolUse("Read", "file: /path/to/file");
      
      const combined = capturedOutput.join("");
      expect(combined).toContain("[VERBOSE] Tool: Read");
      expect(combined).toContain("file: /path/to/file");
    });
  });

  describe("logKeyAction", () => {
    test("always outputs regardless of verbosity", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.logKeyAction("Created: /path/to/file.ts");
      
      expect(capturedOutput.length).toBe(1);
      expect(capturedOutput[0]).toContain("Created: /path/to/file.ts");
    });
  });

  describe("completeWorkflow", () => {
    test("shows success color for successful workflow", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.completeWorkflow({
        success: true,
        durationMs: 45200,
        inputTokens: 12450,
        outputTokens: 3892,
        totalCostUsd: 0.1234,
        filesModified: ["file1.ts", "file2.ts"],
        specPath: "/path/to/spec.md"
      });
      
      const combined = capturedOutput.join("");
      expect(combined).toContain(ANSI.SUCCESS);
      expect(combined).toContain("2 files modified");
      expect(combined).toContain("45.2s");
    });

    test("shows error color for failed workflow", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.completeWorkflow({
        success: false,
        durationMs: 5100,
        inputTokens: 234,
        outputTokens: 45,
        totalCostUsd: 0.0012,
        filesModified: [],
        specPath: null,
        errorMessage: "Something went wrong"
      });
      
      const combined = capturedOutput.join("");
      expect(combined).toContain(ANSI.ERROR);
      expect(combined).toContain("0 files modified");
    });

    test("includes token and cost information", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      reporter.completeWorkflow({
        success: true,
        durationMs: 10000,
        inputTokens: 1000,
        outputTokens: 500,
        totalCostUsd: 0.0500,
        filesModified: [],
        specPath: null
      });
      
      const combined = capturedOutput.join("");
      expect(combined).toContain("Tokens:");
      expect(combined).toContain("Cost: $0.0500");
    });
  });

  describe("isVerbose", () => {
    test("returns false when verbose=false", () => {
      const reporter = new ConsoleReporter({ verbose: false, issueNumber: 123 });
      expect(reporter.isVerbose()).toBe(false);
    });

    test("returns true when verbose=true", () => {
      const reporter = new ConsoleReporter({ verbose: true, issueNumber: 123 });
      expect(reporter.isVerbose()).toBe(true);
    });
  });
});

describe("summarizeToolInput", () => {
  test("summarizes Read tool input", () => {
    const result = summarizeToolInput("Read", { file_path: "/path/to/file.ts" });
    expect(result).toBe("file: /path/to/file.ts");
  });

  test("summarizes Write tool input", () => {
    const result = summarizeToolInput("Write", { file_path: "/path/to/new.ts" });
    expect(result).toBe("file: /path/to/new.ts");
  });

  test("summarizes Edit tool input", () => {
    const result = summarizeToolInput("Edit", { file_path: "/path/to/edit.ts" });
    expect(result).toBe("file: /path/to/edit.ts");
  });

  test("summarizes Bash tool input and truncates long commands", () => {
    const shortCmd = "ls -la";
    expect(summarizeToolInput("Bash", { command: shortCmd })).toBe("cmd: ls -la");

    const longCmd = "a".repeat(100);
    const result = summarizeToolInput("Bash", { command: longCmd });
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(70);
  });

  test("summarizes Grep tool input", () => {
    const result = summarizeToolInput("Grep", { pattern: "function.*test" });
    expect(result).toBe('pattern: "function.*test"');
  });

  test("summarizes Glob tool input", () => {
    const result = summarizeToolInput("Glob", { pattern: "**/*.ts" });
    expect(result).toBe('pattern: "**/*.ts"');
  });

  test("summarizes MCP search_code tool input", () => {
    const result = summarizeToolInput("mcp__kotadb__search_code", { term: "console output" });
    expect(result).toBe('term: "console output"');
  });

  test("returns empty string for unknown tool", () => {
    const result = summarizeToolInput("UnknownTool", { foo: "bar" });
    expect(result).toBe("");
  });

  test("returns empty string for null/undefined input", () => {
    expect(summarizeToolInput("Read", null)).toBe("");
    expect(summarizeToolInput("Read", undefined)).toBe("");
  });
});

describe("summarizeToolOutput", () => {
  test("summarizes Write tool as Created", () => {
    const result = summarizeToolOutput("Write", { file_path: "/path/to/new.ts" });
    expect(result).toBe("Created: /path/to/new.ts");
  });

  test("summarizes Edit tool as Modified", () => {
    const result = summarizeToolOutput("Edit", { file_path: "/path/to/edit.ts" });
    expect(result).toBe("Modified: /path/to/edit.ts");
  });

  test("summarizes Bash test command", () => {
    const result = summarizeToolOutput("Bash", { command: "bun test" });
    expect(result).toBe("Running tests...");
  });

  test("summarizes Bash tsc command", () => {
    const result = summarizeToolOutput("Bash", { command: "bunx tsc --noEmit" });
    expect(result).toBe("Type checking...");
  });

  test("summarizes Bash lint command", () => {
    const result = summarizeToolOutput("Bash", { command: "bun run lint" });
    expect(result).toBe("Linting...");
  });

  test("returns empty string for other Bash commands", () => {
    const result = summarizeToolOutput("Bash", { command: "git status" });
    expect(result).toBe("");
  });

  test("returns empty string for unknown tool", () => {
    const result = summarizeToolOutput("UnknownTool", { foo: "bar" });
    expect(result).toBe("");
  });
});

describe("isKeyAction", () => {
  test("returns true for Write", () => {
    expect(isKeyAction("Write")).toBe(true);
  });

  test("returns true for Edit", () => {
    expect(isKeyAction("Edit")).toBe(true);
  });

  test("returns false for Read", () => {
    expect(isKeyAction("Read")).toBe(false);
  });

  test("returns false for Bash", () => {
    expect(isKeyAction("Bash")).toBe(false);
  });

  test("returns false for Grep", () => {
    expect(isKeyAction("Grep")).toBe(false);
  });
});
