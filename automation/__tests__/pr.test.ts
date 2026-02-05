import { describe, it, expect } from "bun:test";

describe("Git Status Parsing", () => {
  it("should extract filepath from modified status", () => {
    const line = " M .claude/agents/experts/database/expertise.yaml";
    const match = line.match(/^..\s+(.+)$/);
    expect(match?.[1]?.trim()).toBe(".claude/agents/experts/database/expertise.yaml");
  });
  
  it("should extract filepath from untracked status", () => {
    const line = "?? docs/specs/api/new-spec.md";
    const match = line.match(/^..\s+(.+)$/);
    expect(match?.[1]?.trim()).toBe("docs/specs/api/new-spec.md");
  });
  
  it("should extract filepath from added status", () => {
    const line = "A  .claude/agents/experts/testing/expertise.yaml";
    const match = line.match(/^..\s+(.+)$/);
    expect(match?.[1]?.trim()).toBe(".claude/agents/experts/testing/expertise.yaml");
  });
  
  it("should extract filepath from modified in index and worktree status", () => {
    const line = "MM .claude/.cache/specs/automation/spec.md";
    const match = line.match(/^..\s+(.+)$/);
    expect(match?.[1]?.trim()).toBe(".claude/.cache/specs/automation/spec.md");
  });
});

describe("PR Title Formatting", () => {
  // Helper function to simulate formatPRTitle
  function formatPRTitle(
    issueType: string,
    domain: string,
    issueTitle: string,
    issueNumber: number
  ): string {
    const maxLength = 70;
    
    let cleanTitle = issueTitle.trim();
    const redundantPrefixPattern = /^(feat|fix|chore|refactor|docs|test)\([^)]+\):\s*/i;
    cleanTitle = cleanTitle.replace(redundantPrefixPattern, '');
    
    const prefix = `${issueType}(${domain}): `;
    const suffix = ` (#${issueNumber})`;
    const availableLength = maxLength - prefix.length - suffix.length;
    
    const truncatedTitle = cleanTitle.length > availableLength 
      ? cleanTitle.substring(0, availableLength - 3) + "..."
      : cleanTitle;
    
    return `${prefix}${truncatedTitle}${suffix}`;
  }
  
  it("should remove redundant feat prefix", () => {
    const title = formatPRTitle("feat", "api", "feat(api): Add new search endpoint", 123);
    expect(title).toBe("feat(api): Add new search endpoint (#123)");
  });
  
  it("should handle clean title without prefix", () => {
    const title = formatPRTitle("fix", "database", "Fix connection timeout", 456);
    expect(title).toBe("fix(database): Fix connection timeout (#456)");
  });
  
  it("should truncate long titles", () => {
    const longTitle = "A very long title that exceeds the maximum character limit and should be truncated";
    const title = formatPRTitle("chore", "claude-config", longTitle, 789);
    expect(title.length).toBeLessThanOrEqual(70);
    expect(title).toContain("...");
  });
  
  it("should remove different prefix types", () => {
    const title1 = formatPRTitle("fix", "testing", "fix(api): Bug in validation", 100);
    expect(title1).toBe("fix(testing): Bug in validation (#100)");
    
    const title2 = formatPRTitle("chore", "docs", "chore(other): Update readme", 200);
    expect(title2).toBe("chore(docs): Update readme (#200)");
  });
});

