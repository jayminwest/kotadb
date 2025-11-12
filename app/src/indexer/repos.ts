import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { IndexRequest } from "@shared/types";
import { getInstallationToken } from "@github/app-auth";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-repos" });

export interface RepositoryContext {
	repository: string;
	ref: string;
	localPath: string;
}

const WORKSPACE_ROOT = resolve("data", "workspace");

export async function prepareRepository(
	request: IndexRequest,
	installationId?: number,
): Promise<RepositoryContext> {
	const desiredRef = request.ref ?? "HEAD";

	if (request.localPath) {
		return {
			repository: request.repository,
			ref: desiredRef,
			localPath: resolve(request.localPath),
		};
	}

	const remoteUrl = resolveRemoteUrl(request.repository);
	const repoPath = resolve(WORKSPACE_ROOT, sanitizeRepoName(remoteUrl));

	await ensureRepository(remoteUrl, repoPath, installationId);
	const revision = await checkoutRef(repoPath, desiredRef);

	return {
		repository: request.repository,
		ref: revision,
		localPath: repoPath,
	};
}

async function ensureRepository(
	remoteUrl: string,
	destination: string,
	installationId?: number,
): Promise<void> {
	if (!existsSync(destination) || !existsSync(join(destination, ".git"))) {
		await cloneRepository(remoteUrl, destination, installationId);
		return;
	}

	// Keep remote URL in sync in case it changed.
	const authenticatedUrl = installationId
		? await injectInstallationToken(remoteUrl, installationId)
		: remoteUrl;

	await runGit(["remote", "set-url", "origin", authenticatedUrl], {
		cwd: destination,
		allowFailure: true,
	});
	await runGit(["fetch", "origin", "--prune", "--tags"], { cwd: destination });
}

async function cloneRepository(
	remoteUrl: string,
	destination: string,
	installationId?: number,
): Promise<void> {
	await mkdir(dirname(destination), { recursive: true });

	const authenticatedUrl = installationId
		? await injectInstallationToken(remoteUrl, installationId)
		: remoteUrl;

	await runGit(["clone", authenticatedUrl, destination], {
		cwd: dirname(destination),
	});
}

async function checkoutRef(
	repositoryPath: string,
	ref: string,
): Promise<string> {
	await runGit(["fetch", "origin", "--prune", "--tags"], {
		cwd: repositoryPath,
	});

	if (!ref || ref === "HEAD") {
		const branch = await resolveDefaultBranch(repositoryPath);
		await runGit(["checkout", branch], { cwd: repositoryPath });
		await runGit(["reset", "--hard", `origin/${branch}`], {
			cwd: repositoryPath,
		});
		return await currentRevision(repositoryPath);
	}

	const direct = await runGit(["checkout", "--force", ref], {
		cwd: repositoryPath,
		allowFailure: true,
	});

	if (direct.exitCode === 0) {
		await runGit(["reset", "--hard", ref], {
			cwd: repositoryPath,
			allowFailure: true,
		});
		return await currentRevision(repositoryPath);
	}

	const remoteRef = `origin/${ref}`;
	const remote = await runGit(["rev-parse", "--verify", remoteRef], {
		cwd: repositoryPath,
		allowFailure: true,
	});

	if (remote.exitCode === 0) {
		await runGit(["checkout", "-B", ref, remoteRef], { cwd: repositoryPath });
		return await currentRevision(repositoryPath);
	}

	const fetched = await runGit(["fetch", "origin", ref], {
		cwd: repositoryPath,
		allowFailure: true,
	});

	if (fetched.exitCode === 0) {
		const finalCheckout = await runGit(["checkout", "--force", ref], {
			cwd: repositoryPath,
			allowFailure: true,
		});

		if (finalCheckout.exitCode === 0) {
			return await currentRevision(repositoryPath);
		}
	}

	throw new Error(
		`Unable to checkout ref '${ref}' for repository at ${repositoryPath}`,
	);
}

async function resolveDefaultBranch(repositoryPath: string): Promise<string> {
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

async function currentRevision(repositoryPath: string): Promise<string> {
	const result = await runGit(["rev-parse", "HEAD"], { cwd: repositoryPath });
	return result.stdout.trim();
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

/**
 * Inject GitHub App installation token into a git remote URL
 * @param remoteUrl - Original git remote URL
 * @param installationId - GitHub App installation ID
 * @returns Authenticated URL with token embedded
 *
 * @example
 * injectInstallationToken('https://github.com/foo/bar.git', 123)
 * // Returns: 'https://x-access-token:ghs_TOKEN@github.com/foo/bar.git'
 */
async function injectInstallationToken(
	remoteUrl: string,
	installationId: number,
): Promise<string> {
	try {
		const token = await getInstallationToken(installationId);

		// Parse the URL to inject credentials
		const url = new URL(remoteUrl);

		// Use 'x-access-token' as username with token as password
		// This is the standard format for GitHub App installation tokens
		url.username = "x-access-token";
		url.password = token;

		return url.toString();
	} catch (error) {
		logger.warn("Failed to inject installation token, falling back to unauthenticated cloning", {
			installation_id: installationId,
			remote_url: remoteUrl,
			error_message: error instanceof Error ? error.message : String(error),
		});

		if (error instanceof Error) {
			Sentry.captureException(error, {
				tags: {
					module: "repos",
					operation: "injectInstallationToken",
				},
				contexts: {
					github: {
						installation_id: installationId,
						remote_url: remoteUrl,
					},
				},
			});
		}

		return remoteUrl;
	}
}

function resolveRemoteUrl(repository: string): string {
	if (
		/^(?:https?|git|ssh):\/\//.test(repository) ||
		repository.startsWith("git@")
	) {
		return repository;
	}

	const base = process.env.KOTA_GIT_BASE_URL ?? "https://github.com";
	const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
	const normalizedRepo = repository.replace(/^\/+/, "");

	return `${normalizedBase}/${normalizedRepo}${normalizedRepo.endsWith(".git") ? "" : ".git"}`;
}

function sanitizeRepoName(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}
