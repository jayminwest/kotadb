/**
 * Path resolver unit tests.
 *
 * Tests TypeScript path alias resolution with tsconfig.json parsing.
 * Uses real test fixtures (no mocks) following antimocking philosophy.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseTsConfig, resolvePathAlias } from "@indexer/path-resolver";

const FIXTURES_DIR = "/tmp/path-resolver-test-fixtures";

/**
 * Create test fixture directories and files
 */
function setupFixtures() {
	// Clean up if exists
	try {
		rmSync(FIXTURES_DIR, { recursive: true, force: true });
	} catch {
		// Ignore errors
	}

	// Create simple tsconfig fixture
	const simpleDir = join(FIXTURES_DIR, "simple");
	mkdirSync(simpleDir, { recursive: true });
	mkdirSync(join(simpleDir, "src", "api"), { recursive: true });
	mkdirSync(join(simpleDir, "src", "db"), { recursive: true });

	writeFileSync(
		join(simpleDir, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				baseUrl: ".",
				paths: {
					"@api": ["src/api/index.ts"],
					"@api/*": ["src/api/*"],
					"@db/*": ["src/db/*"],
					"@shared/*": ["./shared/*"],
				},
			},
		}),
	);

	writeFileSync(join(simpleDir, "src", "api", "routes.ts"), "export const routes = []");
	writeFileSync(join(simpleDir, "src", "api", "index.ts"), "export const api = {}");
	writeFileSync(join(simpleDir, "src", "db", "schema.ts"), "export const schema = {}");

	// Create utils directory with index file for index resolution test
	mkdirSync(join(simpleDir, "src", "api", "utils"), { recursive: true });
	writeFileSync(
		join(simpleDir, "src", "api", "utils", "index.ts"),
		"export const utils = {}"
	);

	// Create extends fixture (child extends parent)
	const extendsDir = join(FIXTURES_DIR, "extends");
	mkdirSync(extendsDir, { recursive: true });
	mkdirSync(join(extendsDir, "lib"), { recursive: true });
	mkdirSync(join(extendsDir, "src"), { recursive: true });

	writeFileSync(
		join(extendsDir, "base.json"),
		JSON.stringify({
			compilerOptions: {
				baseUrl: ".",
				paths: {
					"@base/*": ["lib/*"],
				},
			},
		}),
	);

	writeFileSync(
		join(extendsDir, "tsconfig.json"),
		JSON.stringify({
			extends: "./base.json",
			compilerOptions: {
				paths: {
					"@app/*": ["src/*"],
				},
			},
		}),
	);

	writeFileSync(join(extendsDir, "lib", "utils.ts"), "export const utils = {}");
	writeFileSync(join(extendsDir, "src", "index.ts"), "export const app = {}");

	// Create jsconfig fixture (JavaScript project)
	const jsconfigDir = join(FIXTURES_DIR, "jsconfig");
	mkdirSync(jsconfigDir, { recursive: true });
	mkdirSync(join(jsconfigDir, "lib"), { recursive: true });

	writeFileSync(
		join(jsconfigDir, "jsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				baseUrl: ".",
				paths: {
					"@lib/*": ["lib/*"],
				},
			},
		}),
	);

	writeFileSync(join(jsconfigDir, "lib", "helpers.js"), "export const helpers = {}");

	// Create multi-path fixture
	const multiPathDir = join(FIXTURES_DIR, "multipath");
	mkdirSync(multiPathDir, { recursive: true });
	mkdirSync(join(multiPathDir, "src", "shared"), { recursive: true });
	mkdirSync(join(multiPathDir, "packages", "shared"), { recursive: true });

	writeFileSync(
		join(multiPathDir, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				baseUrl: ".",
				paths: {
					"@shared/*": ["src/shared/*", "packages/shared/*"],
				},
			},
		}),
	);

	writeFileSync(join(multiPathDir, "packages", "shared", "utils.ts"), "export const utils = {}");

	// Create empty directory for missing config test
	const emptyDir = join(FIXTURES_DIR, "empty");
	mkdirSync(emptyDir, { recursive: true });

	// Create circular extends fixture
	const circularDir = join(FIXTURES_DIR, "circular");
	mkdirSync(circularDir, { recursive: true });

	writeFileSync(
		join(circularDir, "a.json"),
		JSON.stringify({
			extends: "./b.json",
			compilerOptions: {
				paths: {
					"@a/*": ["src/a/*"],
				},
			},
		}),
	);

	writeFileSync(
		join(circularDir, "b.json"),
		JSON.stringify({
			extends: "./a.json",
			compilerOptions: {
				paths: {
					"@b/*": ["src/b/*"],
				},
			},
		}),
	);

	writeFileSync(
		join(circularDir, "tsconfig.json"),
		JSON.stringify({
			extends: "./a.json",
		}),
	);

	// Create baseUrl fixture (baseUrl other than ".")
	const baseUrlDir = join(FIXTURES_DIR, "baseurl");
	mkdirSync(baseUrlDir, { recursive: true });
	mkdirSync(join(baseUrlDir, "src", "api"), { recursive: true });

	writeFileSync(
		join(baseUrlDir, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				baseUrl: "src",
				paths: {
					"@api/*": ["api/*"],
				},
			},
		}),
	);

	writeFileSync(join(baseUrlDir, "src", "api", "routes.ts"), "export const routes = []");
}