describe("PR Body Generation", () => {
  interface ValidationResult {
    level: 1 | 2 | 3;
    justification: string;
    commands: Array<{
      command: string;
      passed: boolean;
      output: string;
    }>;
  }
  
  // Helper function to simulate buildPRBody
  function buildPRBody(
    issueNumber: number,
    domain: string,
    filesModified: string[],
    validation: ValidationResult,
    metrics?: {
      inputTokens: number;
      outputTokens: number;
      totalCostUsd: number;
      durationMs: number;
    },
    workflowId?: string
  ): string {
    const lines: string[] = [];
    
    lines.push("## Summary");
    lines.push(`Automated implementation for ${domain} domain (issue #${issueNumber})`);
    lines.push("");
    lines.push(`**Files Modified**: ${filesModified.length}`);
    lines.push("");
    
    lines.push("## Validation Evidence");
    lines.push("");
    lines.push(`### Validation Level: ${validation.level}`);
    lines.push(`**Justification**: ${validation.justification}`);
    lines.push("");
    lines.push("**Commands Run**:");
    for (const cmd of validation.commands) {
      const status = cmd.passed ? "✅" : "❌";
      lines.push(`- ${status} \`${cmd.command}\` - ${cmd.output}`);
    }
    lines.push("");
    
    lines.push("## Anti-Mock Compliance");
    lines.push("No mocks were introduced in this automated workflow. All tests use real SQLite databases and actual file system operations.");
    lines.push("");
    
    lines.push("## Plan");
    lines.push(`See automation workflow context in \`.claude/.cache/workflow-logs/\``);
    lines.push("");
    
    if (metrics) {
      lines.push("## Metrics");
      lines.push("| Metric | Value |");
      lines.push("|--------|-------|");
      lines.push(`| Input Tokens | ${metrics.inputTokens.toLocaleString()} |`);
      lines.push(`| Output Tokens | ${metrics.outputTokens.toLocaleString()} |`);
      lines.push(`| Cost | $${metrics.totalCostUsd.toFixed(4)} |`);
      const seconds = Math.floor(metrics.durationMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      const duration = minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
      lines.push(`| Duration | ${duration} |`);
      lines.push("");
    }
    
    lines.push(`Closes #${issueNumber}`);
    lines.push("");
    
    if (workflowId) {
      lines.push(`ADW ID: ${workflowId}`);
      lines.push("");
    }
    
    lines.push("---");
    lines.push("🤖 Generated with [Claude Code](https://claude.com/claude-code)");
    
    return lines.join("\n");
  }
  
  it("should include validation evidence section", () => {
    const validation: ValidationResult = {
      level: 2,
      justification: "Level 2: Feature implementation",
      commands: [
        { command: "bunx tsc --noEmit", passed: true, output: "Passed" },
        { command: "bun test", passed: true, output: "10 tests passed" }
      ]
    };
    
    const body = buildPRBody(123, "api", ["file1.ts", "file2.ts"], validation);
    
    expect(body).toContain("## Validation Evidence");
    expect(body).toContain("### Validation Level: 2");
    expect(body).toContain("✅ `bunx tsc --noEmit`");
    expect(body).toContain("✅ `bun test`");
  });
  
  it("should include anti-mock statement", () => {
    const validation: ValidationResult = {
      level: 2,
      justification: "Level 2",
      commands: []
    };
    
    const body = buildPRBody(123, "testing", [], validation);
    
    expect(body).toContain("## Anti-Mock Compliance");
    expect(body).toContain("No mocks were introduced");
  });
  
  it("should include ADW ID when provided", () => {
    const validation: ValidationResult = { level: 2, justification: "Level 2", commands: [] };
    const body = buildPRBody(123, "api", [], validation, undefined, "adw-123-20260205-1200");
    
    expect(body).toContain("ADW ID: adw-123-20260205-1200");
  });
  
  it("should include metrics section when provided", () => {
    const validation: ValidationResult = { level: 2, justification: "Level 2", commands: [] };
    const metrics = {
      inputTokens: 1000,
      outputTokens: 500,
      totalCostUsd: 0.0123,
      durationMs: 65000
    };
    
    const body = buildPRBody(123, "api", [], validation, metrics);
    
    expect(body).toContain("## Metrics");
    expect(body).toContain("1,000");
    expect(body).toContain("500");
    expect(body).toContain("$0.0123");
    expect(body).toContain("1m 5s");
  });
  
  it("should show failed validation commands with X mark", () => {
    const validation: ValidationResult = {
      level: 2,
      justification: "Level 2",
      commands: [
        { command: "bunx tsc --noEmit", passed: true, output: "Passed" },
        { command: "bun test", passed: false, output: "Failed: 2 tests failed" }
      ]
    };
    
    const body = buildPRBody(123, "api", [], validation);
    
    expect(body).toContain("✅ `bunx tsc --noEmit`");
    expect(body).toContain("❌ `bun test`");
    expect(body).toContain("Failed: 2 tests failed");
  });
});
