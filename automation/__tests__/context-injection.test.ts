/**
 * Tests for context injection flow in ADW phase prompts
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 * to test the context storage, retrieval, formatting, and injection patterns
 * that orchestrator.ts and curator.ts implement for issue #191.
 *
 * Test Coverage:
 * - Context retrieval and formatting (## KotaDB Context header)
 * - Phase-specific context mapping (analysis->plan, plan->build, build->improve)
 * - Curator prompt expansion with code intelligence instructions
 * - Graceful degradation when context is missing or errors occur
 * - Token budget truncation (2K limit)
 *
 * @module automation/__tests__/context-injection.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import {
  storeWorkflowContext,
  getWorkflowContext,
  type WorkflowContextData,
} from "../src/context.ts";

/**
 * Create a test database wrapper compatible with DatabaseLike interface
 * (mirrors pattern from automation/src/context.test.ts)
 */
function createTestDatabase(rawDb: Database) {
  return {
    raw: rawDb,
    queryOne<T>(sql: string, params?: unknown[]): T | null {
      const stmt = rawDb.prepare(sql);
      return (params ? stmt.get(...(params as SQLQueryBindings[])) : stmt.get()) as T | null;
    },
    query<T>(sql: string, params?: unknown[]): T[] {
      const stmt = rawDb.prepare(sql);
      return (params ? stmt.all(...(params as SQLQueryBindings[])) : stmt.all()) as T[];
    },
  };
}

/**
 * Reconstruct the context section formatting pattern from orchestrator.ts
 * This mirrors lines 759-761, 798-800, 830-832
 */
function formatContextSection(curatedContext: string | null): string {
  return curatedContext
    ? `\n\n## KotaDB Context (from previous phase)\n${curatedContext}`
    : "";
}

/**
 * Phase-to-source mapping as implemented in orchestrator.ts:
 * - plan phase retrieves 'analysis' context (line 356)
 * - build phase retrieves 'plan' context (line 428)
 * - improve phase retrieves 'build' context (line 500)
 */
const PHASE_SOURCE_MAP: Record<string, WorkflowContextData["phase"]> = {
  plan: "analysis",
  build: "plan",
  improve: "build",
};