describe("path-resolver", () => {
	beforeAll(() => {
		setupFixtures();
	});

	describe("parseTsConfig", () => {
		it("parses simple tsconfig.json with baseUrl and paths", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const mappings = parseTsConfig(simpleDir);

			expect(mappings).not.toBeNull();
			expect(mappings?.baseUrl).toBe(".");
			expect(mappings?.paths["@api"]).toEqual(["src/api/index.ts"]);
			expect(mappings?.paths["@api/*"]).toEqual(["src/api/*"]);
			expect(mappings?.paths["@db/*"]).toEqual(["src/db/*"]);
			expect(mappings?.paths["@shared/*"]).toEqual(["./shared/*"]);
		});

		it("handles missing tsconfig.json gracefully", () => {
			const emptyDir = join(FIXTURES_DIR, "empty");
			const mappings = parseTsConfig(emptyDir);

			expect(mappings).toBeNull();
		});

		it("parses tsconfig.json with extends", () => {
			const extendsDir = join(FIXTURES_DIR, "extends");
			const mappings = parseTsConfig(extendsDir);

			expect(mappings).not.toBeNull();
			expect(mappings?.paths["@base/*"]).toEqual(["lib/*"]); // From parent
			expect(mappings?.paths["@app/*"]).toEqual(["src/*"]); // From child
		});

		it("handles circular extends with depth limit", () => {
			const circularDir = join(FIXTURES_DIR, "circular");
			const mappings = parseTsConfig(circularDir);

			// Should not infinite loop, may return partial config or null
			expect(mappings !== undefined).toBe(true);
		});

		it("falls back to jsconfig.json when tsconfig missing", () => {
			const jsconfigDir = join(FIXTURES_DIR, "jsconfig");
			const mappings = parseTsConfig(jsconfigDir);

			expect(mappings).not.toBeNull();
			expect(mappings?.paths["@lib/*"]).toEqual(["lib/*"]);
		});

		it("returns null for nonexistent directory", () => {
			const mappings = parseTsConfig("/nonexistent/path");
			expect(mappings).toBeNull();
		});
	});

	describe("resolvePathAlias", () => {
		it("resolves simple path alias", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const files = new Set([join(simpleDir, "src", "api", "routes.ts")]);
			const mappings = {
				baseUrl: ".",
				paths: { "@api/*": ["src/api/*"] },
			};

			const result = resolvePathAlias("@api/routes", simpleDir, files, mappings);
			expect(result).toBe(join(simpleDir, "src", "api", "routes.ts"));
		});

		it("tries multiple paths and returns first match", () => {
			const multiPathDir = join(FIXTURES_DIR, "multipath");
			const files = new Set([join(multiPathDir, "packages", "shared", "utils.ts")]);
			const mappings = {
				baseUrl: ".",
				paths: { "@shared/*": ["src/shared/*", "packages/shared/*"] },
			};

			const result = resolvePathAlias("@shared/utils", multiPathDir, files, mappings);
			expect(result).toBe(join(multiPathDir, "packages", "shared", "utils.ts"));
		});

		it("returns null when no paths match", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const files = new Set([join(simpleDir, "src", "api", "routes.ts")]);
			const mappings = {
				baseUrl: ".",
				paths: { "@api/*": ["src/api/*"] },
			};

			const result = resolvePathAlias("@db/schema", simpleDir, files, mappings);
			expect(result).toBeNull();
		});

		it("handles nested path aliases", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const files = new Set([join(simpleDir, "src", "db", "schema.ts")]);
			const mappings = {
				baseUrl: ".",
				paths: { "@db/*": ["src/db/*"] },
			};

			const result = resolvePathAlias("@db/schema", simpleDir, files, mappings);
			expect(result).toBe(join(simpleDir, "src", "db", "schema.ts"));
		});

		it("resolves imports without extension", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const files = new Set([join(simpleDir, "src", "api", "routes.ts")]);
			const mappings = {
				baseUrl: ".",
				paths: { "@api/*": ["src/api/*"] },
			};

			const result = resolvePathAlias("@api/routes", simpleDir, files, mappings);
			expect(result).toBe(join(simpleDir, "src", "api", "routes.ts"));
		});

		it("returns null for import source that doesn't match any pattern", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const files = new Set([join(simpleDir, "src", "api", "routes.ts")]);
			const mappings = {
				baseUrl: ".",
				paths: { "@api/*": ["src/api/*"] },
			};

			const result = resolvePathAlias("react", simpleDir, files, mappings);
			expect(result).toBeNull();
		});

		it("returns null when file doesn't exist", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const files = new Set<string>([]);
			const mappings = {
				baseUrl: ".",
				paths: { "@api/*": ["src/api/*"] },
			};

			const result = resolvePathAlias("@api/missing", simpleDir, files, mappings);
			expect(result).toBeNull();
		});

		it("resolves exact match pattern (no wildcard)", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			const files = new Set([
				join(simpleDir, "src", "api", "index.ts")
			]);
			const mappings = {
				baseUrl: ".",
				paths: { "@api": ["src/api/index.ts"] },
			};
			
			const result = resolvePathAlias("@api", simpleDir, files, mappings);
			expect(result).toBe(join(simpleDir, "src", "api", "index.ts"));
		});

		it("resolves path alias to index file in directory", () => {
			const simpleDir = join(FIXTURES_DIR, "simple");
			// Create directory with only index file (not utils.ts itself)
			const files = new Set([
				join(simpleDir, "src", "api", "utils", "index.ts")
			]);
			const mappings = {
				baseUrl: ".",
				paths: { "@api/*": ["src/api/*"] },
			};
			
			const result = resolvePathAlias("@api/utils", simpleDir, files, mappings);
			expect(result).toBe(join(simpleDir, "src", "api", "utils", "index.ts"));
		});

		it("handles baseUrl other than '.'", () => {
			const baseUrlDir = join(FIXTURES_DIR, "baseurl");
			// File is at baseUrlDir/src/api/routes.ts
			// baseUrl is "src", so path "@api/*" maps to "api/*" relative to baseUrl
			const files = new Set([
				join(baseUrlDir, "src", "api", "routes.ts")
			]);
			const mappings = {
				baseUrl: "src",
				paths: { "@api/*": ["api/*"] },
			};
			
			const result = resolvePathAlias("@api/routes", baseUrlDir, files, mappings);
			expect(result).toBe(join(baseUrlDir, "src", "api", "routes.ts"));
		});
	});
});
