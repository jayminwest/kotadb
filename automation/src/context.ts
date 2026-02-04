/**
 * Context accumulation for ADW inter-phase handoffs
 * 
 * Storage location: Main KotaDB database (.kotadb/kota.db)
 * NOT automation metrics DB (automation/.data/metrics.db)
 * 
 * Issue: #144 - ADW context accumulation
 */
import { getGlobalDatabase } from "../../app/src/db/sqlite/sqlite-client.ts";

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
}

/**
 * Store workflow context for a specific phase
 * 
 * @param workflowId - Workflow identifier (e.g., 'adw-123-20260204T120000')
 * @param phase - Workflow phase
 * @param data - Context data to store
 * @throws Error if database operation fails (caller should catch)
 */
export function storeWorkflowContext(
  workflowId: string,
  phase: WorkflowContextData['phase'],
  data: WorkflowContextData
): void {
  const db = getGlobalDatabase();
  
  // Validate phase matches data
  if (data.phase !== phase) {
    throw new Error(`Phase mismatch: ${phase} vs ${data.phase}`);
  }
  
  const contextJson = JSON.stringify(data);
  
  // Use raw db.prepare for INSERT OR REPLACE with upsert semantics
  const stmt = db.raw.prepare(`
    INSERT INTO workflow_contexts (workflow_id, phase, context_data)
    VALUES (?, ?, ?)
    ON CONFLICT(workflow_id, phase) 
    DO UPDATE SET context_data = excluded.context_data, created_at = datetime('now')
  `);
  
  stmt.run(workflowId, phase, contextJson);
}

/**
 * Retrieve workflow context
 * 
 * @param workflowId - Workflow identifier
 * @param phase - Optional specific phase (if omitted, returns all phases)
 * @returns Context data or null if not found
 */
export function getWorkflowContext(
  workflowId: string,
  phase?: WorkflowContextData['phase']
): WorkflowContextData | WorkflowContextData[] | null {
  const db = getGlobalDatabase();
  
  if (phase) {
    // Get specific phase
    const result = db.queryOne<StoredContext>(
      `SELECT * FROM workflow_contexts WHERE workflow_id = ? AND phase = ?`,
      [workflowId, phase]
    );
    
    if (!result) return null;
    return JSON.parse(result.context_data) as WorkflowContextData;
  } else {
    // Get all phases for workflow
    const results = db.query<StoredContext>(
      `SELECT * FROM workflow_contexts WHERE workflow_id = ? ORDER BY created_at ASC`,
      [workflowId]
    );
    
    if (results.length === 0) return null;
    return results.map(r => JSON.parse(r.context_data) as WorkflowContextData);
  }
}

/**
 * Clear all context for a workflow
 * Used for cleanup after successful workflow completion
 * 
 * @param workflowId - Workflow identifier
 * @returns Number of rows deleted
 */
export function clearWorkflowContext(workflowId: string): number {
  const db = getGlobalDatabase();
  
  // Use raw db.prepare to get changes count
  const stmt = db.raw.prepare(`DELETE FROM workflow_contexts WHERE workflow_id = ?`);
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
