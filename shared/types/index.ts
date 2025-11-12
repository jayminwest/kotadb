/**
 * Shared TypeScript types for KotaDB monorepo.
 *
 * This is the main entry point for importing types across all projects.
 * Re-exports all type definitions from domain-specific modules.
 *
 * @example
 * // Import specific types
 * import type { IndexRequest, SearchResponse } from "@shared/types";
 *
 * @example
 * // Import from specific module
 * import type { AuthContext, Tier } from "@shared/types/auth";
 */

// API request/response types
export type {
	IndexRequest,
	IndexResponse,
	SearchRequest,
	SearchResult,
	SearchResponse,
	RecentFilesResponse,
	HealthResponse,
} from "./api";

// Database entity types
export type {
	Repository,
	IndexedFile,
	IndexJob,
	Symbol,
	Reference,
	Dependency,
	Project,
	ProjectRepository,
	ProjectWithRepos,
	ProjectListItem,
	CreateProjectRequest,
	UpdateProjectRequest,
} from "./entities";

// Authentication types
export type {
	Tier,
	AuthContext,
	ApiKey,
	RateLimitResult,
} from "./auth";

// Validation types
export type {
	ValidationError,
	ValidationRequest,
	ValidationResponse,
} from "./validation";

// MCP tools types (impact analysis and spec validation)
export type {
	ChangeImpactRequest,
	ChangeImpactResponse,
	AffectedFile,
	TestScope,
	ConflictInfo,
	ImplementationSpec,
	FileSpec,
	MigrationSpec,
	DependencySpec,
	ValidationResult,
	ValidationIssue,
} from "./mcp-tools";
