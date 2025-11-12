import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	ProjectListItem,
	ProjectWithRepos,
	CreateProjectRequest,
	UpdateProjectRequest,
} from "@shared/types";
import type { Repository } from "@shared/types";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "api-projects" });

/**
 * Create a new project with optional repository associations.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context
 * @param request - Project creation request
 * @returns Created project UUID
 */
export async function createProject(
	client: SupabaseClient,
	userId: string,
	request: CreateProjectRequest,
): Promise<string> {
	// Create project
	const { data: project, error: projectError } = await client
		.from("projects")
		.insert({
			user_id: userId,
			name: request.name,
			description: request.description ?? null,
		})
		.select("id")
		.single();

	if (projectError) {
		const err = new Error(`Failed to create project: ${projectError.message}`);
		logger.error("Failed to create project", err, {
			userId,
			projectName: request.name,
		});
		Sentry.captureException(err, {
			extra: { userId, projectName: request.name },
		});
		throw err;
	}

	// Add repository associations if provided
	if (request.repository_ids && request.repository_ids.length > 0) {
		const associations = request.repository_ids.map((repoId: string) => ({
			project_id: project.id,
			repository_id: repoId,
		}));

		const { error: assocError } = await client
			.from("project_repositories")
			.insert(associations);

		if (assocError) {
			// Log error but don't fail project creation
			const err = new Error(`Failed to add repositories to project: ${assocError.message}`);
			logger.error("Failed to add repositories to project", err, {
				projectId: project.id,
				repositoryIds: request.repository_ids,
			});
			Sentry.captureException(err, {
				extra: { projectId: project.id, repositoryIds: request.repository_ids },
			});
		}
	}

	return project.id;
}

/**
 * List all projects for a user with repository counts.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context
 * @returns Array of projects with repository counts
 */
export async function listProjects(
	client: SupabaseClient,
	userId: string,
): Promise<ProjectListItem[]> {
	const { data: projects, error } = await client
		.from("projects")
		.select(
			`
			*,
			project_repositories (count)
		`,
		)
		.eq("user_id", userId)
		.order("created_at", { ascending: false });

	if (error) {
		const err = new Error(`Failed to list projects: ${error.message}`);
		logger.error("Failed to list projects", err, { userId });
		Sentry.captureException(err, { extra: { userId } });
		throw err;
	}

	return (projects || []).map(
		(p: { project_repositories?: [{ count: number }] | number }) => {
			let count = 0;
			if (Array.isArray(p.project_repositories) && p.project_repositories[0]) {
				count = p.project_repositories[0].count;
			} else if (typeof p.project_repositories === "number") {
				count = p.project_repositories;
			}
			return {
				...p,
				repository_count: count,
			};
		},
	) as ProjectListItem[];
}

/**
 * Get a project by ID with full repository details.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context
 * @param projectId - Project UUID
 * @returns Project with repositories or null if not found
 */
export async function getProject(
	client: SupabaseClient,
	userId: string,
	projectId: string,
): Promise<ProjectWithRepos | null> {
	// Get project
	const { data: project, error: projectError } = await client
		.from("projects")
		.select("*")
		.eq("id", projectId)
		.eq("user_id", userId)
		.single();

	if (projectError) {
		if (projectError.code === "PGRST116") {
			// Not found
			return null;
		}
		const err = new Error(`Failed to get project: ${projectError.message}`);
		logger.error("Failed to get project", err, { userId, projectId });
		Sentry.captureException(err, { extra: { userId, projectId } });
		throw err;
	}

	// Get associated repositories
	const { data: associations, error: assocError } = await client
		.from("project_repositories")
		.select(
			`
			repository_id,
			repositories!inner (*)
		`,
		)
		.eq("project_id", projectId);

	if (assocError) {
		const err = new Error(`Failed to get project repositories: ${assocError.message}`);
		logger.error("Failed to get project repositories", err, { projectId });
		Sentry.captureException(err, { extra: { projectId } });
		throw err;
	}

	// Supabase returns nested objects when using joins
	const repositories: Repository[] = associations
		? (associations
				.map((item: { repositories: Repository | Repository[] | null }) => {
					// Handle both single object and array responses
					if (Array.isArray(item.repositories)) {
						return item.repositories[0];
					}
					return item.repositories;
				})
				.filter((r): r is Repository => r !== null) as Repository[])
		: [];

	return {
		...project,
		repositories,
		repository_count: repositories.length,
	};
}

