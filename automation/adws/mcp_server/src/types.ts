/**
 * Type definitions for ADW MCP server tool arguments
 */

// Workflow orchestration tools
export interface ADWRunPhaseArgs {
  phase: "plan" | "build" | "test" | "review";
  issue_number: string;
  adw_id?: string;
}

export interface ADWGetStateArgs {
  adw_id: string;
}

export interface ADWListWorkflowsArgs {
  adw_id?: string; // Optional filter
}

// Git operations tools
export interface GitCommitArgs {
  adw_id: string;
  message: string;
  files?: string[]; // Optional file list, default: stage all
}

export interface GitCreateWorktreeArgs {
  worktree_name: string;
  base_branch: string;
  base_path?: string; // Default: "trees"
}

export interface GitCleanupWorktreeArgs {
  worktree_name: string;
  base_path?: string; // Default: "trees"
  delete_branch?: boolean; // Default: true
}

// Validation tools
export interface BunValidateArgs {
  cwd?: string; // Default: project root
}

export interface BunValidateMigrationsArgs {
  adw_id: string;
  cwd?: string; // Default: app/
}

// Tool result types
export interface ToolResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

export interface WorkflowState {
  adw_id: string;
  issue_number: string;
  current_phase: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown; // Additional state fields
}

export interface WorkflowList {
  workflows: WorkflowState[];
  total: number;
}

export interface GitCommitResult {
  commit_hash: string;
  message: string;
  files_changed: number;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface MigrationDriftResult {
  drift_detected: boolean;
  details?: string[];
  files_out_of_sync?: string[];
}
