/**
 * MCP tool definitions and execution adapters
 *
 * Local-only v2.0.0: Simplified for SQLite-only operation
 * Cloud-only tools (projects, get_index_job_status) have been removed.
 */

import {
	getIndexStatistics,
	listRecentFiles,
	queryDependencies,
	queryDependents,
	resolveFilePath,
	runIndexingWorkflow,
	searchFiles,
	extractLineSnippets,
} from "@api/queries";
import { getDomainKeyFiles } from "@api/expertise-queries.js";
import { getGlobalDatabase } from "@db/sqlite/index.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { buildSnippet } from "@indexer/extractors";
import { createLogger } from "@logging/logger.js";
import type { ChangeImpactRequest, ImplementationSpec, IndexRequest } from "@shared/types";
import { Sentry } from "../instrument.js";
import { analyzeChangeImpact } from "./impact-analysis";
import { invalidParams } from "./jsonrpc";
import { validateImplementationSpec } from "./spec-validation";
import { resolveRepositoryIdentifierWithError } from "./repository-resolver";
import { ensureRepositoryIndexed, type AutoIndexResult } from "./auto-index";
import { startWatching } from "@sync/source-watcher.js";
import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const logger = createLogger({ module: "mcp-tools" });

/**
 * MCP Tool Definition
 */
/**
 * Tool tier for categorizing tools by feature set
 */
export type ToolTier = "core" | "sync" | "memory" | "expertise";

export interface ToolDefinition {
	name: string;
	tier: ToolTier;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

/**
 * Toolset tier for CLI selection (maps to tool tiers)
 */
export type ToolsetTier = "default" | "core" | "memory" | "full";

/**
 * Filter tools by the requested toolset tier
 *
 * Tier mapping:
 * - core: 6 tools (core tier only)
 * - default: 8 tools (core + sync tiers)
 * - memory: 14 tools (core + sync + memory tiers)
 * - full: all tools
 *
 * @param tier - The toolset tier to filter by
 * @param tools - Optional array of tools (defaults to all tool definitions)
 */
export function filterToolsByTier(tier: ToolsetTier, tools?: ToolDefinition[]): ToolDefinition[] {
	const allTools = tools ?? getToolDefinitions();
	switch (tier) {
		case "core":
			return allTools.filter((t) => t.tier === "core");
		case "default":
			return allTools.filter((t) => t.tier === "core" || t.tier === "sync");
		case "memory":
			return allTools.filter((t) => t.tier === "core" || t.tier === "sync" || t.tier === "memory");
		case "full":
			return allTools;
		default:
			// Default to "default" tier if unknown
			return allTools.filter((t) => t.tier === "core" || t.tier === "sync");
	}
}

/**
 * Alias for filterToolsByTier - get tool definitions filtered by toolset
 *
 * @param toolset - The toolset tier to filter by
 */
export function getToolsByTier(toolset: ToolsetTier): ToolDefinition[] {
	return filterToolsByTier(toolset);
}

/**
 * Validate if a string is a valid toolset tier
 */
export function isValidToolset(value: string): value is ToolsetTier {
	return value === "default" || value === "core" || value === "memory" || value === "full";
}

// ============================================================================
// UNIFIED SEARCH TOOL - Replaces search_code, search_symbols, search_decisions, search_patterns, search_failures  
// Issue: #143
// ============================================================================

/**
 * Tool: search (unified)
 */
export const SEARCH_TOOL: ToolDefinition = {
	tier: "core",
	name: "search",
	description: `Search indexed code, symbols, decisions, patterns, and failures.

OUTPUT MODES:
- 'paths': File paths only (~100 bytes/result)
- 'compact': Summary info (~200 bytes/result) - DEFAULT for code scope
- 'snippet': Matching lines with context (~2KB/result)
- 'full': Complete content (~100KB/result) - Use with caution for code scope

TIPS:
- Use 'snippet' for code exploration (shows matches in context)
- Use 'compact' for quick file discovery
- Use 'full' only for small result sets (symbols, decisions, etc.)

Supports multiple search scopes simultaneously with scope-specific filters.`,
	inputSchema: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "Search query term or phrase",
			},
			scope: {
				type: "array",
				items: {
					type: "string",
					enum: ["code", "symbols", "decisions", "patterns", "failures"],
				},
				description: "Search scopes to query (default: ['code'])",
			},
			filters: {
				type: "object",
				description: "Scope-specific filters (invalid filters ignored)",
				properties: {
					// Code scope filters
					glob: {
						type: "string",
						description: "File path glob pattern (code scope only)",
					},
					exclude: {
						type: "array",
						items: { type: "string" },
						description: "Exclude patterns (code scope only)",
					},
					language: {
						type: "string",
						description: "Programming language filter (code scope only)",
					},
					// Symbol scope filters
					symbol_kind: {
						type: "array",
						items: {
							type: "string",
							enum: [
								"function",
								"class",
								"interface",
								"type",
								"variable",
								"constant",
								"method",
								"property",
								"module",
								"namespace",
								"enum",
								"enum_member",
							],
						},
						description: "Symbol kinds to include (symbols scope only)",
					},
					exported_only: {
						type: "boolean",
						description: "Only exported symbols (symbols scope only)",
					},
					// Decision scope filters
					decision_scope: {
						type: "string",
						enum: ["architecture", "pattern", "convention", "workaround"],
						description: "Decision category (decisions scope only)",
					},
					// Pattern scope filters
					pattern_type: {
						type: "string",
						description: "Pattern type filter (patterns scope only)",
					},
					// Common filters
					repository: {
						type: "string",
						description: "Repository ID or full_name filter (all scopes)",
					},
				},
			},
			limit: {
				type: "number",
				description: "Max results per scope (default: 20, max: 100)",
			},
			output: {
				type: "string",
				enum: ["full", "paths", "compact", "snippet"],
				description: "Output format: 'paths' (file paths only), 'compact' (summary), 'snippet' (matches with context), 'full' (complete content). Default varies by scope: code='compact', others='full'. WARNING: 'full' + code scope = large results.",
			},
			context_lines: {
				type: "number",
				description: "Lines of context before/after matches (snippet mode only, default: 3, max: 10)",
				minimum: 0,
				maximum: 10,
			},
		},
		required: ["query"],
	},
};


/**
 * Tool: index_repository
 */
export const INDEX_REPOSITORY_TOOL: ToolDefinition = {
	tier: "core",
	name: "index_repository",
	description:
		"Index a git repository by cloning/updating it and extracting code files. Performs synchronous indexing and returns immediately with status 'completed' and full indexing stats.",
	inputSchema: {
		type: "object",
		properties: {
			repository: {
				type: "string",
				description: "Repository identifier (e.g., 'owner/repo' or full git URL)",
			},
			ref: {
				type: "string",
				description: "Optional: Git ref/branch to checkout (default: main/master)",
			},
			localPath: {
				type: "string",
				description: "Optional: Use a local directory instead of cloning from git",
			},
		},
		required: ["repository"],
	},
};

/**
 * Tool: list_recent_files
 */
export const LIST_RECENT_FILES_TOOL: ToolDefinition = {
	tier: "core",
	name: "list_recent_files",
	description:
		"List recently indexed files, ordered by indexing timestamp. Useful for seeing what code is available.",
	inputSchema: {
		type: "object",
		properties: {
			limit: {
				type: "number",
				description: "Optional: Maximum number of files to return (default: 10)",
			},
			repository: {
				type: "string",
				description: "Optional: Filter results to a specific repository ID",
			},
		},
	},
};

/**
 * Tool: search_dependencies
 */
export const SEARCH_DEPENDENCIES_TOOL: ToolDefinition = {
	tier: "core",
	name: "search_dependencies",
	description:
		"Search the dependency graph to find files that depend on (dependents) or are depended on by (dependencies) a target file. Useful for impact analysis before refactoring, test scope discovery, and circular dependency detection.",
	inputSchema: {
		type: "object",
		properties: {
			file_path: {
				type: "string",
				description: "Relative file path within the repository (e.g., 'src/auth/context.ts')",
			},
			direction: {
				type: "string",
				enum: ["dependents", "dependencies", "both"],
				description:
					"Search direction: 'dependents' (files that import this file), 'dependencies' (files this file imports), or 'both' (default: 'both')",
			},
			depth: {
				type: "number",
				description:
					"Recursion depth for traversal (1-5, default: 1). Higher values find indirect relationships.",
			},
			include_tests: {
				type: "boolean",
				description:
					"Include test files in results (default: true). Set to false to filter out files with 'test' or 'spec' in path.",
			},
			reference_types: {
				type: "array",
				items: {
					type: "string",
					enum: ["import", "re_export", "export_all", "dynamic_import"],
				},
				description:
					"Filter by reference types (default: ['import', 're_export', 'export_all']). Add 'dynamic_import' to include lazy-loaded dependencies.",
			},
			repository: {
				type: "string",
				description: "Repository ID to search within. Required for multi-repository workspaces.",
			},
		},
		required: ["file_path"],
	},
};

/**
 * Tool: analyze_change_impact
 */
export const ANALYZE_CHANGE_IMPACT_TOOL: ToolDefinition = {
	tier: "core",
	name: "analyze_change_impact",
	description:
		"Analyze the impact of proposed code changes by examining dependency graphs, test scope, and potential conflicts. Returns comprehensive analysis including affected files, test recommendations, architectural warnings, and risk assessment. Useful for planning implementations and avoiding breaking changes.",
	inputSchema: {
		type: "object",
		properties: {
			files_to_modify: {
				type: "array",
				items: { type: "string" },
				description: "List of files to be modified (relative paths)",
			},
			files_to_create: {
				type: "array",
				items: { type: "string" },
				description: "List of files to be created (relative paths)",
			},
			files_to_delete: {
				type: "array",
				items: { type: "string" },
				description: "List of files to be deleted (relative paths)",
			},
			change_type: {
				type: "string",
				enum: ["feature", "refactor", "fix", "chore"],
				description: "Type of change being made",
			},
			description: {
				type: "string",
				description: "Brief description of the proposed change",
			},
			breaking_changes: {
				type: "boolean",
				description: "Whether this change includes breaking changes (default: false)",
			},
			repository: {
				type: "string",
				description: "Repository ID to analyze (optional, uses first repository if not specified)",
			},
		},
		required: ["change_type", "description"],
	},
};

/**
 * Tool: get_index_statistics
 */
