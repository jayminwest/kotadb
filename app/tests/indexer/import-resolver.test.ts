/**
 * Import resolver unit tests.
 *
 * Tests relative import path resolution with TypeScript/Node.js rules.
 * Uses real fixture data (no mocks) following antimocking philosophy.
 */

import { describe, it, expect } from "bun:test";
import {
	resolveImport,
	resolveExtensions,
	handleIndexFiles,
} from "@indexer/import-resolver";
import type { IndexedFile } from "@shared/types/entities";

describe("import-resolver", () => {
	describe("resolveImport", () => {
		it("resolves relative import with explicit extension", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/foo.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
				{ path: "/repo/src/bar.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("./foo.ts", "/repo/src/bar.ts", files);
			expect(result).toBe("/repo/src/foo.ts");
		});

		it("resolves relative import without extension", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/utils.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
				{ path: "/repo/src/index.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("./utils", "/repo/src/index.ts", files);
			expect(result).toBe("/repo/src/utils.ts");
		});

		it("resolves parent directory import", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/utils/logger.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
				{ path: "/repo/src/api/routes.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("../utils/logger", "/repo/src/api/routes.ts", files);
			expect(result).toBe("/repo/src/utils/logger.ts");
		});

		it("resolves directory import to index file", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/api/index.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
				{ path: "/repo/src/main.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("./api", "/repo/src/main.ts", files);
			expect(result).toBe("/repo/src/api/index.ts");
		});

		it("prefers .ts over .js when both exist", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/utils.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
				{ path: "/repo/src/utils.js", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
				{ path: "/repo/src/index.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("./utils", "/repo/src/index.ts", files);
			expect(result).toBe("/repo/src/utils.ts");
		});

		it("returns null for non-relative imports (node_modules)", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/index.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("lodash", "/repo/src/index.ts", files);
			expect(result).toBeNull();
		});

		it("returns null for absolute imports", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/index.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("/absolute/path", "/repo/src/index.ts", files);
			expect(result).toBeNull();
		});

		it("returns null when file does not exist", () => {
			const files: IndexedFile[] = [
				{ path: "/repo/src/index.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
			];

			const result = resolveImport("./missing", "/repo/src/index.ts", files);
			expect(result).toBeNull();
		});
	});

	describe("resolveExtensions", () => {
		it("finds .ts file", () => {
			const filePaths = new Set(["/repo/src/utils.ts"]);
			const result = resolveExtensions("/repo/src/utils", filePaths);
			expect(result).toBe("/repo/src/utils.ts");
		});

		it("finds .tsx file", () => {
			const filePaths = new Set(["/repo/src/Component.tsx"]);
			const result = resolveExtensions("/repo/src/Component", filePaths);
			expect(result).toBe("/repo/src/Component.tsx");
		});

		it("finds .js file when .ts not available", () => {
			const filePaths = new Set(["/repo/src/utils.js"]);
			const result = resolveExtensions("/repo/src/utils", filePaths);
			expect(result).toBe("/repo/src/utils.js");
		});

		it("returns null when no extension matches", () => {
			const filePaths = new Set(["/repo/src/other.py"]);
			const result = resolveExtensions("/repo/src/utils", filePaths);
			expect(result).toBeNull();
		});
	});

	describe("handleIndexFiles", () => {
		it("finds index.ts", () => {
			const filePaths = new Set(["/repo/src/api/index.ts"]);
			const result = handleIndexFiles("/repo/src/api", filePaths);
			expect(result).toBe("/repo/src/api/index.ts");
		});

		it("finds index.js when index.ts not available", () => {
			const filePaths = new Set(["/repo/src/api/index.js"]);
			const result = handleIndexFiles("/repo/src/api", filePaths);
			expect(result).toBe("/repo/src/api/index.js");
		});

		it("returns null when no index file exists", () => {
			const filePaths = new Set(["/repo/src/api/routes.ts"]);
			const result = handleIndexFiles("/repo/src/api", filePaths);
			expect(result).toBeNull();
		});
	});
});
