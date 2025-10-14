import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { IndexedFile } from "@shared/index";
import { extractDependencies } from "./extractors";

const SUPPORTED_EXTENSIONS = new Set<string>([
	".ts",
	".tsx",
	".js",
	".jsx",
	".cjs",
	".mjs",
	".json",
]);

const IGNORED_DIRECTORIES = new Set<string>([
	".git",
	"node_modules",
	"dist",
	"build",
	"out",
	"coverage",
]);

export async function discoverSources(projectRoot: string): Promise<string[]> {
	const absoluteRoot = resolve(projectRoot);
	const pending = [absoluteRoot];
	const discovered: string[] = [];

	while (pending.length > 0) {
		const current = pending.pop()!;
		let entries: string[];

		try {
			entries = await readdir(current);
		} catch (error) {
			console.warn(
				`discoverSources: skipping ${current}: ${(error as Error).message}`,
			);
			continue;
		}

		for (const entry of entries) {
			if (IGNORED_DIRECTORIES.has(entry)) {
				continue;
			}

			const fullPath = join(current, entry);
			let stats;
			try {
				stats = await stat(fullPath);
			} catch (error) {
				console.warn(
					`discoverSources: skipping ${fullPath}: ${(error as Error).message}`,
				);
				continue;
			}

			if (stats.isDirectory()) {
				pending.push(fullPath);
				continue;
			}

			if (stats.isFile() && isSupportedSource(fullPath)) {
				discovered.push(fullPath);
			}
		}
	}

	return discovered.sort();
}

export async function parseSourceFile(
	path: string,
	projectRoot: string,
): Promise<IndexedFile | null> {
	if (!isSupportedSource(path)) {
		return null;
	}

	let content = "";
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		console.warn(
			`parseSourceFile: unable to read ${path}: ${(error as Error).message}`,
		);
		return null;
	}

	const dependencies = extractDependencies(content);

	return {
		projectRoot: resolve(projectRoot),
		path: path.replace(resolve(projectRoot) + "/", ""),
		content,
		dependencies,
		indexedAt: new Date(),
	};
}

function isSupportedSource(filePath: string): boolean {
	return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}