export const GET_INDEX_STATISTICS_TOOL: ToolDefinition = {
	tier: "core",
	name: "get_index_statistics",
	description:
		"Get statistics about indexed data (files, symbols, references, decisions, patterns, failures). Useful for understanding what data is available for search.",
	inputSchema: {
		type: "object",
		properties: {},
		required: [],
	},
};

/**
 * Tool: validate_implementation_spec
 */
export const VALIDATE_IMPLEMENTATION_SPEC_TOOL: ToolDefinition = {
	tier: "expertise",
	name: "validate_implementation_spec",
	description:
		"Validate an implementation specification against KotaDB conventions and repository state. Checks for file conflicts, naming conventions, path alias usage, test coverage, and dependency compatibility. Returns validation errors, warnings, and approval conditions checklist.",
	inputSchema: {
		type: "object",
		properties: {
			feature_name: {
				type: "string",
				description: "Name of the feature or change",
			},
			files_to_create: {
				type: "array",
				items: {
					type: "object",
					properties: {
						path: { type: "string" },
						purpose: { type: "string" },
						estimated_lines: { type: "number" },
					},
					required: ["path", "purpose"],
				},
				description: "Files to create with their purposes",
			},
			files_to_modify: {
				type: "array",
				items: {
					type: "object",
					properties: {
						path: { type: "string" },
						purpose: { type: "string" },
						estimated_lines: { type: "number" },
					},
					required: ["path", "purpose"],
				},
				description: "Files to modify with their purposes",
			},
			migrations: {
				type: "array",
				items: {
					type: "object",
					properties: {
						filename: { type: "string" },
						description: { type: "string" },
						tables_affected: {
							type: "array",
							items: { type: "string" },
						},
					},
					required: ["filename", "description"],
				},
				description: "Database migrations to add",
			},
			dependencies_to_add: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: { type: "string" },
						version: { type: "string" },
						dev: { type: "boolean" },
					},
					required: ["name"],
				},
				description: "npm dependencies to add",
			},
			breaking_changes: {
				type: "boolean",
				description: "Whether this includes breaking changes (default: false)",
			},
			repository: {
				type: "string",
				description: "Repository ID (optional, uses first repository if not specified)",
			},
		},
		required: ["feature_name"],
	},
};

/**
 * Tool: kota_sync_export
 */
export const SYNC_EXPORT_TOOL: ToolDefinition = {
	tier: "sync",
	name: "kota_sync_export",
	description:
		"Export local SQLite database to JSONL files for git sync. Uses hash-based change detection to skip unchanged tables. Exports to .kotadb/export/ by default.",
	inputSchema: {
		type: "object",
		properties: {
			force: {
				type: "boolean",
				description: "Force export even if tables unchanged (default: false)",
			},
			export_dir: {
				type: "string",
				description: "Optional: Custom export directory path",
			},
		},
	},
};

/**
 * Tool: kota_sync_import
 */
export const SYNC_IMPORT_TOOL: ToolDefinition = {
	tier: "sync",
	name: "kota_sync_import",
	description:
		"Import JSONL files into local SQLite database. Applies deletion manifest first, then imports all tables transactionally. Typically run after git pull to sync remote changes.",
	inputSchema: {
		type: "object",
		properties: {
			import_dir: {
				type: "string",
				description: "Optional: Custom import directory path (default: .kotadb/export)",
			},
		},
	},
};

/**
 * Tool: generate_task_context
 *
 * Generates structured context for hook-based context seeding.
 * Used by PreToolUse and SubagentStart hooks to inject dependency info.
 * Target: <100ms response time
 */
export const GENERATE_TASK_CONTEXT_TOOL: ToolDefinition = {
	tier: "core",
	name: "generate_task_context",
	description:
		"Generate structured context for a set of files including dependency counts, impacted files, test files, and recent changes. Designed for hook-based context injection with <100ms performance target.",
	inputSchema: {
		type: "object",
		properties: {
			files: {
				type: "array",
				items: { type: "string" },
				description: "List of file paths to analyze (relative to repository root)",
			},
			include_tests: {
				type: "boolean",
				description: "Include test file discovery (default: true)",
			},
			include_symbols: {
				type: "boolean",
				description: "Include symbol information for each file (default: false)",
			},
			max_impacted_files: {
				type: "number",
				description: "Maximum number of impacted files to return (default: 20)",
			},
			repository: {
				type: "string",
				description: "Repository ID or full_name (optional, uses most recent if not specified)",
			},
		},
		required: ["files"],
	},
};

// ============================================================================
// Memory Layer Tool Definitions
// ============================================================================

/**
 * Tool: record_decision
 */
export const RECORD_DECISION_TOOL: ToolDefinition = {
	tier: "memory",
	name: "record_decision",
	description:
		"Record a new architectural decision for future reference. Decisions are searchable via search_decisions.",
	inputSchema: {
		type: "object",
		properties: {
			title: {
				type: "string",
				description: "Decision title/summary",
			},
			context: {
				type: "string",
				description: "Context and background for the decision",
			},
			decision: {
				type: "string",
				description: "The actual decision made",
			},
			scope: {
				type: "string",
				enum: ["architecture", "pattern", "convention", "workaround"],
				description: "Decision scope/category (default: pattern)",
			},
			rationale: {
				type: "string",
				description: "Optional: Why this decision was made",
			},
			alternatives: {
				type: "array",
				items: { type: "string" },
				description: "Optional: Alternatives that were considered",
			},
			related_files: {
				type: "array",
				items: { type: "string" },
				description: "Optional: Related file paths",
			},
			repository: {
				type: "string",
				description: "Optional: Repository ID or full_name",
			},
		},
		required: ["title", "context", "decision"],
	},
};

/**
 * Tool: record_failure
 */
export const RECORD_FAILURE_TOOL: ToolDefinition = {
	tier: "memory",
	name: "record_failure",
	description:
		"Record a failed approach for future reference. Helps agents avoid repeating mistakes.",
	inputSchema: {
		type: "object",
		properties: {
			title: {
				type: "string",
				description: "Failure title/summary",
			},
			problem: {
				type: "string",
				description: "The problem being solved",
			},
			approach: {
				type: "string",
				description: "The approach that was tried",
			},
			failure_reason: {
				type: "string",
				description: "Why the approach failed",
			},
			related_files: {
				type: "array",
				items: { type: "string" },
				description: "Optional: Related file paths",
			},
			repository: {
				type: "string",
				description: "Optional: Repository ID or full_name",
			},
		},
		required: ["title", "problem", "approach", "failure_reason"],
	},
};

/**
 * Tool: record_insight
 */
export const RECORD_INSIGHT_TOOL: ToolDefinition = {
	tier: "memory",
	name: "record_insight",
	description:
		"Store a session insight for future agents. Insights are discoveries, failures, or workarounds.",
	inputSchema: {
		type: "object",
		properties: {
			content: {
				type: "string",
				description: "The insight content",
			},
			insight_type: {
				type: "string",
				enum: ["discovery", "failure", "workaround"],
				description: "Type of insight",
			},
			session_id: {
				type: "string",
				description: "Optional: Session identifier for grouping",
			},
			related_file: {
				type: "string",
				description: "Optional: Related file path",
			},
			repository: {
				type: "string",
				description: "Optional: Repository ID or full_name",
			},
		},
		required: ["content", "insight_type"],
	},
};


// ============================================================================
// Dynamic Expertise Tool Definitions
// ============================================================================

/**
 * Tool: get_domain_key_files
 */
export const GET_DOMAIN_KEY_FILES_TOOL: ToolDefinition = {
	tier: "expertise",
	name: "get_domain_key_files",
	description:
		"Get the most-depended-on files for a domain. Key files are core infrastructure that many other files depend on.",
	inputSchema: {
		type: "object",
		properties: {
			domain: {
				type: "string",
				description: "Domain name (e.g., 'database', 'api', 'indexer', 'testing', 'claude-config', 'agent-authoring', 'automation', 'github', 'documentation')",
			},
			limit: {
				type: "number",
				description: "Optional: Maximum number of files to return (default: 10)",
			},
			repository: {
				type: "string",
				description: "Optional: Filter to a specific repository ID",
			},
		},
		required: ["domain"],
	},
};

/**
 * Tool: validate_expertise
 */
export const VALIDATE_EXPERTISE_TOOL: ToolDefinition = {
	tier: "expertise",
	name: "validate_expertise",
	description:
		"Validate that key_files defined in expertise.yaml exist in the indexed codebase. Checks for stale or missing file references.",
	inputSchema: {
		type: "object",
		properties: {
			domain: {
				type: "string",
				description: "Domain name to validate (e.g., 'database', 'api', 'indexer')",
			},
		},
		required: ["domain"],
	},
};

/**
 * Tool: sync_expertise
 */
export const SYNC_EXPERTISE_TOOL: ToolDefinition = {
	tier: "expertise",
	name: "sync_expertise",
	description:
		"Sync patterns from expertise.yaml files to the patterns table. Extracts pattern definitions and stores them for future reference.",
	inputSchema: {
		type: "object",
		properties: {
			domain: {
				type: "string",
				description: "Optional: Specific domain to sync. If not provided, syncs all domains.",
			},
			force: {
				type: "boolean",
				description: "Optional: Force sync even if patterns already exist (default: false)",
			},
		},
	},
};

/**
 * Tool: get_recent_patterns
 */
export const GET_RECENT_PATTERNS_TOOL: ToolDefinition = {
	tier: "expertise",
	name: "get_recent_patterns",
	description:
		"Get recently observed patterns from the patterns table. Useful for understanding codebase conventions.",
	inputSchema: {
		type: "object",
		properties: {
			domain: {
				type: "string",
				description: "Optional: Filter patterns by domain",
			},
			days: {
				type: "number",
				description: "Optional: Only return patterns from the last N days (default: 30)",
			},
			limit: {
				type: "number",
				description: "Optional: Maximum number of patterns to return (default: 20)",
			},
			repository: {
				type: "string",
				description: "Optional: Filter to a specific repository ID",
			},
		},
	},
};


/**
 * Get all available tool definitions
 */
export function getToolDefinitions(): ToolDefinition[] {
	return [
		SEARCH_TOOL,
		INDEX_REPOSITORY_TOOL,
		LIST_RECENT_FILES_TOOL,
		SEARCH_DEPENDENCIES_TOOL,
		ANALYZE_CHANGE_IMPACT_TOOL,
		GET_INDEX_STATISTICS_TOOL,
		VALIDATE_IMPLEMENTATION_SPEC_TOOL,
		SYNC_EXPORT_TOOL,
		SYNC_IMPORT_TOOL,
		GENERATE_TASK_CONTEXT_TOOL,
		// Memory Layer tools
		RECORD_DECISION_TOOL,
		RECORD_FAILURE_TOOL,
		RECORD_INSIGHT_TOOL,
		// Dynamic Expertise tools
		GET_DOMAIN_KEY_FILES_TOOL,
		VALIDATE_EXPERTISE_TOOL,
		SYNC_EXPERTISE_TOOL,
		GET_RECENT_PATTERNS_TOOL,
	];
}
/**

/**
 * Type guard for list_recent_files params
 */
