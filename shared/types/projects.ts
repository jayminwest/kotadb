/**
 * Project and workspace entity types for KotaDB PostgreSQL schema.
 *
 * These types support multi-repository grouping and project management.
 */

import type { Repository } from "./entities";

/**
 * Project entity from projects table.
 * Represents a logical grouping of repositories for scoped searching.
 */
export interface Project {
	/** Project UUID (primary key) */
	id: string;

	/** User UUID who owns this project (foreign key to auth.users table) */
	user_id: string | null;

	/** Organization UUID that owns this project (foreign key to organizations table) */
	org_id: string | null;

	/** Project name (unique per user or organization) */
	name: string;

	/** Project description (optional) */
	description?: string | null;

	/** Creation timestamp */
	created_at: string;

	/** Last update timestamp */
	updated_at: string;

	/** Additional metadata (stored as JSONB in database) */
	metadata?: Record<string, unknown>;
}

/**
 * ProjectRepository entity from project_repositories table.
 * Represents a many-to-many relationship between projects and repositories.
 */
export interface ProjectRepository {
	/** Association UUID (primary key) */
	id: string;

	/** Project UUID (foreign key to projects table) */
	project_id: string;

	/** Repository UUID (foreign key to repositories table) */
	repository_id: string;

	/** Timestamp when repository was added to project */
	added_at: string;
}

/**
 * Project with associated repositories (for API responses).
 * Extends Project with a list of repository details.
 */
export interface ProjectWithRepos extends Project {
	/** List of repositories in this project */
	repositories: Repository[];

	/** Count of repositories in this project */
	repository_count: number;
}

/**
 * Create project request payload
 */
export interface CreateProjectRequest {
	/** Project name */
	name: string;

	/** Project description (optional) */
	description?: string;

	/** List of repository IDs to add to project (optional) */
	repository_ids?: string[];
}

/**
 * Update project request payload
 */
export interface UpdateProjectRequest {
	/** Updated project name (optional) */
	name?: string;

	/** Updated project description (optional) */
	description?: string;

	/** Updated list of repository IDs (replaces existing, optional) */
	repository_ids?: string[];
}

/**
 * Project list item (for GET /api/projects response)
 */
export interface ProjectListItem extends Project {
	/** Count of repositories in this project */
	repository_count: number;
}