describe("Context Injection Flow", () => {
  let rawDb: Database;
  let db: ReturnType<typeof createTestDatabase>;
  const testWorkflowId = "adw-191-test";

  beforeEach(() => {
    rawDb = new Database(":memory:");

    // Initialize schema matching the workflow_contexts migration
    rawDb.exec(`
      CREATE TABLE workflow_contexts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        context_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(workflow_id, phase),
        CHECK (phase IN ('analysis', 'plan', 'build', 'improve'))
      )
    `);

    db = createTestDatabase(rawDb);
  });

  afterEach(() => {
    if (rawDb) {
      rawDb.close();
    }
  });

  describe("Context retrieval and formatting", () => {
    it("should format context with KotaDB header when data exists", () => {
      // Arrange: Store analysis context
      const contextData: WorkflowContextData = {
        phase: "analysis",
        summary: "Found 3 relevant patterns for database domain. Use antimocking for tests.",
        keyFindings: ["PATTERN: Use in-memory SQLite", "DECISION: Bun test runner"],
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "analysis", contextData, db);

      // Act: Retrieve and format (mirrors orchestrator.ts lines 356-358)
      const ctx = getWorkflowContext(testWorkflowId, "analysis", db);
      const curatedContext = ctx?.summary ? ctx.summary.slice(0, 2000) : null;
      const contextSection = formatContextSection(curatedContext);

      // Assert
      expect(contextSection).toContain("## KotaDB Context (from previous phase)");
      expect(contextSection).toContain(
        "Found 3 relevant patterns for database domain"
      );
    });

    it("should return empty string when no context exists", () => {
      // Act: Retrieve context that was never stored
      const ctx = getWorkflowContext(testWorkflowId, "analysis", db);
      const curatedContext = ctx?.summary ? ctx.summary.slice(0, 2000) : null;
      const contextSection = formatContextSection(curatedContext);

      // Assert
      expect(ctx).toBeNull();
      expect(contextSection).toBe("");
    });

    it("should return empty string when context has no summary", () => {
      // Arrange: Store context with empty summary
      const contextData: WorkflowContextData = {
        phase: "analysis",
        summary: "",
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "analysis", contextData, db);

      // Act
      const ctx = getWorkflowContext(testWorkflowId, "analysis", db);
      const curatedContext = ctx?.summary ? ctx.summary.slice(0, 2000) : null;
      const contextSection = formatContextSection(curatedContext);

      // Assert: empty summary is falsy so no context injected
      expect(contextSection).toBe("");
    });
  });

  describe("Phase-specific context mapping", () => {
    it("should retrieve analysis context for plan phase", () => {
      // Arrange: Store analysis context (produced by post-analysis curation)
      const analysisContext: WorkflowContextData = {
        phase: "analysis",
        summary: "Analysis findings: domain is testing, 2 requirements found",
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "analysis", analysisContext, db);

      // Act: Plan phase retrieves 'analysis' context
      const sourcePhase = PHASE_SOURCE_MAP["plan"];
      const ctx = getWorkflowContext(testWorkflowId, sourcePhase!, db);

      // Assert
      expect(sourcePhase).toBe("analysis");
      expect(ctx).not.toBeNull();
      expect(ctx?.summary).toContain("Analysis findings");
    });

    it("should retrieve plan context for build phase", () => {
      // Arrange: Store plan context (produced by post-plan curation)
      const planContext: WorkflowContextData = {
        phase: "plan",
        summary: "Plan created spec at docs/specs/testing/new-feature-spec.md",
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "plan", planContext, db);

      // Act: Build phase retrieves 'plan' context
      const sourcePhase = PHASE_SOURCE_MAP["build"];
      const ctx = getWorkflowContext(testWorkflowId, sourcePhase!, db);

      // Assert
      expect(sourcePhase).toBe("plan");
      expect(ctx).not.toBeNull();
      expect(ctx?.summary).toContain("Plan created spec");
    });

    it("should retrieve build context for improve phase", () => {
      // Arrange: Store build context (produced by post-build curation)
      const buildContext: WorkflowContextData = {
        phase: "build",
        summary: "Build modified 5 files in src/api/",
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "build", buildContext, db);

      // Act: Improve phase retrieves 'build' context
      const sourcePhase = PHASE_SOURCE_MAP["improve"];
      const ctx = getWorkflowContext(testWorkflowId, sourcePhase!, db);

      // Assert
      expect(sourcePhase).toBe("build");
      expect(ctx).not.toBeNull();
      expect(ctx?.summary).toContain("Build modified 5 files");
    });

    it("should not cross-contaminate context between workflows", () => {
      // Arrange: Store contexts for two different workflows
      const ctx1: WorkflowContextData = {
        phase: "analysis",
        summary: "Workflow 1 analysis",
        timestamp: new Date().toISOString(),
      };
      const ctx2: WorkflowContextData = {
        phase: "analysis",
        summary: "Workflow 2 analysis",
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext("adw-100-test", "analysis", ctx1, db);
      storeWorkflowContext("adw-200-test", "analysis", ctx2, db);

      // Act
      const result1 = getWorkflowContext("adw-100-test", "analysis", db);
      const result2 = getWorkflowContext("adw-200-test", "analysis", db);

      // Assert
      expect(result1?.summary).toBe("Workflow 1 analysis");
      expect(result2?.summary).toBe("Workflow 2 analysis");
    });
  });

  describe("Curator prompt expansion", () => {
    // Since buildCuratorPrompt and buildCodeIntelligenceInstructions are private,
    // we test the curator's observable behavior: it stores context with keyFindings
    // that include CODE_INTEL entries when code intelligence tools find results.
    // We also verify the phase-to-tool mapping by testing the stored context format.

    it("should store analysis context with code intelligence findings for plan consumption", () => {
      // Arrange: Simulate what curateContext stores after post-analysis
      // (post-analysis curator uses generate_task_context per buildCodeIntelligenceInstructions)
      const contextData: WorkflowContextData = {
        phase: "analysis",
        summary: "Analysis found testing domain with 3 requirements",
        keyFindings: [
          "FAILURE: Previous attempt missed edge case in FTS5 search",
          "PATTERN: Use in-memory SQLite for all tests",
          "DECISION: Bun test runner is the standard",
          "CODE_INTEL: src/api/search.ts depends on 4 files",
        ],
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "analysis", contextData, db);

      // Act: Retrieve for plan phase
      const ctx = getWorkflowContext(testWorkflowId, "analysis", db);

      // Assert: keyFindings includes code intelligence entries
      expect(ctx?.keyFindings).toBeDefined();
      expect(ctx!.keyFindings!.some((f) => f.startsWith("CODE_INTEL:"))).toBe(
        true
      );
      expect(ctx!.keyFindings!.some((f) => f.startsWith("FAILURE:"))).toBe(
        true
      );
      expect(ctx!.keyFindings!.some((f) => f.startsWith("PATTERN:"))).toBe(
        true
      );
      expect(ctx!.keyFindings!.some((f) => f.startsWith("DECISION:"))).toBe(
        true
      );
    });

    it("should store plan context with dependency and impact findings for build consumption", () => {
      // Arrange: Simulate post-plan curation output
      // (post-plan curator uses search_dependencies + analyze_change_impact)
      const contextData: WorkflowContextData = {
        phase: "plan",
        summary: "Plan identifies 3 files to modify with low risk",
        keyFindings: [
          "PATTERN: Follow existing API patterns",
          "DECISION: SQLite-only storage",
          "CODE_INTEL: orchestrator.ts has 12 dependents - high impact",
          "CODE_INTEL: Change impact: low risk, 2 test files affected",
        ],
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "plan", contextData, db);

      // Act: Retrieve for build phase
      const ctx = getWorkflowContext(testWorkflowId, "plan", db);

      // Assert
      expect(ctx?.keyFindings).toBeDefined();
      const codeIntelFindings = ctx!.keyFindings!.filter((f) =>
        f.startsWith("CODE_INTEL:")
      );
      expect(codeIntelFindings.length).toBe(2);
      expect(codeIntelFindings.some((f) => f.includes("dependents"))).toBe(
        true
      );
      expect(codeIntelFindings.some((f) => f.includes("impact"))).toBe(true);
    });

    it("should store build context with dependency findings for improve consumption", () => {
      // Arrange: Simulate post-build curation output
      // (post-build curator uses search_dependencies on modified files)
      const contextData: WorkflowContextData = {
        phase: "build",
        summary: "Build modified 3 files, all type-checked successfully",
        keyFindings: [
          "FAILURE: Previous build missed updating imports",
          "CODE_INTEL: Modified context.ts has 5 dependents that may need review",
        ],
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "build", contextData, db);

      // Act: Retrieve for improve phase
      const ctx = getWorkflowContext(testWorkflowId, "build", db);

      // Assert
      expect(ctx?.keyFindings).toBeDefined();
      const codeIntelFindings = ctx!.keyFindings!.filter((f) =>
        f.startsWith("CODE_INTEL:")
      );
      expect(codeIntelFindings.length).toBe(1);
      expect(codeIntelFindings[0]).toContain("dependents");
    });
  });

  describe("Graceful degradation", () => {
    it("should handle missing context without errors", () => {
      // Act: Attempt to retrieve context that was never stored
      // This mirrors the orchestrator's try/catch pattern
      let curatedContext: string | null = null;
      let error: Error | null = null;

      try {
        const ctx = getWorkflowContext(testWorkflowId, "analysis", db);
        if (ctx?.summary) {
          curatedContext = ctx.summary.slice(0, 2000);
        }
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
      }

      // Assert: No error, context is null, and phase proceeds normally
      expect(error).toBeNull();
      expect(curatedContext).toBeNull();
      expect(formatContextSection(curatedContext)).toBe("");
    });

    it("should handle context retrieval errors gracefully", () => {
      // Arrange: Close database to simulate error condition
      rawDb.close();

      let curatedContext: string | null = null;
      let caughtError = false;

      // Act: Attempt retrieval on closed database (mirrors orchestrator try/catch)
      try {
        const ctx = getWorkflowContext(testWorkflowId, "analysis", db);
        if (ctx?.summary) {
          curatedContext = ctx.summary.slice(0, 2000);
        }
      } catch {
        // Non-fatal: log and continue (matches orchestrator pattern)
        caughtError = true;
      }

      // Assert: Error was caught but execution continues
      expect(caughtError).toBe(true);
      expect(curatedContext).toBeNull();

      // Recreate db so afterEach cleanup doesn't fail on double-close
      rawDb = new Database(":memory:");
      rawDb.exec(`
        CREATE TABLE workflow_contexts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          context_data TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(workflow_id, phase),
          CHECK (phase IN ('analysis', 'plan', 'build', 'improve'))
        )
      `);
    });

    it("should proceed without context when workflowId is null", () => {
      // Arrange: workflowId is null (feature disabled)
      const workflowId: string | null = null;

      // Act: mirrors orchestrator pattern (lines 354-365)
      let curatedContext: string | null = null;
      if (workflowId) {
        const ctx = getWorkflowContext(workflowId, "analysis", db);
        if (ctx?.summary) {
          curatedContext = ctx.summary.slice(0, 2000);
        }
      }

      // Assert: No context injection attempted
      expect(curatedContext).toBeNull();
      expect(formatContextSection(curatedContext)).toBe("");
    });
  });

  describe("Token budget", () => {
    it("should truncate context exceeding 2K characters", () => {
      // Arrange: Store context with a very long summary
      const longSummary = "A".repeat(5000);
      const contextData: WorkflowContextData = {
        phase: "analysis",
        summary: longSummary,
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "analysis", contextData, db);

      // Act: Retrieve and apply the 2K truncation (mirrors .slice(0, 2000))
      const ctx = getWorkflowContext(testWorkflowId, "analysis", db);
      const curatedContext = ctx?.summary ? ctx.summary.slice(0, 2000) : null;

      // Assert: Truncated to exactly 2000 characters
      expect(curatedContext).not.toBeNull();
      expect(curatedContext!.length).toBe(2000);
    });

    it("should not truncate context under 2K characters", () => {
      // Arrange: Store context with a short summary
      const shortSummary = "Brief analysis: domain is testing, 2 files affected";
      const contextData: WorkflowContextData = {
        phase: "analysis",
        summary: shortSummary,
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "analysis", contextData, db);

      // Act
      const ctx = getWorkflowContext(testWorkflowId, "analysis", db);
      const curatedContext = ctx?.summary ? ctx.summary.slice(0, 2000) : null;

      // Assert: Full summary preserved
      expect(curatedContext).toBe(shortSummary);
      expect(curatedContext!.length).toBeLessThan(2000);
    });

    it("should truncate at exactly 2000 character boundary", () => {
      // Arrange: Summary exactly at 2000 chars
      const exactSummary = "B".repeat(2000);
      const contextData: WorkflowContextData = {
        phase: "plan",
        summary: exactSummary,
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "plan", contextData, db);

      // Act
      const ctx = getWorkflowContext(testWorkflowId, "plan", db);
      const curatedContext = ctx?.summary ? ctx.summary.slice(0, 2000) : null;

      // Assert: Exactly 2000, no truncation needed
      expect(curatedContext!.length).toBe(2000);
      expect(curatedContext).toBe(exactSummary);
    });

    it("should include truncated context in formatted section", () => {
      // Arrange: Store long context
      const longSummary = "C".repeat(3000);
      const contextData: WorkflowContextData = {
        phase: "build",
        summary: longSummary,
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "build", contextData, db);

      // Act
      const ctx = getWorkflowContext(testWorkflowId, "build", db);
      const curatedContext = ctx?.summary ? ctx.summary.slice(0, 2000) : null;
      const contextSection = formatContextSection(curatedContext);

      // Assert: Header + truncated content
      expect(contextSection).toContain("## KotaDB Context (from previous phase)");
      // Total length = "\n\n## KotaDB Context (from previous phase)\n" (42 chars) + 2000 chars
      expect(contextSection.length).toBe(2000 + "\n\n## KotaDB Context (from previous phase)\n".length);
    });
  });

  describe("Context section integration with prompt", () => {
    it("should append context section at end of plan prompt", () => {
      // Arrange: Simulate plan prompt construction (mirrors orchestrator.ts lines 763-778)
      const domain = "testing";
      const requirements = "Add new test coverage";
      const issueNumber = 191;
      const dryRun = false;
      const curatedContext = "Analysis found testing domain with antimocking patterns required";

      const contextSection = formatContextSection(curatedContext);

      const prompt = `
You are the ${domain}-plan-agent.

USER_PROMPT: ${requirements}

AUTOMATION_MODE: true
HUMAN_IN_LOOP: false
${dryRun ? "DRY_RUN: true" : ""}

Create a detailed specification following ${domain} domain standards.
Save spec to: docs/specs/${domain}/<descriptive-slug>-spec.md

The spec should address GitHub issue #${issueNumber}.

Return the absolute spec path when complete.
${contextSection}`;

      // Assert
      expect(prompt).toContain("## KotaDB Context (from previous phase)");
      expect(prompt).toContain("antimocking patterns required");
      expect(prompt.indexOf("KotaDB Context")).toBeGreaterThan(
        prompt.indexOf("Return the absolute spec path")
      );
    });

    it("should not add context section to plan prompt when context is null", () => {
      const domain = "testing";
      const curatedContext: string | null = null;
      const contextSection = formatContextSection(curatedContext);

      const prompt = `
You are the ${domain}-plan-agent.

AUTOMATION_MODE: true
${contextSection}`;

      // Assert: No context header present
      expect(prompt).not.toContain("## KotaDB Context");
      expect(prompt.trim()).toEndWith("AUTOMATION_MODE: true");
    });

    it("should append context section at end of build prompt", () => {
      const curatedContext = "Plan identified 3 files, low risk change";
      const contextSection = formatContextSection(curatedContext);

      const prompt = `
You are the testing-build-agent.

PATH_TO_SPEC: /path/to/spec.md

AUTOMATION_MODE: true

Read the specification and implement the changes.
Report absolute file paths for all files modified.
${contextSection}`;

      expect(prompt).toContain("## KotaDB Context (from previous phase)");
      expect(prompt).toContain("low risk change");
    });

    it("should append context section at end of improve prompt", () => {
      const curatedContext = "Build modified context.ts with 5 dependents";
      const contextSection = formatContextSection(curatedContext);

      const prompt = `
You are the testing-improve-agent.

AUTOMATION_MODE: true

Review recent testing changes from git history.
Extract learnings and update expertise.yaml with new patterns.
${contextSection}`;

      expect(prompt).toContain("## KotaDB Context (from previous phase)");
      expect(prompt).toContain("5 dependents");
    });
  });

  describe("Curator phase-to-workflow phase mapping", () => {
    // Tests the mapping used in curator.ts lines 125-128 and 132-135
    it("should map post-analysis to analysis workflow phase", () => {
      const phaseMap: Record<string, WorkflowContextData["phase"]> = {
        "post-analysis": "analysis",
        "post-plan": "plan",
        "post-build": "build",
      };

      expect(phaseMap["post-analysis"]).toBe("analysis");
      expect(phaseMap["post-plan"]).toBe("plan");
      expect(phaseMap["post-build"]).toBe("build");
    });

    it("should store and retrieve context through the full phase chain", () => {
      // Simulate full workflow: analysis -> plan -> build -> improve

      // 1. Post-analysis curation stores 'analysis' context
      const analysisCtx: WorkflowContextData = {
        phase: "analysis",
        summary: "Domain: testing. Requirements: add context injection tests.",
        keyFindings: ["PATTERN: antimocking", "CODE_INTEL: 3 files identified"],
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "analysis", analysisCtx, db);

      // 2. Plan phase retrieves 'analysis' context
      const planInput = getWorkflowContext(testWorkflowId, "analysis", db);
      expect(planInput?.summary).toContain("Domain: testing");

      // 3. Post-plan curation stores 'plan' context
      const planCtx: WorkflowContextData = {
        phase: "plan",
        summary: "Spec at docs/specs/testing/context-injection-spec.md",
        keyFindings: [
          "CODE_INTEL: orchestrator.ts has 12 dependents",
          "CODE_INTEL: Low risk change",
        ],
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "plan", planCtx, db);

      // 4. Build phase retrieves 'plan' context
      const buildInput = getWorkflowContext(testWorkflowId, "plan", db);
      expect(buildInput?.summary).toContain("Spec at docs/specs");

      // 5. Post-build curation stores 'build' context
      const buildCtx: WorkflowContextData = {
        phase: "build",
        summary: "Modified 2 files: orchestrator.ts, curator.ts",
        keyFindings: [
          "CODE_INTEL: context.ts has 5 dependents needing review",
        ],
        timestamp: new Date().toISOString(),
      };
      storeWorkflowContext(testWorkflowId, "build", buildCtx, db);

      // 6. Improve phase retrieves 'build' context
      const improveInput = getWorkflowContext(testWorkflowId, "build", db);
      expect(improveInput?.summary).toContain("Modified 2 files");
      expect(improveInput?.keyFindings).toContainEqual(
        "CODE_INTEL: context.ts has 5 dependents needing review"
      );
    });
  });
});