function isListRecentParams(params: unknown): params is { limit?: number; repository?: string } | undefined {
	if (params === undefined) return true;
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (p.limit !== undefined && typeof p.limit !== "number") return false;
	if (p.repository !== undefined && typeof p.repository !== "string") return false;
	return true;
}

// ============================================================================
// UNIFIED SEARCH - Helper Functions and Types
// ============================================================================

interface NormalizedFilters {
	// Common
	repositoryId?: string;
	// Code
	glob?: string;
	exclude?: string[];
	language?: string;
	// Symbols
	symbol_kind?: string[];
	exported_only?: boolean;
	// Decisions
	decision_scope?: string;
	// Patterns
	pattern_type?: string;
}

function normalizeFilters(filters: unknown): NormalizedFilters {
	if (!filters || typeof filters !== "object") {
		return {};
	}
	
	const f = filters as Record<string, unknown>;
	const normalized: NormalizedFilters = {};
	
	// Resolve repository (UUID or full_name)
	if (f.repository && typeof f.repository === "string") {
		const resolved = resolveRepositoryIdentifierWithError(f.repository);
		if (!("error" in resolved)) {
			normalized.repositoryId = resolved.id;
		}
	}
	
	// Extract typed filters (silently ignore invalid)
	if (f.glob && typeof f.glob === "string") {
		normalized.glob = f.glob;
	}
	
	if (Array.isArray(f.exclude)) {
		normalized.exclude = f.exclude.filter(e => typeof e === "string");
	}
	
	if (f.language && typeof f.language === "string") {
		normalized.language = f.language;
	}
	
	if (Array.isArray(f.symbol_kind)) {
		normalized.symbol_kind = f.symbol_kind.filter(k => typeof k === "string");
	}
	
	if (typeof f.exported_only === "boolean") {
		normalized.exported_only = f.exported_only;
	}
	
	if (f.decision_scope && typeof f.decision_scope === "string") {
		normalized.decision_scope = f.decision_scope;
	}
	
	if (f.pattern_type && typeof f.pattern_type === "string") {
		normalized.pattern_type = f.pattern_type;
	}
	
	return normalized;
}

interface SymbolResult {
	id: string;
	name: string;
	kind: string;
	signature: string | null;
	documentation: string | null;
	location: {
		file: string;
		line_start: number;
		line_end: number;
	};
	repository_id: string;
	is_exported: boolean;
}

async function searchSymbols(
	query: string,
	filters: NormalizedFilters,
	limit: number
): Promise<SymbolResult[]> {
	const db = getGlobalDatabase();
	
	let sql = `
		SELECT 
			s.id,
			s.name,
			s.kind,
			s.signature,
			s.documentation,
			s.line_start,
			s.line_end,
			s.metadata,
			f.path as file_path,
			s.repository_id
		FROM indexed_symbols s
		JOIN indexed_files f ON s.file_id = f.id
		WHERE s.name LIKE ?
	`;
	
	const params: (string | number)[] = [`%${query}%`];
	
	// Apply symbol_kind filter
	if (filters.symbol_kind && filters.symbol_kind.length > 0) {
		const placeholders = filters.symbol_kind.map(() => "?").join(", ");
		sql += ` AND s.kind IN (${placeholders})`;
		params.push(...filters.symbol_kind);
	}
	
	// Apply exported_only filter
	if (filters.exported_only) {
		sql += ` AND json_extract(s.metadata, '$.is_exported') = 1`;
	}
	
	// Apply repository filter
	if (filters.repositoryId) {
		sql += ` AND s.repository_id = ?`;
		params.push(filters.repositoryId);
	}
	
	sql += ` ORDER BY s.name LIMIT ?`;
	params.push(limit);
	
	const rows = db.query<{
		id: string;
		name: string;
		kind: string;
		signature: string | null;
		documentation: string | null;
		line_start: number;
		line_end: number;
		metadata: string;
		file_path: string;
		repository_id: string;
	}>(sql, params);
	
	return rows.map(row => ({
		id: row.id,
		name: row.name,
		kind: row.kind,
		signature: row.signature,
		documentation: row.documentation,
		location: {
			file: row.file_path,
			line_start: row.line_start,
			line_end: row.line_end,
		},
		repository_id: row.repository_id,
		is_exported: JSON.parse(row.metadata || '{}').is_exported || false,
	}));
}

/**
 * Generate contextual tips based on search query and parameters.
 * Uses static pattern matching (no NLP) to detect suboptimal usage patterns.
 * 
 * Tip frequency: MODERATE - show tips frequently including "nice to know" suggestions.
 * 
 * @param query - Search query string
 * @param scopes - Search scopes used
 * @param filters - Normalized filters applied
 * @param scopeResults - Results by scope
 * @returns Array of tip strings (empty if search is optimal)
 */
function generateSearchTips(
	query: string,
	scopes: string[],
	filters: NormalizedFilters,
	scopeResults: Record<string, unknown[]>
): string[] {
	const tips: string[] = [];
	const queryLower = query.toLowerCase();
	
	// Pattern 1: Query contains structural keywords but not using symbols scope
	const structuralKeywords = ['function', 'class', 'interface', 'type', 'method', 'component'];
	const hasStructuralKeyword = structuralKeywords.some(kw => queryLower.includes(kw));
	
	if (hasStructuralKeyword && !scopes.includes('symbols')) {
		const matchedKeyword = structuralKeywords.find(kw => queryLower.includes(kw)) || 'function';
		tips.push(
			`You searched for "${query}" in code. Try scope: ['symbols'] with filters: {symbol_kind: ['${matchedKeyword}']} for precise structural discovery.`
		);
	}
	
	// Pattern 2: Query looks like a file path but using code search
	const looksLikeFilePath = /^[\w\-./]+\.(ts|tsx|js|jsx|py|rs|go|java)$/i.test(query);
	if (looksLikeFilePath && scopes.includes('code')) {
		tips.push(
			`Query "${query}" looks like a file path. Consider using search_dependencies tool to find files that depend on this file or its dependencies.`
		);
	}
	
	// Pattern 3: Symbol search without exported_only filter
	if (scopes.includes('symbols') && filters.exported_only === undefined) {
		const symbolCount = scopeResults['symbols']?.length || 0;
		if (symbolCount > 10) {
			tips.push(
				`Found ${symbolCount} symbols. Add filters: {exported_only: true} to narrow to public API only.`
			);
		}
	}
	
	// Pattern 4: No repository filter with large result set
	if (!filters.repositoryId) {
		const totalResults = Object.values(scopeResults).reduce((sum, arr) => sum + arr.length, 0);
		if (totalResults > 20) {
			tips.push(
				`Found ${totalResults} results across all repositories. Add filters: {repository: "owner/repo"} to narrow to a specific repository.`
			);
		}
	}
	
	// Pattern 5: Code search without glob/language filters
	if (scopes.includes('code') && !filters.glob && !filters.language) {
		const codeCount = scopeResults['code']?.length || 0;
		if (codeCount > 15) {
			tips.push(
				`Found ${codeCount} code results. Try filters: {glob: "**/*.ts"} or {language: "typescript"} to narrow file types.`
			);
		}
	}
	
	// Pattern 6: Suggest decisions scope for "why" questions
	if (/\b(why|reason|decision|chose|choice)\b/i.test(query) && !scopes.includes('decisions')) {
		tips.push(
			`Query contains "why/reason/decision". Try scope: ['decisions'] to search architectural decisions and rationale.`
		);
	}
	
	// Pattern 7: Suggest patterns scope for "how" questions
	if (/\b(how|pattern|best practice|convention)\b/i.test(query) && !scopes.includes('patterns')) {
		tips.push(
			`Query asks "how to". Try scope: ['patterns'] to search coding patterns and conventions from this codebase.`
		);
	}
	
	// Pattern 8: Suggest failures scope for error-related queries
	if (/\b(error|bug|fail|issue|problem|fix)\b/i.test(query) && !scopes.includes('failures')) {
		tips.push(
			`Query mentions errors/issues. Try scope: ['failures'] to learn from past mistakes and avoid repeated failures.`
		);
	}
	
	// Pattern 9: Single scope when multi-scope could be useful
	if (scopes.length === 1 && scopes[0] === 'code') {
		tips.push(
			`Tip: You can search multiple scopes simultaneously. Try scope: ['code', 'symbols'] for broader discovery.`
		);
	}
	
	// Pattern 10: Suggest compact format for large result sets
	const totalResults = Object.values(scopeResults).reduce((sum, arr) => sum + arr.length, 0);
	if (totalResults > 30 && !tips.some(t => t.includes('output: "compact"'))) {
		tips.push(
			`Returning ${totalResults} full results. Use output: "compact" for summary view or output: "paths" for file paths only.`
		);
	}
	
	return tips;
}

