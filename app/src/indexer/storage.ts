/**
 * Database storage layer for indexed data
 *
 * Provides a TypeScript wrapper around the store_indexed_data() Postgres function.
 * Used by the indexing worker to atomically store files, symbols, references, and dependencies.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * File data for storage (matches indexed_files table columns)
 */
export interface FileData {
	path: string;
	content: string;
	language: string;
	size_bytes: number;
	metadata?: Record<string, unknown>;
}

/**
 * Symbol data for storage (matches symbols table columns)
 */
export interface SymbolData {
	file_path: string; // Used to lookup file_id in storage function
	name: string;
	kind: string;
	line_start: number;
	line_end: number;
	signature?: string;
	documentation?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Reference data for storage (matches references table columns)
 */
export interface ReferenceData {
	source_file_path: string; // Used to lookup source_file_id
	target_symbol_key?: string; // Format: "file_path::symbol_name::line_start"
	target_file_path?: string; // Fallback if symbol not extracted
	line_number: number;
	reference_type: string;
	metadata?: Record<string, unknown>;
}

/**
 * Dependency graph entry for storage (matches dependency_graph table columns)
 */
export interface DependencyGraphEntry {
	from_file_path?: string;
	to_file_path?: string;
	from_symbol_key?: string; // Format: "file_path::symbol_name::line_start"
	to_symbol_key?: string; // Format: "file_path::symbol_name::line_start"
	dependency_type: string;
	metadata?: Record<string, unknown>;
}

/**
 * Result stats returned by store_indexed_data()
 */
export interface StorageResult {
	files_indexed: number;
	symbols_extracted: number;
	references_found: number;
	dependencies_extracted: number;
}

/**
 * Store indexed data atomically using Postgres function
 *
 * Calls the store_indexed_data() RPC function which performs:
 * 1. Delete existing data for repository (idempotent retry safety)
 * 2. Insert files and build file_id mapping
 * 3. Insert symbols and build symbol_id mapping
 * 4. Insert references using file/symbol mappings
 * 5. Insert dependency graph entries
 * 6. Return summary stats
 *
 * All operations occur in a single transaction (atomicity guaranteed).
 *
 * @param supabase - Supabase client (must have service role or appropriate RLS context)
 * @param repositoryId - Repository UUID
 * @param files - Array of file data to store
 * @param symbols - Array of symbol data to store
 * @param references - Array of reference data to store
 * @param dependencyGraph - Array of dependency graph entries to store
 * @returns Summary stats (files_indexed, symbols_extracted, etc.)
 * @throws Error if RPC call fails or database transaction fails
 */
export async function storeIndexedData(
	supabase: SupabaseClient,
	repositoryId: string,
	files: FileData[],
	symbols: SymbolData[],
	references: ReferenceData[],
	dependencyGraph: DependencyGraphEntry[],
): Promise<StorageResult> {
	const { data, error } = await supabase.rpc("store_indexed_data", {
		p_repository_id: repositoryId,
		p_files: files,
		p_symbols: symbols,
		p_references: references,
		p_dependency_graph: dependencyGraph,
	});

	if (error) {
		throw new Error(`Failed to store indexed data: ${error.message}`);
	}

	if (!data) {
		throw new Error("store_indexed_data returned null data");
	}

	return data as StorageResult;
}
