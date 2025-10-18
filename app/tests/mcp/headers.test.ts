import { describe, expect, test } from "bun:test";
import {
	parseAccept,
	validateOrigin,
	validateProtocolVersion,
} from "@mcp/headers";

describe("MCP Header Validation", () => {
	describe("validateOrigin", () => {
		test("accepts valid localhost origins", () => {
			expect(validateOrigin("http://localhost")).toBe(true);
			expect(validateOrigin("https://localhost")).toBe(true);
			expect(validateOrigin("http://127.0.0.1")).toBe(true);
			expect(validateOrigin("https://127.0.0.1")).toBe(true);
		});

		test("accepts localhost with ports", () => {
			expect(validateOrigin("http://localhost:3000")).toBe(true);
			expect(validateOrigin("https://localhost:8080")).toBe(true);
			expect(validateOrigin("http://127.0.0.1:3000")).toBe(true);
			expect(validateOrigin("https://127.0.0.1:8443")).toBe(true);
		});

		test("rejects null origin", () => {
			expect(validateOrigin(null)).toBe(false);
		});

		test("rejects non-localhost origins", () => {
			expect(validateOrigin("http://example.com")).toBe(false);
			expect(validateOrigin("https://evil.com")).toBe(false);
			expect(validateOrigin("http://192.168.1.1")).toBe(false);
		});

		test("rejects malformed origins", () => {
			expect(validateOrigin("not-a-url")).toBe(false);
			expect(validateOrigin("")).toBe(false);
		});
	});

	describe("validateProtocolVersion", () => {
		test("accepts valid MCP protocol version", () => {
			expect(validateProtocolVersion("2025-06-18")).toBe(true);
		});

		test("rejects null version", () => {
			expect(validateProtocolVersion(null)).toBe(false);
		});

		test("rejects invalid versions", () => {
			expect(validateProtocolVersion("2024-01-01")).toBe(false);
			expect(validateProtocolVersion("1.0")).toBe(false);
			expect(validateProtocolVersion("")).toBe(false);
			expect(validateProtocolVersion("invalid")).toBe(false);
		});
	});

	describe("parseAccept", () => {
		test("detects JSON accept header", () => {
			expect(parseAccept("application/json")).toEqual({
				json: true,
				sse: false,
			});
		});

		test("detects SSE accept header", () => {
			expect(parseAccept("text/event-stream")).toEqual({
				json: false,
				sse: true,
			});
		});

		test("detects multiple accept types", () => {
			expect(parseAccept("application/json, text/event-stream")).toEqual({
				json: true,
				sse: true,
			});
		});

		test("handles wildcard accept", () => {
			expect(parseAccept("*/*")).toEqual({ json: true, sse: false });
		});

		test("handles case-insensitive headers", () => {
			expect(parseAccept("APPLICATION/JSON")).toEqual({
				json: true,
				sse: false,
			});
			expect(parseAccept("Text/Event-Stream")).toEqual({
				json: false,
				sse: true,
			});
		});

		test("returns false for null accept", () => {
			expect(parseAccept(null)).toEqual({ json: false, sse: false });
		});

		test("returns false for empty accept", () => {
			expect(parseAccept("")).toEqual({ json: false, sse: false });
		});

		test("returns false for unknown types", () => {
			expect(parseAccept("text/html")).toEqual({ json: false, sse: false });
		});
	});
});