function formatSearchResults(
	query: string,
	scopes: string[],
	scopeResults: Record<string, unknown[]>,
	format: string,
	filters: NormalizedFilters,
	contextLines?: number
): Record<string, unknown> {
	const response: Record<string, unknown> = {
		query,
		scopes,
		results: {} as Record<string, unknown>,
		counts: { total: 0 } as Record<string, unknown>,
	};

	for (const scope of scopes) {
		const items = scopeResults[scope] || [];
		
		if (format === "paths") {
			// Extract file paths only
			(response.results as Record<string, unknown>)[scope] = items.map((item: any) => {
				if (item.path) return item.path;
				if (item.file_path) return item.file_path;
				if (item.location?.file) return item.location.file;
				return "unknown";
			});
		} else if (format === "compact") {
			// Summary info only
			(response.results as Record<string, unknown>)[scope] = items.map((item: any) => {
				if (scope === "code") {
					return { path: item.path, match_count: 1 };
				} else if (scope === "symbols") {
					return { name: item.name, kind: item.kind, file: item.location.file };
				} else if (scope === "decisions") {
					return { title: item.title, scope: item.scope };
				} else if (scope === "patterns") {
					return { pattern_type: item.pattern_type, file_path: item.file_path };
				} else if (scope === "failures") {
					return { title: item.title, problem: item.problem };
				}
				return item;
			});
		} else if (format === "snippet") {
			// Snippet extraction with context
			if (scope === "code") {
				(response.results as Record<string, unknown>)[scope] = items.map((item: any) => {
					const matches = extractLineSnippets(
						item.content || "",
						query,
						contextLines || 3
					);
					return {
						path: item.path,
						matches: matches
					};
				});
			} else {
				// For non-code scopes, fall back to compact format
				// (snippets only meaningful for code files)
				(response.results as Record<string, unknown>)[scope] = items.map((item: any) => {
					if (scope === "symbols") {
						return { name: item.name, kind: item.kind, file: item.location.file };
					} else if (scope === "decisions") {
						return { title: item.title, scope: item.scope };
					} else if (scope === "patterns") {
						return { pattern_type: item.pattern_type, file_path: item.file_path };
					} else if (scope === "failures") {
						return { title: item.title, problem: item.problem };
					}
					return item;
				});
			}
		} else {
			// Full details
			(response.results as Record<string, unknown>)[scope] = items;
		}
		
		(response.counts as Record<string, unknown>)[scope] = items.length;
		(response.counts as Record<string, unknown>).total = ((response.counts as Record<string, unknown>).total as number) + items.length;
	}

	
	// Generate and add tips if applicable
	const tips = generateSearchTips(query, scopes, filters, scopeResults);
	if (tips.length > 0) {
		response.tips = tips;
	}
	
	return response;
}

// ============================================================================
// UNIFIED SEARCH - Execute Function
// ============================================================================

/**
 * Execute search tool (unified search across multiple scopes)
 */
export async function executeSearch(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: query
	if (p.query === undefined) {
		throw new Error("Missing required parameter: query");
	}
	if (typeof p.query !== "string") {
		throw new Error("Parameter 'query' must be a string");
	}

	// Validate optional parameters
	let scopes: string[] = ["code"]; // Default scope
	if (p.scope !== undefined) {
		if (!Array.isArray(p.scope)) {
			throw new Error("Parameter 'scope' must be an array");
		}
		const validScopes = ["code", "symbols", "decisions", "patterns", "failures"];
		for (const s of p.scope) {
			if (typeof s !== "string" || !validScopes.includes(s)) {
				throw new Error(`Invalid scope: ${s}. Must be one of: ${validScopes.join(", ")}`);
			}
		}
		scopes = p.scope as string[];
	}

	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}

	if (p.output !== undefined) {
		if (typeof p.output !== "string" || !["full", "paths", "compact", "snippet"].includes(p.output)) {
			throw new Error("Parameter 'output' must be one of: full, paths, compact, snippet");
		}
	}

	if (p.context_lines !== undefined && typeof p.context_lines !== "number") {
		throw new Error("Parameter 'context_lines' must be a number");
	}

	if (p.context_lines !== undefined && (p.context_lines < 0 || p.context_lines > 10)) {
		throw new Error("Parameter 'context_lines' must be between 0 and 10");
	}

	const limit = Math.min(Math.max((p.limit as number) || 20, 1), 100);
	// Determine default output based on scopes
	let defaultOutput = "full";
	if (scopes.length === 1 && scopes[0] === "code") {
		defaultOutput = "compact";  // Code-only searches default to compact
	} else if (scopes.includes("code") && scopes.length > 1) {
		defaultOutput = "compact";  // Multi-scope including code defaults to compact
	}

	const output = (p.output as string) || defaultOutput;
	const contextLines = Math.min(Math.max((p.context_lines as number) || 3, 0), 10);
	const filters = normalizeFilters(p.filters);

	// Route to scope handlers in parallel
	const results: Record<string, unknown[]> = {};
	const searchPromises: Promise<void>[] = [];

	if (scopes.includes("code")) {
		searchPromises.push(
			(async () => {
				// Reuse existing searchFiles logic
				const codeResults = searchFiles(p.query as string, {
					repositoryId: filters.repositoryId,
					limit,
				});
				results.code = codeResults;
			})()
		);
	}

	if (scopes.includes("symbols")) {
		searchPromises.push(
			(async () => {
				const symbolResults = await searchSymbols(p.query as string, filters, limit);
				results.symbols = symbolResults;
			})()
		);
	}

	if (scopes.includes("decisions")) {
		searchPromises.push(
			(async () => {
				// Reuse existing executeSearchDecisions logic
				const decisionParams = {
					query: p.query,
					scope: filters.decision_scope,
					repository: filters.repositoryId,
					limit,
				};
				const decisionResults = await executeSearchDecisions(decisionParams, requestId, userId);
				results.decisions = (decisionResults as { results: unknown[] }).results;
			})()
		);
	}

	if (scopes.includes("patterns")) {
		searchPromises.push(
			(async () => {
				// Reuse existing executeSearchPatterns logic
				const patternParams = {
					query: p.query,
					pattern_type: filters.pattern_type,
					repository: filters.repositoryId,
					limit,
				};
				const patternResults = await executeSearchPatterns(patternParams, requestId, userId);
				results.patterns = (patternResults as { results: unknown[] }).results;
			})()
		);
	}

	if (scopes.includes("failures")) {
		searchPromises.push(
			(async () => {
				// Reuse existing executeSearchFailures logic
				const failureParams = {
					query: p.query,
					repository: filters.repositoryId,
					limit,
				};
				const failureResults = await executeSearchFailures(failureParams, requestId, userId);
				results.failures = (failureResults as { results: unknown[] }).results;
			})()
		);
	}

	await Promise.all(searchPromises);

	// Format output
	const response = formatSearchResults(p.query as string, scopes, results, output, filters, contextLines);

	logger.info("Unified search completed", {
		query: p.query,
		scopes,
		total_results: (response.counts as Record<string, unknown>).total,
		user_id: userId,
	});

	return response;
}

/**
 * Execute search_code tool
 *
 * AUTO-INDEX: If no repository is indexed, automatically indexes the cwd.
 */