/**
 * Update a project's name, description, and/or repository associations.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context
 * @param projectId - Project UUID
 * @param updates - Fields to update
 * @returns Success status
 */
export async function updateProject(
	client: SupabaseClient,
	userId: string,
	projectId: string,
	updates: UpdateProjectRequest,
): Promise<void> {
	// Update project metadata
	if (updates.name !== undefined || updates.description !== undefined) {
		const updateData: { name?: string; description?: string | null } = {};
		if (updates.name !== undefined) {
			updateData.name = updates.name;
		}
		if (updates.description !== undefined) {
			updateData.description = updates.description ?? null;
		}

		const { error } = await client
			.from("projects")
			.update(updateData)
			.eq("id", projectId)
			.eq("user_id", userId);

		if (error) {
			const err = new Error(`Failed to update project: ${error.message}`);
			logger.error("Failed to update project", err, { userId, projectId });
			Sentry.captureException(err, { extra: { userId, projectId } });
			throw err;
		}
	}

	// Update repository associations if provided
	if (updates.repository_ids !== undefined) {
		// Delete all existing associations
		const { error: deleteError } = await client
			.from("project_repositories")
			.delete()
			.eq("project_id", projectId);

		if (deleteError) {
			const err = new Error(`Failed to delete project repositories: ${deleteError.message}`);
			logger.error("Failed to delete project repositories", err, { projectId });
			Sentry.captureException(err, { extra: { projectId } });
			throw err;
		}

		// Insert new associations
		if (updates.repository_ids.length > 0) {
			const associations = updates.repository_ids.map((repoId: string) => ({
				project_id: projectId,
				repository_id: repoId,
			}));

			const { error: insertError } = await client
				.from("project_repositories")
				.insert(associations);

			if (insertError) {
				const err = new Error(`Failed to add repositories to project: ${insertError.message}`);
				logger.error("Failed to add repositories to project", err, {
					projectId,
					repositoryIds: updates.repository_ids,
				});
				Sentry.captureException(err, {
					extra: { projectId, repositoryIds: updates.repository_ids },
				});
				throw err;
			}
		}
	}
}

/**
 * Delete a project (cascade deletes project_repositories associations).
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context
 * @param projectId - Project UUID
 * @returns Success status
 */
export async function deleteProject(
	client: SupabaseClient,
	userId: string,
	projectId: string,
): Promise<void> {
	const { error } = await client
		.from("projects")
		.delete()
		.eq("id", projectId)
		.eq("user_id", userId);

	if (error) {
		const err = new Error(`Failed to delete project: ${error.message}`);
		logger.error("Failed to delete project", err, { userId, projectId });
		Sentry.captureException(err, { extra: { userId, projectId } });
		throw err;
	}
}

/**
 * Add a repository to a project.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context (for validation)
 * @param projectId - Project UUID
 * @param repositoryId - Repository UUID
 */
export async function addRepositoryToProject(
	client: SupabaseClient,
	_userId: string,
	projectId: string,
	repositoryId: string,
): Promise<void> {
	const { error } = await client.from("project_repositories").insert({
		project_id: projectId,
		repository_id: repositoryId,
	});

	if (error) {
		// Handle duplicate constraint violation gracefully
		if (error.code === "23505") {
			logger.info("Repository already in project", {
				projectId,
				repositoryId,
			});
			return;
		}

		const err = new Error(`Failed to add repository to project: ${error.message}`);
		logger.error("Failed to add repository to project", err, {
			projectId,
			repositoryId,
		});
		Sentry.captureException(err, { extra: { projectId, repositoryId } });
		throw err;
	}
}

/**
 * Remove a repository from a project.
 *
 * @param client - Supabase client instance
 * @param userId - User UUID for RLS context (for validation)
 * @param projectId - Project UUID
 * @param repositoryId - Repository UUID
 */
export async function removeRepositoryFromProject(
	client: SupabaseClient,
	_userId: string,
	projectId: string,
	repositoryId: string,
): Promise<void> {
	const { error } = await client
		.from("project_repositories")
		.delete()
		.eq("project_id", projectId)
		.eq("repository_id", repositoryId);

	if (error) {
		const err = new Error(`Failed to remove repository from project: ${error.message}`);
		logger.error("Failed to remove repository from project", err, {
			projectId,
			repositoryId,
		});
		Sentry.captureException(err, { extra: { projectId, repositoryId } });
		throw err;
	}
}
