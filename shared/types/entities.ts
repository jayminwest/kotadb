/**
 * Database entity types for KotaDB PostgreSQL schema.
 *
 * These types mirror the structure of database tables and are used
 * for type-safe queries and ORM operations.
 */

/**
 * Repository entity from repositories table.
 * Represents a Git repository indexed by KotaDB.
 */
export interface Repository {
	/** Repository UUID (primary key) */
	id: string;

	/** User UUID who owns this repository (foreign key to users table) */
	user_id: string;

	/** Repository full name (e.g., "owner/repo") */
	full_name: string;

	/** Git clone URL */
	git_url: string;

	/** Default branch name (e.g., "main", "master") */
	default_branch: string;

	/** Repository description (optional) */
	description?: string;

	/** Creation timestamp */
	created_at: string;

	/** Last update timestamp */
	updated_at: string;
}

/**
 * IndexedFile entity from indexed_files table.
 * Represents a parsed source file from a repository.
 */
export interface IndexedFile {
	/** File UUID (primary key) */
	id?: string;

	/** Repository UUID (foreign key to repositories table) */
	repository_id?: string;

	/** Alias for repository_id (for API compatibility) */
	projectRoot: string;

	/** File path relative to repository root */
	path: string;

	/** File content (full text for search) */
	content: string;

	/** Programming language detected from extension */
	language?: string;

	/** File size in bytes */
	size_bytes?: number;

	/** Package dependencies extracted from file */
	dependencies: string[];

	/** Timestamp when file was indexed */
	indexedAt: Date;

	/** Additional metadata (stored as JSONB in database) */
	metadata?: Record<string, unknown>;
}

/**
 * IndexJob entity from index_jobs table.
 * Tracks status of repository indexing operations.
 */
export interface IndexJob {
	/** Job UUID (primary key) */
	id: string;

	/** Repository UUID (foreign key to repositories table) */
	repository_id: string;

	/** Git ref being indexed (branch, tag, or commit) */
	ref?: string;

	/** Job status (pending, completed, failed, skipped) */
	status: string;

	/** Timestamp when job started */
	started_at: string;

	/** Timestamp when job completed */
	completed_at?: string;

	/** Error message if job failed */
	error_message?: string;

	/** Job statistics (files indexed, symbols extracted, etc.) */
	metadata?: Record<string, unknown>;
}

/**
 * Symbol entity from symbols table.
 * Represents a code symbol (function, class, variable, etc.) extracted from AST.
 */
export interface Symbol {
	/** Symbol UUID (primary key) */
	id: string;

	/** File UUID (foreign key to indexed_files table) */
	file_id: string;

	/** Symbol name (e.g., "myFunction", "MyClass") */
	name: string;

	/** Symbol kind (function, class, variable, interface, etc.) */
	kind: string;

	/** Starting line number in file */
	line_start: number;

	/** Ending line number in file */
	line_end: number;

	/** Symbol signature (e.g., function parameters and return type) */
	signature?: string;

	/** Documentation comment (JSDoc, TSDoc, etc.) */
	documentation?: string;

	/** Additional metadata (column positions, modifiers, etc.) */
	metadata?: Record<string, unknown>;

	/** Creation timestamp */
	created_at: string;
}

/**
 * Reference entity from references table.
 * Represents a reference to a symbol from another location.
 */
export interface Reference {
	/** Reference UUID (primary key) */
	id: string;

	/** Symbol UUID being referenced (foreign key to symbols table) */
	symbol_id: string;

	/** File UUID where reference occurs (foreign key to indexed_files table) */
	file_id: string;

	/** Line number of reference */
	line: number;

	/** Column number of reference */
	column: number;

	/** Reference type (import, call, type_reference, etc.) */
	reference_type?: string;

	/** Creation timestamp */
	created_at: string;
}

/**
 * Dependency entity from dependencies table.
 * Represents a package dependency extracted from a file.
 */
export interface Dependency {
	/** Dependency UUID (primary key) */
	id: string;

	/** File UUID (foreign key to indexed_files table) */
	file_id: string;

	/** Package name (e.g., "@supabase/supabase-js") */
	package_name: string;

	/** Package version (e.g., "^2.0.0") */
	version?: string;

	/** Import path from source code (e.g., "@supabase/supabase-js") */
	import_path: string;

	/** Import type (default, named, namespace, etc.) */
	import_type?: string;

	/** Creation timestamp */
	created_at: string;
}