export async function executeSearchCode(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: term
	if (p.term === undefined) {
		throw new Error("Missing required parameter: term");
	}
	if (typeof p.term !== "string") {
		throw new Error("Parameter 'term' must be a string");
	}

	// Validate optional parameters
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}

	const validatedParams = p as {
		term: string;
		repository?: string;
		limit?: number;
	};

	// AUTO-INDEX: Ensure repository is indexed before searching
	let autoIndexResult: AutoIndexResult | null = null;
	let repositoryId = validatedParams.repository;

	try {
		autoIndexResult = await ensureRepositoryIndexed(validatedParams.repository);
		repositoryId = autoIndexResult.repositoryId;
		
		if (autoIndexResult.wasIndexed) {
			logger.info("Auto-indexed repository before search", {
				repositoryId,
				filesIndexed: autoIndexResult.stats?.filesIndexed,
			});
		}
	} catch (error) {
		// Log but don't fail - allow search to proceed (may return empty results)
		logger.warn("Auto-index check failed, proceeding with search", {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	// Use SQLite via searchFiles
	const results = searchFiles(validatedParams.term, {
		repositoryId: repositoryId,
		limit: validatedParams.limit,
	});

	const response: Record<string, unknown> = {
		results: results.map((row) => ({
			projectRoot: row.projectRoot,
			path: row.path,
			snippet: buildSnippet(row.content, validatedParams.term),
			dependencies: row.dependencies,
			indexedAt: row.indexedAt.toISOString(),
		})),
	};

	// Include auto-index info if indexing was performed
	if (autoIndexResult?.wasIndexed) {
		response.auto_indexed = {
			message: autoIndexResult.message,
			stats: autoIndexResult.stats,
		};
	}

	return response;
}

/**
 * Execute index_repository tool
 */
export async function executeIndexRepository(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: repository
	if (p.repository === undefined) {
		throw new Error("Missing required parameter: repository");
	}
	if (typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	// Validate optional parameters
	if (p.ref !== undefined && typeof p.ref !== "string") {
		throw new Error("Parameter 'ref' must be a string");
	}
	if (p.localPath !== undefined && typeof p.localPath !== "string") {
		throw new Error("Parameter 'localPath' must be a string");
	}

	const validatedParams = p as {
		repository: string;
		ref?: string;
		localPath?: string;
	};

	const indexRequest: IndexRequest = {
		repository: validatedParams.repository,
		ref: validatedParams.ref ?? "main", // Default to 'main' if not provided
		localPath: validatedParams.localPath,
	};

	// LOCAL MODE: Synchronous indexing to SQLite
	logger.info("Starting local mode indexing", {
		repository: indexRequest.repository,
		localPath: indexRequest.localPath,
	});

	try {
		const result = await runIndexingWorkflow(indexRequest);

		// Start watching for file changes after successful indexing
		const watchPath = indexRequest.localPath || process.cwd();
		try {
			startWatching(watchPath, result.repositoryId);
			logger.info("Started source watcher for indexed repository", { path: watchPath });
		} catch (watchError) {
			// Do not fail indexing if watcher fails to start
			logger.warn("Failed to start source watcher", {
				error: watchError instanceof Error ? watchError.message : String(watchError),
				path: watchPath,
			});
		}

		return {
			runId: result.repositoryId, // Add runId for API compatibility
			repositoryId: result.repositoryId,
			status: "completed",
			message: "Indexing completed successfully",
			stats: {
				files_indexed: result.filesIndexed,
				symbols_extracted: result.symbolsExtracted,
				references_extracted: result.referencesExtracted,
				},
		};
	} catch (error) {
		Sentry.captureException(error, {
			tags: { mode: "local", repository: indexRequest.repository },
		});
		throw error;
	}
}

/**

/**
 * Execute list_recent_files tool
 */
export async function executeListRecentFiles(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	if (!isListRecentParams(params)) {
		throw invalidParams(requestId, "Invalid parameters for list_recent_files tool");
	}

	const limit =
		params && typeof params === "object" && "limit" in params ? (params.limit as number) : 10;
	
	const repository =
		params && typeof params === "object" && "repository" in params 
			? (params.repository as string | undefined) 
			: undefined;

	// Resolve repository ID (supports UUID or full_name)
	let repositoryId = repository;
	if (repositoryId) {
		const repoResult = resolveRepositoryIdentifierWithError(repositoryId);
		if ("error" in repoResult) {
			return { results: [], message: repoResult.error };
		}
		repositoryId = repoResult.id;
	}

	// Use SQLite via listRecentFiles with optional repository filter
	const files = listRecentFiles(limit, repositoryId);

	return {
		results: files.map((file) => ({
			projectRoot: file.projectRoot,
			path: file.path,
			dependencies: file.dependencies,
			indexedAt: file.indexedAt.toISOString(),
		})),
	};
}

/**
 * Execute search_dependencies tool
 */
export async function executeSearchDependencies(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: file_path
	if (p.file_path === undefined) {
		throw new Error("Missing required parameter: file_path");
	}
	if (typeof p.file_path !== "string") {
		throw new Error("Parameter 'file_path' must be a string");
	}

	// Validate optional parameters
	if (
		p.direction !== undefined &&
		typeof p.direction === "string" &&
		!["dependents", "dependencies", "both"].includes(p.direction)
	) {
		throw new Error("Parameter 'direction' must be one of: dependents, dependencies, both");
	}

	if (p.depth !== undefined) {
		if (typeof p.depth !== "number") {
			throw new Error("Parameter 'depth' must be a number");
		}
		if (p.depth < 1 || p.depth > 5) {
			throw new Error("Parameter 'depth' must be between 1 and 5");
		}
	}

	if (p.include_tests !== undefined && typeof p.include_tests !== "boolean") {
		throw new Error("Parameter 'include_tests' must be a boolean");
	}

	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	// Validate reference_types parameter
	if (p.reference_types !== undefined) {
		if (!Array.isArray(p.reference_types)) {
			throw new Error("Parameter 'reference_types' must be an array");
		}
		const validTypes = ["import", "re_export", "export_all", "dynamic_import"];
		for (const t of p.reference_types) {
			if (typeof t !== "string" || !validTypes.includes(t)) {
				throw new Error(`Invalid reference type: ${t}. Must be one of: ${validTypes.join(", ")}`);
			}
		}
	}

	const validatedParams = {
		file_path: p.file_path as string,
		direction: (p.direction as string | undefined) ?? "both",
		depth: (p.depth as number | undefined) ?? 1,
		include_tests: (p.include_tests as boolean | undefined) ?? true,
		reference_types: (p.reference_types as string[] | undefined) ?? ["import", "re_export", "export_all"],
		repository: p.repository as string | undefined,
	};



	// AUTO-INDEX: Ensure repository is indexed before dependency search
	let autoIndexResult: AutoIndexResult | null = null;
	try {
		autoIndexResult = await ensureRepositoryIndexed(validatedParams.repository);
		// Use auto-indexed repository ID if available
		if (autoIndexResult.wasIndexed) {
			logger.info("Auto-indexed repository before dependency search", {
				repositoryId: autoIndexResult.repositoryId,
				filesIndexed: autoIndexResult.stats?.filesIndexed,
			});
		}
		// Override repository param with resolved ID
		validatedParams.repository = autoIndexResult.repositoryId;
	} catch (error) {
		logger.warn("Auto-index check failed, proceeding with search", {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	// Resolve repository ID (supports UUID or full_name)
	const repoResult = resolveRepositoryIdentifierWithError(validatedParams.repository);
	if ("error" in repoResult) {
		return {
			file_path: validatedParams.file_path,
			message: repoResult.error,
			dependents: { direct: [], indirect: {}, cycles: [] },
			dependencies: { direct: [], indirect: {}, cycles: [] },
		};
	}
	const repositoryId = repoResult.id;

	// Resolve file path to file ID
	const fileId = resolveFilePath(validatedParams.file_path, repositoryId);

	if (!fileId) {
		return {
			file_path: validatedParams.file_path,
			message:
				"File not found: " + validatedParams.file_path + ". Make sure the repository is indexed.",
			dependents: { direct: [], indirect: {}, cycles: [] },
			dependencies: { direct: [], indirect: {}, cycles: [] },
		};
	}

	// Query dependents and/or dependencies based on direction
	let dependents: {
		direct: string[];
		indirect: Record<string, string[]>;
		cycles: string[][];
	} | null = null;
	let dependencies: {
		direct: string[];
		indirect: Record<string, string[]>;
		cycles: string[][];
	} | null = null;

	if (validatedParams.direction === "dependents" || validatedParams.direction === "both") {
		dependents = queryDependents(fileId, validatedParams.depth, validatedParams.include_tests, validatedParams.reference_types);
	}

	if (validatedParams.direction === "dependencies" || validatedParams.direction === "both") {
		dependencies = queryDependencies(fileId, validatedParams.depth, validatedParams.reference_types);
	}

	// Build response
	const result: Record<string, unknown> = {
		file_path: validatedParams.file_path,
		direction: validatedParams.direction,
		depth: validatedParams.depth,
	};

	if (dependents) {
		result.dependents = {
			direct: dependents.direct,
			indirect: dependents.indirect,
			cycles: dependents.cycles,
			count:
				dependents.direct.length +
				Object.values(dependents.indirect).reduce((sum, arr) => sum + arr.length, 0),
		};
	}

	if (dependencies) {
		result.dependencies = {
			direct: dependencies.direct,
			indirect: dependencies.indirect,
			cycles: dependencies.cycles,
			count:
				dependencies.direct.length +
				Object.values(dependencies.indirect).reduce((sum, arr) => sum + arr.length, 0),
		};
	}

	// Query unresolved imports for this file
	const db = getGlobalDatabase();
	const unresolvedRows = db.query<{ source: string }>(
		`SELECT DISTINCT json_extract(metadata, '$.importSource') as source
		 FROM indexed_references
		 WHERE file_id = ? AND target_file_path IS NULL AND json_extract(metadata, '$.importSource') IS NOT NULL`,
		[fileId],
	);
	result.unresolved_imports = unresolvedRows.map((r) => r.source);

	return result;
}

/**

/**
 * Execute analyze_change_impact tool
 */
export async function executeAnalyzeChangeImpact(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameters
	if (p.change_type === undefined) {
		throw new Error("Missing required parameter: change_type");
	}
	if (typeof p.change_type !== "string") {
		throw new Error("Parameter 'change_type' must be a string");
	}
	if (!["feature", "refactor", "fix", "chore"].includes(p.change_type)) {
		throw new Error("Parameter 'change_type' must be one of: feature, refactor, fix, chore");
	}

	if (p.description === undefined) {
		throw new Error("Missing required parameter: description");
	}
	if (typeof p.description !== "string") {
		throw new Error("Parameter 'description' must be a string");
	}

	// Validate optional parameters
	if (p.files_to_modify !== undefined && !Array.isArray(p.files_to_modify)) {
		throw new Error("Parameter 'files_to_modify' must be an array");
	}
	if (p.files_to_create !== undefined && !Array.isArray(p.files_to_create)) {
		throw new Error("Parameter 'files_to_create' must be an array");
	}
	if (p.files_to_delete !== undefined && !Array.isArray(p.files_to_delete)) {
		throw new Error("Parameter 'files_to_delete' must be an array");
	}
	if (p.breaking_changes !== undefined && typeof p.breaking_changes !== "boolean") {
		throw new Error("Parameter 'breaking_changes' must be a boolean");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const validatedParams: ChangeImpactRequest = {
		files_to_modify: p.files_to_modify as string[] | undefined,
		files_to_create: p.files_to_create as string[] | undefined,
		files_to_delete: p.files_to_delete as string[] | undefined,
		change_type: p.change_type as "feature" | "refactor" | "fix" | "chore",
		description: p.description as string,
		breaking_changes: p.breaking_changes as boolean | undefined,
		repository: p.repository as string | undefined,
	};


	// AUTO-INDEX: Ensure repository is indexed before change impact analysis
	try {
		const autoIndexResult = await ensureRepositoryIndexed(validatedParams.repository);
		if (autoIndexResult.wasIndexed) {
			logger.info("Auto-indexed repository before change impact analysis", {
				repositoryId: autoIndexResult.repositoryId,
				filesIndexed: autoIndexResult.stats?.filesIndexed,
			});
		}
		// Override repository param with resolved ID
		validatedParams.repository = autoIndexResult.repositoryId;
	} catch (error) {
		logger.warn("Auto-index check failed, proceeding with analysis", {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	const result = await analyzeChangeImpact(validatedParams, userId);

	return result;
}

/**
 * Execute get_index_statistics tool
 */
export async function executeGetIndexStatistics(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// No parameters to validate
	
	logger.info("Getting index statistics", { request_id: String(requestId), user_id: userId });
	
	const stats = getIndexStatistics();
	
	return {
		...stats,
		summary: `${stats.symbols.toLocaleString()} symbols, ${stats.files.toLocaleString()} files, ${stats.repositories} repositories indexed`,
	};
}

/**

/**
 * Execute validate_implementation_spec tool
 */
export async function executeValidateImplementationSpec(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameters
	if (p.feature_name === undefined) {
		throw new Error("Missing required parameter: feature_name");
	}
	if (typeof p.feature_name !== "string") {
		throw new Error("Parameter 'feature_name' must be a string");
	}

	// Validate optional parameters
	if (p.files_to_create !== undefined && !Array.isArray(p.files_to_create)) {
		throw new Error("Parameter 'files_to_create' must be an array");
	}
	if (p.files_to_modify !== undefined && !Array.isArray(p.files_to_modify)) {
		throw new Error("Parameter 'files_to_modify' must be an array");
	}
	if (p.migrations !== undefined && !Array.isArray(p.migrations)) {
		throw new Error("Parameter 'migrations' must be an array");
	}
	if (p.dependencies_to_add !== undefined && !Array.isArray(p.dependencies_to_add)) {
		throw new Error("Parameter 'dependencies_to_add' must be an array");
	}
	if (p.breaking_changes !== undefined && typeof p.breaking_changes !== "boolean") {
		throw new Error("Parameter 'breaking_changes' must be a boolean");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const validatedParams: ImplementationSpec = {
		feature_name: p.feature_name as string,
		files_to_create: p.files_to_create as any,
		files_to_modify: p.files_to_modify as any,
		migrations: p.migrations as any,
		dependencies_to_add: p.dependencies_to_add as any,
		breaking_changes: p.breaking_changes as boolean | undefined,
		repository: p.repository as string | undefined,
	};

	const result = await validateImplementationSpec(validatedParams, userId);

	return result;
}

/**

/**
 * Execute kota_sync_export tool
 */
export async function executeSyncExport(
	params: unknown,
	_requestId: string | number,
): Promise<unknown> {
	// Validate params
	if (params !== undefined && (typeof params !== "object" || params === null)) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown> | undefined;
	const force = p?.force === true;
	const exportDir = typeof p?.export_dir === "string" ? p.export_dir : undefined;

	const { getClient } = await import("@db/client.js");
	const { createExporter } = await import("@db/sqlite/jsonl-exporter.js");

	const db = getClient() as KotaDatabase;
	const exporter = createExporter(db, exportDir);

	// Force export or use normal flow with change detection
	const result = await exporter.exportNow();

	return {
		success: true,
		tables_exported: result.tablesExported,
		tables_skipped: result.tablesSkipped,
		total_rows: result.totalRows,
		duration_ms: result.durationMs,
		export_dir: exportDir || ".kotadb/export (project-local)",
	};
}

/**

/**
 * Execute kota_sync_import tool
 */
export async function executeSyncImport(
	params: unknown,
	_requestId: string | number,
): Promise<unknown> {
	// Validate params
	if (params !== undefined && (typeof params !== "object" || params === null)) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown> | undefined;
	const importDir = typeof p?.import_dir === "string" ? p.import_dir : undefined;

	const { getClient } = await import("@db/client.js");
	const { importFromJSONL } = await import("@db/sqlite/jsonl-importer.js");
	const { getDefaultExportDir } = await import("@db/sqlite/jsonl-exporter.js");

	const db = getClient() as KotaDatabase;
	const dir = importDir || getDefaultExportDir();

	const result = await importFromJSONL(db, dir);

	if (result.errors.length > 0) {
		return {
			success: false,
			tables_imported: result.tablesImported,
			rows_imported: result.totalRowsImported,
			errors: result.errors,
			duration_ms: result.durationMs,
		};
	}

	return {
		success: true,
		tables_imported: result.tablesImported,
		rows_imported: result.totalRowsImported,
		duration_ms: result.durationMs,
		import_dir: dir,
	};
}

/**


/**
 * Execute generate_task_context tool
 *
 * Generates structured context for hook-based context seeding.
 * Performance target: <100ms
 */
export async function executeGenerateTaskContext(
	params: unknown,
	_requestId: string | number,
	userId: string,
): Promise<unknown> {
	const startTime = performance.now();

	// Validate params structure
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	// Check required parameter: files
	if (p.files === undefined) {
		throw new Error("Missing required parameter: files");
	}
	if (!Array.isArray(p.files)) {
		throw new Error("Parameter 'files' must be an array");
	}
	for (const file of p.files) {
		if (typeof file !== "string") {
			throw new Error("Each file in 'files' must be a string");
		}
	}

	// Validate optional parameters
	if (p.include_tests !== undefined && typeof p.include_tests !== "boolean") {
		throw new Error("Parameter 'include_tests' must be a boolean");
	}
	if (p.include_symbols !== undefined && typeof p.include_symbols !== "boolean") {
		throw new Error("Parameter 'include_symbols' must be a boolean");
	}
	if (p.max_impacted_files !== undefined && typeof p.max_impacted_files !== "number") {
		throw new Error("Parameter 'max_impacted_files' must be a number");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const validatedParams = {
		files: p.files as string[],
		include_tests: (p.include_tests as boolean | undefined) ?? true,
		include_symbols: (p.include_symbols as boolean | undefined) ?? false,
		max_impacted_files: Math.min(Math.max((p.max_impacted_files as number | undefined) ?? 20, 1), 50),
		repository: p.repository as string | undefined,
	};

	// Resolve repository ID
	const repoResult = resolveRepositoryIdentifierWithError(validatedParams.repository);
	if ("error" in repoResult) {
		return {
			targetFiles: [],
			impactedFiles: [],
			testFiles: [],
			recentChanges: [],
			indexStale: true,
			staleReason: repoResult.error,
			durationMs: Math.round(performance.now() - startTime),
		};
	}
	const repositoryId = repoResult.id;

	const db = getGlobalDatabase();

	// Check index freshness
	const lastIndexed = db.queryOne<{ last_indexed_at: string | null }>(
		"SELECT last_indexed_at FROM repositories WHERE id = ?",
		[repositoryId],
	);
	const indexStale = !lastIndexed?.last_indexed_at;

	// Process each target file
	interface TargetFileInfo {
		path: string;
		dependentCount: number;
		symbols: Array<{ name: string; kind: string; line: number }>;
	}
	const targetFiles: TargetFileInfo[] = [];
	const allImpactedFiles = new Set<string>();
	const allTestFiles = new Set<string>();

	for (const filePath of validatedParams.files) {
		// Resolve file ID
		const fileId = resolveFilePath(filePath, repositoryId);

		if (!fileId) {
			// File not indexed yet - add with zero dependents
			targetFiles.push({
				path: filePath,
				dependentCount: 0,
				symbols: [],
			});
			continue;
		}

		// Query dependents (depth 1 for performance)
		const dependents = queryDependents(fileId, 1, validatedParams.include_tests);
		
		// Add target file info
		const fileInfo: TargetFileInfo = {
			path: filePath,
			dependentCount: dependents.direct.length,
			symbols: [],
		};

		// Optionally include symbols
		if (validatedParams.include_symbols) {
			const symbols = db.query<{ name: string; kind: string; line_start: number }>(
				`SELECT name, kind, line_start 
				 FROM indexed_symbols 
				 WHERE file_id = ? 
				 ORDER BY line_start 
				 LIMIT 20`,
				[fileId],
			);
			fileInfo.symbols = symbols.map((s) => ({
				name: s.name,
				kind: s.kind,
				line: s.line_start,
			}));
		}

		targetFiles.push(fileInfo);

		// Collect impacted files (direct dependents only for speed)
		for (const dep of dependents.direct) {
			if (allImpactedFiles.size < validatedParams.max_impacted_files) {
				allImpactedFiles.add(dep);
			}
		}

		// Discover test files for this file
		if (validatedParams.include_tests) {
			const testPatterns = generateTestFilePatterns(filePath);
			for (const pattern of testPatterns) {
				const testFileId = resolveFilePath(pattern, repositoryId);
				if (testFileId) {
					allTestFiles.add(pattern);
				}
			}
		}
	}

	// Query recent changes (files modified in last 7 days based on indexed_at)
	const recentChanges = db.query<{ path: string; indexed_at: string }>(
		`SELECT path, indexed_at 
		 FROM indexed_files 
		 WHERE repository_id = ? 
		 AND indexed_at > datetime('now', '-7 days')
		 ORDER BY indexed_at DESC 
		 LIMIT 10`,
		[repositoryId],
	);

	const durationMs = Math.round(performance.now() - startTime);

	logger.debug("generate_task_context completed", {
		user_id: userId,
		files_requested: validatedParams.files.length,
		impacted_count: allImpactedFiles.size,
		test_count: allTestFiles.size,
		duration_ms: durationMs,
	});

	return {
		targetFiles,
		impactedFiles: Array.from(allImpactedFiles),
		testFiles: Array.from(allTestFiles),
		recentChanges: recentChanges.map((r) => ({
			path: r.path,
			indexedAt: r.indexed_at,
		})),
		indexStale,
		staleReason: indexStale ? "Repository has not been indexed" : undefined,
		durationMs,
	};
}

/**

/**
 * Generate potential test file patterns for a source file
 */
function generateTestFilePatterns(sourcePath: string): string[] {
	const patterns: string[] = [];
	const withoutExt = sourcePath.replace(/\.(ts|tsx|js|jsx)$/, "");
	
	// Common test file naming conventions
	patterns.push(withoutExt + ".test.ts");
	patterns.push(withoutExt + ".spec.ts");
	patterns.push(withoutExt + ".test.tsx");
	patterns.push(withoutExt + ".spec.tsx");
	
	// Tests in __tests__ or tests directory
	const fileName = sourcePath.split("/").pop();
	if (fileName) {
		const fileNameWithoutExt = fileName.replace(/\.(ts|tsx|js|jsx)$/, "");
		const dirPath = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
		patterns.push(dirPath + "/__tests__/" + fileNameWithoutExt + ".test.ts");
		patterns.push("tests/" + sourcePath.replace(/\.(ts|tsx)$/, ".test.ts"));
	}
	
	return patterns;
}

/**



// ============================================================================
// Memory Layer Tool Executors
// ============================================================================

/**
 * Escape a term for FTS5 MATCH clause
 */
function escapeFts5Term(term: string): string {
	const escaped = term.replace(/"/g, '""');
	return `"${escaped}"`;
}

/**

/**
 * Execute search_decisions tool
 */
export async function executeSearchDecisions(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.query === undefined) {
		throw new Error("Missing required parameter: query");
	}
	if (typeof p.query !== "string") {
		throw new Error("Parameter 'query' must be a string");
	}

	if (p.scope !== undefined && typeof p.scope !== "string") {
		throw new Error("Parameter 'scope' must be a string");
	}
	if (p.scope !== undefined && !["architecture", "pattern", "convention", "workaround"].includes(p.scope as string)) {
		throw new Error("Parameter 'scope' must be one of: architecture, pattern, convention, workaround");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}

	const db = getGlobalDatabase();
	const escapedQuery = escapeFts5Term(p.query as string);
	const limit = Math.min(Math.max((p.limit as number) || 20, 1), 100);

	let sql = `
		SELECT 
			d.id,
			d.title,
			d.context,
			d.decision,
			d.scope,
			d.rationale,
			d.alternatives,
			d.related_files,
			d.repository_id,
			d.created_at,
			bm25(decisions_fts) as relevance
		FROM decisions_fts
		JOIN decisions d ON decisions_fts.rowid = d.rowid
		WHERE decisions_fts MATCH ?
	`;
	const queryParams: (string | number)[] = [escapedQuery];

	if (p.scope) {
		sql += " AND d.scope = ?";
		queryParams.push(p.scope as string);
	}

	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			sql += " AND d.repository_id = ?";
			queryParams.push(repoResult.id);
		}
	}

	sql += " ORDER BY relevance LIMIT ?";
	queryParams.push(limit);

	const rows = db.query<{
		id: string;
		title: string;
		context: string;
		decision: string;
		scope: string;
		rationale: string | null;
		alternatives: string;
		related_files: string;
		repository_id: string | null;
		created_at: string;
		relevance: number;
	}>(sql, queryParams);

	return {
		results: rows.map((row) => ({
			id: row.id,
			title: row.title,
			context: row.context,
			decision: row.decision,
			scope: row.scope,
			rationale: row.rationale,
			alternatives: JSON.parse(row.alternatives || "[]"),
			related_files: JSON.parse(row.related_files || "[]"),
			repository_id: row.repository_id,
			created_at: row.created_at,
			relevance: Math.abs(row.relevance),
		})),
		count: rows.length,
	};
}

/**

/**
 * Execute record_decision tool
 */
export async function executeRecordDecision(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.title === undefined || typeof p.title !== "string") {
		throw new Error("Missing or invalid required parameter: title");
	}
	if (p.context === undefined || typeof p.context !== "string") {
		throw new Error("Missing or invalid required parameter: context");
	}
	if (p.decision === undefined || typeof p.decision !== "string") {
		throw new Error("Missing or invalid required parameter: decision");
	}

	const scope = (p.scope as string) || "pattern";
	if (!["architecture", "pattern", "convention", "workaround"].includes(scope)) {
		throw new Error("Parameter 'scope' must be one of: architecture, pattern, convention, workaround");
	}

	if (p.rationale !== undefined && typeof p.rationale !== "string") {
		throw new Error("Parameter 'rationale' must be a string");
	}
	if (p.alternatives !== undefined && !Array.isArray(p.alternatives)) {
		throw new Error("Parameter 'alternatives' must be an array");
	}
	if (p.related_files !== undefined && !Array.isArray(p.related_files)) {
		throw new Error("Parameter 'related_files' must be an array");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const db = getGlobalDatabase();
	const { randomUUID } = await import("node:crypto");
	const id = randomUUID();

	let repositoryId: string | null = null;
	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			repositoryId = repoResult.id;
		}
	}

	const sql = `
		INSERT INTO decisions (
			id, repository_id, title, context, decision, scope,
			rationale, alternatives, related_files, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
	`;

	db.run(sql, [
		id,
		repositoryId,
		p.title as string,
		p.context as string,
		p.decision as string,
		scope,
		(p.rationale as string) || null,
		JSON.stringify((p.alternatives as string[]) || []),
		JSON.stringify((p.related_files as string[]) || []),
	]);

	logger.info("Decision recorded", { id, title: p.title, scope });

	return {
		success: true,
		id,
		message: "Decision recorded successfully",
	};
}

/**

/**
 * Execute search_failures tool
 */
export async function executeSearchFailures(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.query === undefined) {
		throw new Error("Missing required parameter: query");
	}
	if (typeof p.query !== "string") {
		throw new Error("Parameter 'query' must be a string");
	}

	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}

	const db = getGlobalDatabase();
	const escapedQuery = escapeFts5Term(p.query as string);
	const limit = Math.min(Math.max((p.limit as number) || 20, 1), 100);

	let sql = `
		SELECT 
			f.id,
			f.title,
			f.problem,
			f.approach,
			f.failure_reason,
			f.related_files,
			f.repository_id,
			f.created_at,
			bm25(failures_fts) as relevance
		FROM failures_fts
		JOIN failures f ON failures_fts.rowid = f.rowid
		WHERE failures_fts MATCH ?
	`;
	const queryParams: (string | number)[] = [escapedQuery];

	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			sql += " AND f.repository_id = ?";
			queryParams.push(repoResult.id);
		}
	}

	sql += " ORDER BY relevance LIMIT ?";
	queryParams.push(limit);

	const rows = db.query<{
		id: string;
		title: string;
		problem: string;
		approach: string;
		failure_reason: string;
		related_files: string;
		repository_id: string | null;
		created_at: string;
		relevance: number;
	}>(sql, queryParams);

	return {
		results: rows.map((row) => ({
			id: row.id,
			title: row.title,
			problem: row.problem,
			approach: row.approach,
			failure_reason: row.failure_reason,
			related_files: JSON.parse(row.related_files || "[]"),
			repository_id: row.repository_id,
			created_at: row.created_at,
			relevance: Math.abs(row.relevance),
		})),
		count: rows.length,
	};
}

/**

/**
 * Execute record_failure tool
 */
export async function executeRecordFailure(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.title === undefined || typeof p.title !== "string") {
		throw new Error("Missing or invalid required parameter: title");
	}
	if (p.problem === undefined || typeof p.problem !== "string") {
		throw new Error("Missing or invalid required parameter: problem");
	}
	if (p.approach === undefined || typeof p.approach !== "string") {
		throw new Error("Missing or invalid required parameter: approach");
	}
	if (p.failure_reason === undefined || typeof p.failure_reason !== "string") {
		throw new Error("Missing or invalid required parameter: failure_reason");
	}

	if (p.related_files !== undefined && !Array.isArray(p.related_files)) {
		throw new Error("Parameter 'related_files' must be an array");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const db = getGlobalDatabase();
	const { randomUUID } = await import("node:crypto");
	const id = randomUUID();

	let repositoryId: string | null = null;
	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			repositoryId = repoResult.id;
		}
	}

	const sql = `
		INSERT INTO failures (
			id, repository_id, title, problem, approach, failure_reason,
			related_files, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
	`;

	db.run(sql, [
		id,
		repositoryId,
		p.title as string,
		p.problem as string,
		p.approach as string,
		p.failure_reason as string,
		JSON.stringify((p.related_files as string[]) || []),
	]);

	logger.info("Failure recorded", { id, title: p.title });

	return {
		success: true,
		id,
		message: "Failure recorded successfully",
	};
}

/**

/**
 * Execute search_patterns tool
 */
export async function executeSearchPatterns(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (params !== undefined && (typeof params !== "object" || params === null)) {
		throw new Error("Parameters must be an object");
	}

	const p = (params as Record<string, unknown>) || {};

	if (p.query !== undefined && typeof p.query !== "string") {
		throw new Error("Parameter 'query' must be a string");
	}
	if (p.pattern_type !== undefined && typeof p.pattern_type !== "string") {
		throw new Error("Parameter 'pattern_type' must be a string");
	}
	if (p.file !== undefined && typeof p.file !== "string") {
		throw new Error("Parameter 'file' must be a string");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}

	const db = getGlobalDatabase();
	const limit = Math.min(Math.max((p.limit as number) || 20, 1), 100);

	let sql = `
		SELECT 
			id,
			repository_id,
			pattern_type,
			file_path,
			description,
			example,
			created_at
		FROM patterns
		WHERE 1=1
	`;
	const queryParams: (string | number)[] = [];

	if (p.pattern_type) {
		sql += " AND pattern_type = ?";
		queryParams.push(p.pattern_type as string);
	}

	if (p.file) {
		sql += " AND file_path = ?";
		queryParams.push(p.file as string);
	}

	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			sql += " AND repository_id = ?";
			queryParams.push(repoResult.id);
		}
	}

	sql += " ORDER BY created_at DESC LIMIT ?";
	queryParams.push(limit);

	const rows = db.query<{
		id: string;
		repository_id: string | null;
		pattern_type: string;
		file_path: string | null;
		description: string;
		example: string | null;
		created_at: string;
	}>(sql, queryParams);

	return {
		results: rows.map((row) => ({
			id: row.id,
			repository_id: row.repository_id,
			pattern_type: row.pattern_type,
			file_path: row.file_path,
			description: row.description,
			example: row.example,
			created_at: row.created_at,
		})),
		count: rows.length,
	};
}

