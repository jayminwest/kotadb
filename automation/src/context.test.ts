import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { 
  storeWorkflowContext, 
  getWorkflowContext, 
  getAllWorkflowContexts,
  clearWorkflowContext,
  generateWorkflowId,
  type WorkflowContextData 
} from "./context.ts";

/**
 * Create a test database wrapper compatible with DatabaseLike interface
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
    }
  };
}

describe("Context Accumulation", () => {
  let rawDb: Database;
  let db: ReturnType<typeof createTestDatabase>;
  
  beforeEach(() => {
    // In-memory database for testing
    rawDb = new Database(":memory:");
    
    // Initialize schema (matches migration)
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
    
    // Create wrapper for dependency injection
    db = createTestDatabase(rawDb);
  });
  
  afterEach(() => {
    rawDb.close();
  });
  
  it("generates workflow IDs correctly", () => {
    const id = generateWorkflowId(123);
    expect(id).toMatch(/^adw-123-\d{4}-\d{2}-\d{2}T\d{6}/);
  });
  
  it("validates phase mismatch", () => {
    const workflowId = "adw-123-test";
    const data: WorkflowContextData = {
      phase: "analysis",
      summary: "Test",
      timestamp: new Date().toISOString()
    };
    
    // This should throw because we're passing "plan" as phase parameter
    // but data.phase is "analysis"
    expect(() => {
      storeWorkflowContext(workflowId, "plan", data, db);
    }).toThrow("Phase mismatch");
  });
  
  it("stores and retrieves workflow context", () => {
    const workflowId = "adw-456-test";
    const data: WorkflowContextData = {
      phase: "analysis",
      summary: "Analyzed the issue",
      keyFindings: ["Finding 1", "Finding 2"],
      timestamp: new Date().toISOString()
    };
    
    // Store context
    storeWorkflowContext(workflowId, "analysis", data, db);
    
    // Retrieve context
    const result = getWorkflowContext(workflowId, "analysis", db);
    expect(result).not.toBeNull();
    expect(result?.phase).toBe("analysis");
    expect(result?.summary).toBe("Analyzed the issue");
    expect(result?.keyFindings).toEqual(["Finding 1", "Finding 2"]);
  });
  
  it("returns null for non-existent context", () => {
    const result = getWorkflowContext("non-existent", "analysis", db);
    expect(result).toBeNull();
  });
  
  it("retrieves all contexts for a workflow", () => {
    const workflowId = "adw-789-test";
    
    // Store multiple phases
    const analysisData: WorkflowContextData = {
      phase: "analysis",
      summary: "Analysis phase",
      timestamp: new Date().toISOString()
    };
    const planData: WorkflowContextData = {
      phase: "plan",
      summary: "Plan phase",
      timestamp: new Date().toISOString()
    };
    
    storeWorkflowContext(workflowId, "analysis", analysisData, db);
    storeWorkflowContext(workflowId, "plan", planData, db);
    
    // Retrieve all
    const results = getAllWorkflowContexts(workflowId, db);
    expect(results).toHaveLength(2);
    expect(results[0]?.phase).toBe("analysis");
    expect(results[1]?.phase).toBe("plan");
  });
  
  it("returns empty array for workflow with no contexts", () => {
    const results = getAllWorkflowContexts("non-existent", db);
    expect(results).toEqual([]);
  });
  
  it("clears workflow context", () => {
    const workflowId = "adw-clear-test";
    const data: WorkflowContextData = {
      phase: "build",
      summary: "Build phase",
      timestamp: new Date().toISOString()
    };
    
    storeWorkflowContext(workflowId, "build", data, db);
    
    // Verify stored
    expect(getWorkflowContext(workflowId, "build", db)).not.toBeNull();
    
    // Clear
    const deletedCount = clearWorkflowContext(workflowId, db);
    expect(deletedCount).toBe(1);
    
    // Verify cleared
    expect(getWorkflowContext(workflowId, "build", db)).toBeNull();
  });
  
  it("updates existing context on conflict", () => {
    const workflowId = "adw-upsert-test";
    const data1: WorkflowContextData = {
      phase: "analysis",
      summary: "First analysis",
      timestamp: new Date().toISOString()
    };
    const data2: WorkflowContextData = {
      phase: "analysis",
      summary: "Updated analysis",
      keyFindings: ["New finding"],
      timestamp: new Date().toISOString()
    };
    
    // Store initial
    storeWorkflowContext(workflowId, "analysis", data1, db);
    
    // Update
    storeWorkflowContext(workflowId, "analysis", data2, db);
    
    // Verify updated
    const result = getWorkflowContext(workflowId, "analysis", db);
    expect(result?.summary).toBe("Updated analysis");
    expect(result?.keyFindings).toEqual(["New finding"]);
    
    // Verify only one record exists
    const all = getAllWorkflowContexts(workflowId, db);
    expect(all).toHaveLength(1);
  });
});

// Integration-style tests that work with actual database
// These test the schema and logic together
describe("Context Storage Integration", () => {
  it("workflow ID format is correct", () => {
    const id = generateWorkflowId(456);
    expect(id).toContain("adw-456-");
    expect(id.length).toBeGreaterThan(15);
  });
  
  it("phase validation prevents mismatches", () => {
    const data: WorkflowContextData = {
      phase: "build",
      summary: "Building features",
      timestamp: new Date().toISOString()
    };
    
    // This will throw phase mismatch before even touching the database
    expect(() => {
      storeWorkflowContext("test-id", "analysis", data);
    }).toThrow();
  });
});
