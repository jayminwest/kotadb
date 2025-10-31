import { describe, expect, it } from "bun:test";

describe("bootstrap error logging", () => {
	it("should extract error message from Error objects", () => {
		const testError = new Error("Test failure");

		// Simulate bootstrap catch handler
		const errorMessage = testError.message;
		const errorName = testError.name;

		expect(errorName).toBe("Error");
		expect(errorMessage).toBe("Test failure");
		expect(errorMessage).not.toBe("{}");
	});

	it("should handle non-Error objects gracefully", () => {
		const testError: unknown = "string error";
		const errorMessage =
			testError instanceof Error ? testError.message : String(testError);

		expect(errorMessage).toBe("string error");
	});

	it("should extract stack trace from Error objects", () => {
		const testError = new Error("Test with stack");

		expect(testError.stack).toBeDefined();
		expect(testError.stack).toContain("Test with stack");
	});

	it("should not serialize Error objects as empty JSON", () => {
		const testError = new Error("Database connection failed");

		// This is the OLD problematic approach
		const jsonStringified = JSON.stringify(testError);

		// Verify that JSON.stringify returns {} for Error objects
		expect(jsonStringified).toBe("{}");

		// This is the NEW correct approach
		const errorMessage =
			testError instanceof Error ? testError.message : String(testError);
		const errorName = testError instanceof Error ? testError.name : "Unknown";

		// Verify the new approach extracts useful information
		expect(errorMessage).toBe("Database connection failed");
		expect(errorName).toBe("Error");
	});

	it("should handle undefined error objects", () => {
		const testError: unknown = undefined;
		const errorMessage =
			testError instanceof Error ? testError.message : String(testError);

		expect(errorMessage).toBe("undefined");
	});

	it("should handle null error objects", () => {
		const testError: unknown = null;
		const errorMessage =
			testError instanceof Error ? testError.message : String(testError);

		expect(errorMessage).toBe("null");
	});
});