/**

/**
 * Execute record_insight tool
 */
export async function executeRecordInsight(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.content === undefined || typeof p.content !== "string") {
		throw new Error("Missing or invalid required parameter: content");
	}
	if (p.insight_type === undefined || typeof p.insight_type !== "string") {
		throw new Error("Missing or invalid required parameter: insight_type");
	}
	if (!["discovery", "failure", "workaround"].includes(p.insight_type as string)) {
		throw new Error("Parameter 'insight_type' must be one of: discovery, failure, workaround");
	}

	if (p.session_id !== undefined && typeof p.session_id !== "string") {
		throw new Error("Parameter 'session_id' must be a string");
	}
	if (p.related_file !== undefined && typeof p.related_file !== "string") {
		throw new Error("Parameter 'related_file' must be a string");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const db = getGlobalDatabase();
	const { randomUUID } = await import("node:crypto");
	const id = randomUUID();

	const sql = `
		INSERT INTO insights (
			id, session_id, content, insight_type, related_file, created_at
		) VALUES (?, ?, ?, ?, ?, datetime('now'))
	`;

	db.run(sql, [
		id,
		(p.session_id as string) || null,
		p.content as string,
		p.insight_type as string,
		(p.related_file as string) || null,
	]);

	logger.info("Insight recorded", { id, insight_type: p.insight_type });

	return {
		success: true,
		id,
		message: "Insight recorded successfully",
	};
}

