/**
 * Repository preparation for local-only indexing.
 *
 * This module prepares local repository paths for indexing in KotaDB v2.0.0.
 * Remote cloning and GitHub App authentication have been removed - users now
 * pass local directory paths directly via the localPath parameter.
 *
 * Key features:
 * - Validates local path existence
 * - Resolves absolute paths
 * - Maintains git utility functions for potential local git repository support
 *
 * @see app/src/api/queries.ts - Index query implementation
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { IndexRequest } from "@shared/types";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-repos" });

export interface RepositoryContext {
	repository: string;
	ref: string;
	localPath: string;
}

/**
 * Prepare a repository for indexing by resolving and validating its local path.
 *
 * In KotaDB v2.0.0, all repositories are accessed via local paths. Remote cloning
 * and GitHub App authentication have been removed. This function validates that
 * the localPath is provided and exists on the filesystem.
 *
 * @param request - Index request containing repository name and local path
 * @returns Repository context with validated local path
 * @throws Error if localPath is missing or does not exist
 *
 * @example
 * const context = await prepareRepository({
 *   repository: "my-project",
 *   localPath: "/path/to/repo",
 *   ref: "HEAD"
 * });
 */
export async function prepareRepository(
	request: IndexRequest,
): Promise<RepositoryContext> {
	const desiredRef = request.ref ?? "HEAD";

	// Validate localPath is provided
	if (!request.localPath) {
		const error = new Error(
			"localPath is required for repository indexing in v2.0.0",
		);
		logger.error("Missing localPath in IndexRequest", error, {
			repository: request.repository,
			ref: desiredRef,
		});
		throw error;
	}

	// Validate localPath exists
	const absolutePath = resolve(request.localPath);
	if (!existsSync(absolutePath)) {
		const error = new Error(`Local path does not exist: ${absolutePath}`);
		logger.error("Invalid localPath in IndexRequest", error, {
			repository: request.repository,
			local_path: absolutePath,
		});
		throw error;
	}

	return {
		repository: request.repository,
		ref: desiredRef,
		localPath: absolutePath,
	};
}

/**
 * Get the current git revision (commit SHA) for a local repository.
 *
 * This utility function is kept for potential local git repository support.
 * It runs git rev-parse HEAD to get the current commit hash.
 *
 * @param repositoryPath - Absolute path to the git repository
 * @returns Current commit SHA as a string
 * @throws Error if git command fails
 */
export async function currentRevision(repositoryPath: string): Promise<string> {
	const result = await runGit(["rev-parse", "HEAD"], { cwd: repositoryPath });
	return result.stdout.trim();
}

/**
 * Resolve the default branch name for a local git repository.
 *
 * This utility function is kept for potential local git repository support.
 * It attempts to determine the default branch by checking:
 * 1. Remote HEAD symbolic reference
 * 2. Current branch name
 * 3. Common branch names (main, master)
 *
 * @param repositoryPath - Absolute path to the git repository
 * @returns Default branch name (e.g., "main", "master")
 * @throws Error if unable to determine default branch
 */
export async function resolveDefaultBranch(
	repositoryPath: string,
): Promise<string> {
	const remoteHead = await runGit(
		["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
		{
			cwd: repositoryPath,
			allowFailure: true,
		},
	);

	if (remoteHead.exitCode === 0) {
		const branch = remoteHead.stdout.trim().replace(/^origin\//, "");
		if (branch) {
			return branch;
		}
	}

	const currentBranch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
		cwd: repositoryPath,
		allowFailure: true,
	});

	if (currentBranch.exitCode === 0) {
		const branch = currentBranch.stdout.trim();
		if (branch && branch !== "HEAD") {
			return branch;
		}
	}

	for (const candidate of ["main", "master"]) {
		const exists = await runGit(["rev-parse", "--verify", candidate], {
			cwd: repositoryPath,
			allowFailure: true,
		});

		if (exists.exitCode === 0) {
			return candidate;
		}

		const remoteExists = await runGit(
			["rev-parse", "--verify", `origin/${candidate}`],
			{
				cwd: repositoryPath,
				allowFailure: true,
			},
		);

		if (remoteExists.exitCode === 0) {
			return candidate;
		}
	}

	throw new Error(
		`Unable to determine default branch for repository at ${repositoryPath}`,
	);
}

interface GitCommandOptions {
	cwd?: string;
	allowFailure?: boolean;
}

interface GitCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * Run a git command in a specified directory.
 *
 * This utility function executes git commands and handles errors appropriately.
 * It logs failures to Sentry and throws errors unless allowFailure is true.
 *
 * @param args - Git command arguments (e.g., ["status", "--porcelain"])
 * @param options - Command options (working directory, failure handling)
 * @returns Command result with stdout, stderr, and exit code
 * @throws Error if command fails and allowFailure is false
 */
async function runGit(
	args: string[],
	options: GitCommandOptions = {},
): Promise<GitCommandResult> {
	const process = Bun.spawn({
		cmd: ["git", ...args],
		stdout: "pipe",
		stderr: "pipe",
		cwd: options.cwd,
	});

	const stdoutPromise = process.stdout
		? new Response(process.stdout).text()
		: Promise.resolve("");
	const stderrPromise = process.stderr
		? new Response(process.stderr).text()
		: Promise.resolve("");
	const exitCode = await process.exited;
	const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

	if (exitCode !== 0 && !options.allowFailure) {
		const gitError = new Error(
			`git ${args.join(" ")} failed with code ${exitCode}: ${stderr.trim()}`,
		);

		logger.error("Git command failed", gitError, {
			git_command: args.join(" "),
			exit_code: exitCode,
			cwd: options.cwd,
			stderr: stderr.trim(),
		});

		Sentry.captureException(gitError, {
			tags: {
				module: "repos",
				operation: "git",
			},
			contexts: {
				git: {
					command: args.join(" "),
					exit_code: exitCode,
					cwd: options.cwd,
				},
			},
		});

		throw gitError;
	}

	return {
		stdout,
		stderr,
		exitCode,
	};
}
