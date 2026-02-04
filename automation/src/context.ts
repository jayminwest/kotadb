/**
 * Context accumulation for ADW inter-phase handoffs
 * 
 * Storage location: Main KotaDB database (.kotadb/kota.db)
 * NOT automation metrics DB (automation/.data/metrics.db)
 * 
 * Issue: #144 - ADW context accumulation
 */
import { getGlobalDatabase } from "@db/sqlite/sqlite-client.ts";
import type { Database as BunDatabase } from "bun:sqlite";

/**
 * Database interface for dependency injection
 * Supports both wrapped database client and raw Bun:SQLite for tests
 */
interface DatabaseLike {
  raw: BunDatabase;
  queryOne<T>(sql: string, params?: unknown[]): T | null;
  query<T>(sql: string, params?: unknown[]): T[];
}

export interface WorkflowContextData {
  phase: 'analysis' | 'plan' | 'build' | 'improve';
  summary: string;
  keyFindings?: string[];
  filesAnalyzed?: string[];
  decisionsRecorded?: string[];
  timestamp: string;
  [key: string]: unknown;
}

interface StoredContext {
  id: number;
  workflow_id: string;
  phase: string;
  context_data: string;  // JSON
  created_at: string;
  updated_at: string;
}

/**
 * Store workflow context for a specific phase
 * 
 * @param workflowId - Workflow identifier (e.g., 'adw-123-20260204T120000')
 * @param phase - Workflow phase
 * @param data - Context data to store
 * @param db - Optional database instance for testing (defaults to global database)
 * @throws Error if database operation fails (caller should catch)
 */
export function storeWorkflowContext(
  workflowId: string,
  phase: WorkflowContextData['phase'],
  data: WorkflowContextData,
  db?: DatabaseLike
): void {
  const database = db ?? getGlobalDatabase();
  
  // Validate phase matches data
  if (data.phase !== phase) {
    throw new Error(`Phase mismatch: ${phase} vs ${data.phase}`);
  }
  
  const contextJson = JSON.stringify(data);
  
  // Use raw db.prepare for INSERT OR REPLACE with upsert semantics
  const stmt = database.raw.prepare(`
    INSERT INTO workflow_contexts (workflow_id, phase, context_data)
    VALUES (?, ?, ?)
    ON CONFLICT(workflow_id, phase) 
    DO UPDATE SET context_data = excluded.context_data, updated_at = datetime('now')
  `);
  
  stmt.run(workflowId, phase, contextJson);
}

/**
 * Retrieve workflow context for a specific phase
 * 
 * @param workflowId - Workflow identifier
 * @param phase - Specific phase to retrieve
 * @param db - Optional database instance for testing (defaults to global database)
 * @returns Context data or null if not found
 */
export function getWorkflowContext(
  workflowId: string,
  phase: WorkflowContextData['phase'],
  db?: DatabaseLike
): WorkflowContextData | null {
  const database = db ?? getGlobalDatabase();
  
  const result = database.queryOne<StoredContext>(
    `SELECT * FROM workflow_contexts WHERE workflow_id = ? AND phase = ?`,
    [workflowId, phase]
  );
  
  if (!result) return null;
  return JSON.parse(result.context_data) as WorkflowContextData;
}

/**
 * Retrieve all workflow contexts for a workflow
 * 
 * @param workflowId - Workflow identifier
 * @param db - Optional database instance for testing (defaults to global database)
 * @returns Array of context data (empty array if none found)
 */
export function getAllWorkflowContexts(
  workflowId: string,
  db?: DatabaseLike
): WorkflowContextData[] {
  const database = db ?? getGlobalDatabase();
  
  const results = database.query<StoredContext>(
    `SELECT * FROM workflow_contexts WHERE workflow_id = ? ORDER BY created_at ASC`,
    [workflowId]
  );
  
  return results.map(r => JSON.parse(r.context_data) as WorkflowContextData);
}

/**
 * Clear all context for a workflow
 * Used for cleanup after successful workflow completion
 * 
 * @param workflowId - Workflow identifier
 * @param db - Optional database instance for testing (defaults to global database)
 * @returns Number of rows deleted
 */
export function clearWorkflowContext(
  workflowId: string,
  db?: DatabaseLike
): number {
  const database = db ?? getGlobalDatabase();
  
  // Use raw db.prepare to get changes count
  const stmt = database.raw.prepare(`DELETE FROM workflow_contexts WHERE workflow_id = ?`);
  const result = stmt.run(workflowId);
  
  return result.changes;
}

/**
 * Generate workflow ID for ADW runs
 * Format: adw-<issueNumber>-<timestamp>
 * 
 * @param issueNumber - GitHub issue number
 * @returns Workflow identifier
 */
export function generateWorkflowId(issueNumber: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '');
  return `adw-${issueNumber}-${timestamp}`;
}