/**


// ============================================================================
// Expertise Layer Tool Executors
// ============================================================================

/**
 * Execute get_domain_key_files tool
 * Returns files with highest dependent counts for a domain
 */
export async function executeGetDomainKeyFiles(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.domain === undefined || typeof p.domain !== "string") {
		throw new Error("Missing or invalid required parameter: domain");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const domain = p.domain as string;
	const limit = Math.min(Math.max((p.limit as number) || 10, 1), 50);

	// Resolve repository if provided
	let repositoryId: string | undefined;
	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			repositoryId = repoResult.id;
		}
	}

	// Use getDomainKeyFiles from expertise-queries
	const keyFiles = getDomainKeyFiles(domain, limit, repositoryId);

	// Transform to expected output format with purpose field
	const results = keyFiles.map((file) => {
		const pathParts = file.path.split("/");
		const fileName = pathParts.pop() || "";
		const directory = pathParts.pop() || "";
		const purpose = directory ? directory + "/" + fileName : fileName;
		
		return {
			path: file.path,
			dependent_count: file.dependentCount,
			purpose,
		};
	});

	logger.debug("get_domain_key_files completed", {
		domain,
		files_found: results.length,
	});

	return {
		domain,
		key_files: results,
	};
}

/**

/**
 * Execute validate_expertise tool
 * Validates expertise.yaml patterns against indexed code
 */
