import { describe, test, expect } from "bun:test";
import { resolveImport, resolveExtensions, handleIndexFiles } from "../src/analysis/import-resolver.js";

/**
 * Import Resolver Tests
 *
 * Tests import path resolution logic.
 */

describe("resolveImport", () => {
	test("resolves relative import with extension", () => {
		const files = [
			{ id: "1", path: "/repo/src/utils.ts" },
			{ id: "2", path: "/repo/src/api/routes.ts" },
		];

		const resolved = resolveImport("../utils.ts", "/repo/src/api/routes.ts", files);

		expect(resolved).toBe("/repo/src/utils.ts");
	});

	test("resolves relative import without extension", () => {
		const files = [
			{ id: "1", path: "/repo/src/utils.ts" },
			{ id: "2", path: "/repo/src/api/routes.ts" },
		];

		const resolved = resolveImport("../utils", "/repo/src/api/routes.ts", files);

		expect(resolved).toBe("/repo/src/utils.ts");
	});

	test("resolves directory import to index file", () => {
		const files = [
			{ id: "1", path: "/repo/src/api/index.ts" },
			{ id: "2", path: "/repo/src/main.ts" },
		];

		const resolved = resolveImport("./api", "/repo/src/main.ts", files);

		expect(resolved).toBe("/repo/src/api/index.ts");
	});

	test("returns null for non-relative imports", () => {
		const files = [
			{ id: "1", path: "/repo/src/utils.ts" },
		];

		const resolved = resolveImport("react", "/repo/src/main.ts", files);

		expect(resolved).toBeNull();
	});

	test("returns null for missing files", () => {
		const files = [
			{ id: "1", path: "/repo/src/utils.ts" },
		];

		const resolved = resolveImport("./missing", "/repo/src/main.ts", files);

		expect(resolved).toBeNull();
	});
});

describe("resolveExtensions", () => {
	test("finds TypeScript extension", () => {
		const filePaths = new Set(["/repo/src/utils.ts"]);
		const resolved = resolveExtensions("/repo/src/utils", filePaths);

		expect(resolved).toBe("/repo/src/utils.ts");
	});

	test("prefers TypeScript over JavaScript", () => {
		const filePaths = new Set(["/repo/src/utils.ts", "/repo/src/utils.js"]);
		const resolved = resolveExtensions("/repo/src/utils", filePaths);

		expect(resolved).toBe("/repo/src/utils.ts");
	});

	test("returns null if no extension matches", () => {
		const filePaths = new Set(["/repo/src/other.ts"]);
		const resolved = resolveExtensions("/repo/src/utils", filePaths);

		expect(resolved).toBeNull();
	});
});

describe("handleIndexFiles", () => {
	test("finds index.ts file", () => {
		const filePaths = new Set(["/repo/src/api/index.ts"]);
		const resolved = handleIndexFiles("/repo/src/api", filePaths);

		expect(resolved).toBe("/repo/src/api/index.ts");
	});

	test("prefers index.ts over index.js", () => {
		const filePaths = new Set(["/repo/src/api/index.ts", "/repo/src/api/index.js"]);
		const resolved = handleIndexFiles("/repo/src/api", filePaths);

		expect(resolved).toBe("/repo/src/api/index.ts");
	});

	test("returns null if no index file exists", () => {
		const filePaths = new Set(["/repo/src/api/routes.ts"]);
		const resolved = handleIndexFiles("/repo/src/api", filePaths);

		expect(resolved).toBeNull();
	});
});
