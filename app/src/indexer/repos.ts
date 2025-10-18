import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { IndexRequest } from "@shared/types";

export interface RepositoryContext {
	repository: string;
	ref: string;
	localPath: string;
}

const WORKSPACE_ROOT = resolve("data", "workspace");

export async function prepareRepository(
	request: IndexRequest,
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

	await ensureRepository(remoteUrl, repoPath);
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
): Promise<void> {
	if (!existsSync(destination) || !existsSync(join(destination, ".git"))) {
		await cloneRepository(remoteUrl, destination);
		return;
	}

	// Keep remote URL in sync in case it changed.
	await runGit(["remote", "set-url", "origin", remoteUrl], {
		cwd: destination,
		allowFailure: true,
	});
	await runGit(["fetch", "origin", "--prune", "--tags"], { cwd: destination });
}

async function cloneRepository(
	remoteUrl: string,
	destination: string,
): Promise<void> {
	await mkdir(dirname(destination), { recursive: true });
	await runGit(["clone", remoteUrl, destination], {
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
		throw new Error(
			`git ${args.join(" ")} failed with code ${exitCode}: ${stderr.trim()}`,
		);
	}

	return {
		stdout,
		stderr,
		exitCode,
	};
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