export async function executeValidateExpertise(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.domain === undefined || typeof p.domain !== "string") {
		throw new Error("Missing or invalid required parameter: domain");
	}
	if (p.expertise_path !== undefined && typeof p.expertise_path !== "string") {
		throw new Error("Parameter 'expertise_path' must be a string");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const domain = p.domain as string;
	const defaultPath = ".claude/agents/experts/" + domain + "/expertise.yaml";
	const expertisePath = (p.expertise_path as string) || defaultPath;

	// Check if expertise file exists
	if (!existsSync(expertisePath)) {
		return {
			domain,
			valid: false,
			error: "Expertise file not found: " + expertisePath,
			valid_patterns: [],
			stale_patterns: [],
			missing_key_files: [],
			summary: { total: 0, valid: 0, stale: 0 },
		};
	}

	// Read and parse expertise.yaml
	let expertise: Record<string, unknown>;
	try {
		const content = readFileSync(expertisePath, "utf-8");
		expertise = parseYaml(content) as Record<string, unknown>;
	} catch (error) {
		return {
			domain,
			valid: false,
			error: "Failed to parse expertise.yaml: " + (error instanceof Error ? error.message : String(error)),
			valid_patterns: [],
			stale_patterns: [],
			missing_key_files: [],
			summary: { total: 0, valid: 0, stale: 0 },
		};
	}

	const db = getGlobalDatabase();

	// Resolve repository if provided
	let repositoryId: string | null = null;
	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			repositoryId = repoResult.id;
		}
	}

	const validPatterns: Array<{ name: string; file_path?: string }> = [];
	const stalePatterns: Array<{ name: string; reason: string }> = [];
	const missingKeyFiles: string[] = [];

	// Extract patterns from expertise.yaml
	const patterns = (expertise.patterns as Record<string, unknown>) || {};
	for (const [patternName, patternData] of Object.entries(patterns)) {
		const pattern = patternData as Record<string, unknown>;
		const filePath = pattern.file_path as string | undefined;
		
		if (filePath) {
			// Check if file exists in indexed files
			let sql = "SELECT id FROM indexed_files WHERE path LIKE ?";
			const queryParams: string[] = ["%" + filePath];
			
			if (repositoryId) {
				sql += " AND repository_id = ?";
				queryParams.push(repositoryId);
			}
			sql += " LIMIT 1";
			
			const result = db.queryOne<{ id: string }>(sql, queryParams);
			
			if (result) {
				validPatterns.push({ name: patternName, file_path: filePath });
			} else {
				stalePatterns.push({ name: patternName, reason: "File not found: " + filePath });
			}
		} else {
			// Pattern without file path - consider valid
			validPatterns.push({ name: patternName });
		}
	}

	// Check key_files from core_implementation
	const coreImpl = (expertise.core_implementation as Record<string, unknown>) || {};
	const keyFiles = (coreImpl.key_files as Array<{ path?: string }>) || [];
	
	for (const keyFile of keyFiles) {
		const filePath = keyFile.path;
		if (filePath) {
			let sql = "SELECT id FROM indexed_files WHERE path LIKE ?";
			const queryParams: string[] = ["%" + filePath];
			
			if (repositoryId) {
				sql += " AND repository_id = ?";
				queryParams.push(repositoryId);
			}
			sql += " LIMIT 1";
			
			const result = db.queryOne<{ id: string }>(sql, queryParams);
			
			if (!result) {
				missingKeyFiles.push(filePath);
			}
		}
	}

	const total = validPatterns.length + stalePatterns.length;
	
	logger.debug("validate_expertise completed", {
		domain,
		valid_count: validPatterns.length,
		stale_count: stalePatterns.length,
		missing_key_files: missingKeyFiles.length,
	});

	return {
		domain,
		valid: stalePatterns.length === 0 && missingKeyFiles.length === 0,
		valid_patterns: validPatterns,
		stale_patterns: stalePatterns,
		missing_key_files: missingKeyFiles,
		summary: {
			total,
			valid: validPatterns.length,
			stale: stalePatterns.length,
		},
	};
}

/**

/**
 * Execute sync_expertise tool
 * Extracts patterns from expertise.yaml and stores in patterns table
 */
export async function executeSyncExpertise(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (typeof params !== "object" || params === null) {
		throw new Error("Parameters must be an object");
	}

	const p = params as Record<string, unknown>;

	if (p.domain === undefined || typeof p.domain !== "string") {
		throw new Error("Missing or invalid required parameter: domain");
	}
	if (p.expertise_path !== undefined && typeof p.expertise_path !== "string") {
		throw new Error("Parameter 'expertise_path' must be a string");
	}
	if (p.dry_run !== undefined && typeof p.dry_run !== "boolean") {
		throw new Error("Parameter 'dry_run' must be a boolean");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const domain = p.domain as string;
	const defaultPath = ".claude/agents/experts/" + domain + "/expertise.yaml";
	const expertisePath = (p.expertise_path as string) || defaultPath;
	const dryRun = (p.dry_run as boolean) || false;

	// Check if expertise file exists
	if (!existsSync(expertisePath)) {
		return {
			success: false,
			error: "Expertise file not found: " + expertisePath,
			patterns_synced: 0,
			patterns_skipped: 0,
		};
	}

	// Read and parse expertise.yaml
	let expertise: Record<string, unknown>;
	try {
		const content = readFileSync(expertisePath, "utf-8");
		expertise = parseYaml(content) as Record<string, unknown>;
	} catch (error) {
		return {
			success: false,
			error: "Failed to parse expertise.yaml: " + (error instanceof Error ? error.message : String(error)),
			patterns_synced: 0,
			patterns_skipped: 0,
		};
	}

	// Resolve repository if provided
	let repositoryId: string | null = null;
	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			repositoryId = repoResult.id;
		}
	}

	const db = getGlobalDatabase();
	const { randomUUID } = await import("node:crypto");

	let patternsSynced = 0;
	let patternsSkipped = 0;
	const syncedPatterns: Array<{ name: string; type: string }> = [];

	// Extract patterns from expertise.yaml
	const patterns = (expertise.patterns as Record<string, unknown>) || {};
	
	for (const [patternName, patternData] of Object.entries(patterns)) {
		const pattern = patternData as Record<string, unknown>;
		const patternType = domain + ":" + patternName;
		const filePath = (pattern.file_path as string) || null;
		const description = (pattern.description as string) || (pattern.structure as string) || patternName;
		const example = (pattern.example as string) || (pattern.notes as string) || null;

		// Check if pattern already exists
		const existing = db.queryOne<{ id: string }>(
			"SELECT id FROM patterns WHERE pattern_type = ?",
			[patternType],
		);

		if (existing) {
			patternsSkipped++;
			continue;
		}

		if (!dryRun) {
			const id = randomUUID();
			db.run(
				"INSERT INTO patterns (id, repository_id, pattern_type, file_path, description, example, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
				[id, repositoryId, patternType, filePath, description, example],
			);
		}

		patternsSynced++;
		syncedPatterns.push({ name: patternName, type: patternType });
	}

	logger.info("sync_expertise completed", {
		domain,
		patterns_synced: patternsSynced,
		patterns_skipped: patternsSkipped,
		dry_run: dryRun,
	});

	return {
		success: true,
		dry_run: dryRun,
		patterns_synced: patternsSynced,
		patterns_skipped: patternsSkipped,
		synced_patterns: syncedPatterns,
	};
}

/**

/**
 * Execute get_recent_patterns tool
 * Returns recently observed patterns from the patterns table
 */
export async function executeGetRecentPatterns(
	params: unknown,
	_requestId: string | number,
	_userId: string,
): Promise<unknown> {
	if (params !== undefined && (typeof params !== "object" || params === null)) {
		throw new Error("Parameters must be an object");
	}

	const p = (params as Record<string, unknown>) || {};

	if (p.domain !== undefined && typeof p.domain !== "string") {
		throw new Error("Parameter 'domain' must be a string");
	}
	if (p.days !== undefined && typeof p.days !== "number") {
		throw new Error("Parameter 'days' must be a number");
	}
	if (p.limit !== undefined && typeof p.limit !== "number") {
		throw new Error("Parameter 'limit' must be a number");
	}
	if (p.repository !== undefined && typeof p.repository !== "string") {
		throw new Error("Parameter 'repository' must be a string");
	}

	const db = getGlobalDatabase();
	const domain = p.domain as string | undefined;
	const days = Math.min(Math.max((p.days as number) || 30, 1), 365);
	const limit = Math.min(Math.max((p.limit as number) || 20, 1), 100);

	let sql = "SELECT id, repository_id, pattern_type, file_path, description, example, created_at FROM patterns WHERE created_at > datetime('now', '-' || ? || ' days')";
	const queryParams: (string | number)[] = [days];

	// Filter by domain prefix if provided
	if (domain) {
		sql += " AND pattern_type LIKE ?";
		queryParams.push(domain + ":%");
	}

	// Filter by repository if provided
	if (p.repository) {
		const repoResult = resolveRepositoryIdentifierWithError(p.repository as string);
		if (!("error" in repoResult)) {
			sql += " AND repository_id = ?";
			queryParams.push(repoResult.id);
		}
	}

	sql += " ORDER BY created_at DESC LIMIT ?";
	queryParams.push(limit);

	const rows = db.query<{
		id: string;
		repository_id: string | null;
		pattern_type: string;
		file_path: string | null;
		description: string;
		example: string | null;
		created_at: string;
	}>(sql, queryParams);

	logger.debug("get_recent_patterns completed", {
		domain,
		days,
		patterns_found: rows.length,
	});

	return {
		patterns: rows.map((row) => ({
			id: row.id,
			pattern_type: row.pattern_type,
			file_path: row.file_path,
			description: row.description,
			example: row.example,
			created_at: row.created_at,
		})),
		count: rows.length,
		filter: {
			domain: domain || null,
			days,
		},
	};
}

/**

/**
 * Main tool call dispatcher
 */
export async function handleToolCall(
	toolName: string,
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	switch (toolName) {
		case "search":
			return await executeSearch(params, requestId, userId);
		case "index_repository":
			return await executeIndexRepository(params, requestId, userId);
		case "list_recent_files":
			return await executeListRecentFiles(params, requestId, userId);
		case "search_dependencies":
			return await executeSearchDependencies(params, requestId, userId);
		case "analyze_change_impact":
			return await executeAnalyzeChangeImpact(params, requestId, userId);
		case "validate_implementation_spec":
			return await executeValidateImplementationSpec(params, requestId, userId);
		case "kota_sync_export":
			return await executeSyncExport(params, requestId);
		case "kota_sync_import":
			return await executeSyncImport(params, requestId);
		case "generate_task_context":
			return await executeGenerateTaskContext(params, requestId, userId);
		// Memory Layer tools
		case "record_decision":
			return await executeRecordDecision(params, requestId, userId);
		case "record_failure":
			return await executeRecordFailure(params, requestId, userId);
		case "record_insight":
			return await executeRecordInsight(params, requestId, userId);
		// Expertise Layer tools
		case "get_domain_key_files":
			return await executeGetDomainKeyFiles(params, requestId, userId);
		case "validate_expertise":
			return await executeValidateExpertise(params, requestId, userId);
		case "sync_expertise":
			return await executeSyncExpertise(params, requestId, userId);
		case "get_recent_patterns":
			return await executeGetRecentPatterns(params, requestId, userId);
		default:
			throw invalidParams(requestId, "Unknown tool: " + toolName);
	}
}
