/**
 * Type definitions for MCP impact analysis and spec validation tools
 */

/**
 * Input for analyze_change_impact tool
 */
export interface ChangeImpactRequest {
	/** List of files to be modified */
	files_to_modify?: string[];
	/** List of files to be created */
	files_to_create?: string[];
	/** List of files to be deleted */
	files_to_delete?: string[];
	/** Type of change (feature, refactor, fix, chore) */
	change_type: "feature" | "refactor" | "fix" | "chore";
	/** Description of the proposed change */
	description: string;
	/** Whether this change includes breaking changes */
	breaking_changes?: boolean;
	/** Repository ID to analyze (optional, uses first repository if not specified) */
	repository?: string;
}

/**
 * Output from analyze_change_impact tool
 */
export interface ChangeImpactResponse {
	/** Files affected by this change */
	affected_files: AffectedFile[];
	/** Test scope recommendations */
	test_scope: TestScope;
	/** Architectural warnings and recommendations */
	architectural_warnings: string[];
	/** Conflicts detected with open PRs/branches */
	conflicts: ConflictInfo[];
	/** Risk level assessment */
	risk_level: "low" | "medium" | "high";
	/** Production deployment impact estimate */
	deployment_impact: string;
	/** Timestamp when repository was last indexed */
	last_indexed_at: string;
	/** Summary of the impact analysis */
	summary: string;
}

/**
 * File affected by proposed changes
 */
export interface AffectedFile {
	/** Relative file path */
	path: string;
	/** Reason why this file is affected */
	reason: string;
	/** Change requirement (review, update, test) */
	change_requirement: "review" | "update" | "test";
	/** Number of direct dependents */
	direct_dependents_count: number;
	/** Number of indirect dependents */
	indirect_dependents_count: number;
}

/**
 * Test scope recommendations
 */
export interface TestScope {
	/** Test files that should be run */
	test_files: string[];
	/** Additional test files that should be considered */
	recommended_test_files: string[];
	/** Test coverage impact estimate */
	coverage_impact: string;
}

/**
 * Conflict information
 */
export interface ConflictInfo {
	/** Type of conflict */
	type: "pr" | "branch" | "file";
	/** Description of the conflict */
	description: string;
	/** Severity level */
	severity: "warning" | "error";
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Input for validate_implementation_spec tool
 */
export interface ImplementationSpec {
	/** Feature or change name */
	feature_name: string;
	/** Files to create */
	files_to_create?: FileSpec[];
	/** Files to modify */
	files_to_modify?: FileSpec[];
	/** Database migrations to add */
	migrations?: MigrationSpec[];
	/** npm dependencies to add */
	dependencies_to_add?: DependencySpec[];
	/** Whether this includes breaking changes */
	breaking_changes?: boolean;
	/** Repository ID (optional, uses first repository if not specified) */
	repository?: string;
}

/**
 * File specification in implementation spec
 */
export interface FileSpec {
	/** Relative file path */
	path: string;
	/** Purpose or description */
	purpose: string;
	/** Estimated line count */
	estimated_lines?: number;
}

/**
 * Migration specification
 */
export interface MigrationSpec {
	/** Migration filename */
	filename: string;
	/** Description of migration */
	description: string;
	/** Tables affected */
	tables_affected?: string[];
}

/**
 * Dependency specification
 */
export interface DependencySpec {
	/** Package name */
	name: string;
	/** Package version or range */
	version?: string;
	/** Whether this is a dev dependency */
	dev?: boolean;
}

/**
 * Output from validate_implementation_spec tool
 */
export interface ValidationResult {
	/** Whether the spec is valid */
	valid: boolean;
	/** Validation errors (blocking issues) */
	errors: ValidationIssue[];
	/** Validation warnings (non-blocking issues) */
	warnings: ValidationIssue[];
	/** Approval conditions checklist */
	approval_conditions: string[];
	/** Overall risk assessment */
	risk_assessment: string;
	/** Summary of validation results */
	summary: string;
}

/**
 * Validation issue (error or warning)
 */
export interface ValidationIssue {
	/** Type of validation issue */
	type: string;
	/** Issue message */
	message: string;
	/** Affected file or resource */
	affected_resource?: string;
	/** Suggested fix */
	suggested_fix?: string;
}
