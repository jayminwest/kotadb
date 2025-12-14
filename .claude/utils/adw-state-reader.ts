/**
 * ADW State Reader - Read-only TypeScript utility for parsing Python ADW state files
 * 
 * Used by /do/status and observability commands to query workflow state.
 * This is read-only - all writes happen in Python orchestration layer.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ADWState {
  adw_id: string;
  issue_number?: string;
  branch_name?: string;
  plan_file?: string;
  issue_class?: string;
  worktree_name?: string;
  worktree_path?: string;
  worktree_created_at?: string;
  test_project_name?: string;
  pr_created?: boolean;
  auto_merge_enabled?: boolean;
  merge_status?: string;
  merge_timestamp?: number;
  extra?: Record<string, any>;
}

/**
 * Read ADW state for a specific workflow execution
 * 
 * @param adwId - ADW execution ID
 * @returns ADWState object or null if not found
 */
export function readADWState(adwId: string): ADWState | null {
  const statePath = path.join(
    process.cwd(),
    'automation',
    'agents',
    adwId,
    'adw_state.json'
  );

  if (!fs.existsSync(statePath)) {
    process.stderr.write(JSON.stringify({
      level: 'error',
      message: 'ADW state file not found',
      data: { adwId, statePath }
    }) + '\n');
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content) as ADWState;
    return state;
  } catch (error) {
    const err = error as Error;
    process.stderr.write(JSON.stringify({
      level: 'error',
      message: 'Failed to parse ADW state file',
      error: err.message,
      data: { adwId, statePath }
    }) + '\n');
    return null;
  }
}

/**
 * List all ADW workflow executions
 * 
 * @returns Array of ADW IDs that have state files
 */
export function listADWWorkflows(): string[] {
  const agentsDir = path.join(process.cwd(), 'automation', 'agents');

  if (!fs.existsSync(agentsDir)) {
    process.stderr.write(JSON.stringify({
      level: 'warn',
      message: 'ADW agents directory not found',
      data: { agentsDir }
    }) + '\n');
    return [];
  }

  try {
    return fs.readdirSync(agentsDir).filter(dir => {
      const statePath = path.join(agentsDir, dir, 'adw_state.json');
      return fs.existsSync(statePath);
    });
  } catch (error) {
    const err = error as Error;
    process.stderr.write(JSON.stringify({
      level: 'error',
      message: 'Failed to list ADW workflows',
      error: err.message,
      data: { agentsDir }
    }) + '\n');
    return [];
  }
}

/**
 * Get the most recent ADW workflow
 * 
 * @returns ADW ID of most recent workflow or null if none found
 */
export function getLatestADWWorkflow(): string | null {
  const workflows = listADWWorkflows();
  if (workflows.length === 0) {
    return null;
  }

  // ADW IDs are timestamped, so alphanumeric sort gives chronological order
  workflows.sort();
  return workflows[workflows.length - 1];
}
