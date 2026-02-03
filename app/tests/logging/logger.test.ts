/**
 * Unit tests for structured logger
 * 
 * Note: All log levels output to stderr to keep stdout clean for JSON output.
 * This is intentional - see issue #117.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createLogger } from "@logging/logger";
import type { LogEntry } from "@logging/logger";

describe("Logger", () => {
	let stderrSpy: ReturnType<typeof mock>;
	let originalLogLevel: string | undefined;

	beforeEach(() => {
		// Capture stderr (all logs go to stderr)
		stderrSpy = mock(() => {});
		process.stderr.write = stderrSpy;

		// Save original log level
		originalLogLevel = process.env.LOG_LEVEL;
	});

	afterEach(() => {
		// Restore log level
		if (originalLogLevel === undefined) {
			delete process.env.LOG_LEVEL;
		} else {
			process.env.LOG_LEVEL = originalLogLevel;
		}
	});

	describe("JSON output", () => {
		it("should output valid JSON for info logs", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test message");

			expect(stderrSpy).toHaveBeenCalledTimes(1);
			const output = stderrSpy.mock.calls[0]?.[0];
			expect(typeof output).toBe("string");

			// Parse JSON to verify it's valid
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.level).toBe("info");
			expect(parsed.message).toBe("test message");
			expect(parsed.timestamp).toBeDefined();
			expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
		});

		it("should output valid JSON for error logs", () => {
			process.env.LOG_LEVEL = "error";
			const logger = createLogger();

			logger.error("error message");

			expect(stderrSpy).toHaveBeenCalledTimes(1);
			const output = stderrSpy.mock.calls[0]?.[0];
			expect(typeof output).toBe("string");

			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.level).toBe("error");
			expect(parsed.message).toBe("error message");
		});
	});

	describe("Log levels", () => {
		it("should respect LOG_LEVEL=debug and show all logs", () => {
			process.env.LOG_LEVEL = "debug";
			const logger = createLogger();

			logger.debug("debug");
			logger.info("info");
			logger.warn("warn");
			logger.error("error");

			// All logs go to stderr now
			expect(stderrSpy).toHaveBeenCalledTimes(4);
		});

		it("should respect LOG_LEVEL=info and filter debug logs", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.debug("debug");
			logger.info("info");
			logger.warn("warn");
			logger.error("error");

			// info, warn, error (debug filtered)
			expect(stderrSpy).toHaveBeenCalledTimes(3);
		});

		it("should respect LOG_LEVEL=warn and filter debug/info logs", () => {
			process.env.LOG_LEVEL = "warn";
			const logger = createLogger();

			logger.debug("debug");
			logger.info("info");
			logger.warn("warn");
			logger.error("error");

			// warn, error (debug, info filtered)
			expect(stderrSpy).toHaveBeenCalledTimes(2);
		});

		it("should respect LOG_LEVEL=error and only show errors", () => {
			process.env.LOG_LEVEL = "error";
			const logger = createLogger();

			logger.debug("debug");
			logger.info("info");
			logger.warn("warn");
			logger.error("error");

			// error only
			expect(stderrSpy).toHaveBeenCalledTimes(1);
		});

		it("should default to info level when LOG_LEVEL is not set", () => {
			delete process.env.LOG_LEVEL;
			const logger = createLogger();

			logger.debug("debug");
			logger.info("info");

			// info only (debug filtered)
			expect(stderrSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("Correlation context", () => {
		it("should include base context in all logs", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger({ request_id: "req-123", user_id: "user-456" });

			logger.info("test");

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.request_id).toBe("req-123");
			expect(parsed.context?.user_id).toBe("user-456");
		});

		it("should merge additional context with base context", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger({ request_id: "req-123" });

			logger.info("test", { job_id: "job-789" });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.request_id).toBe("req-123");
			expect(parsed.context?.job_id).toBe("job-789");
		});

		it("should omit context field when no context is provided", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test");

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context).toBeUndefined();
		});
	});

	describe("Sensitive data masking", () => {
		it("should mask API keys in context", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test", { apiKey: "secret123" });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.apiKey).toBe("[REDACTED]");
		});

		it("should mask tokens in context", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test", { token: "secret-token", access_token: "bearer-token" });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.token).toBe("[REDACTED]");
			expect(parsed.context?.access_token).toBe("[REDACTED]");
		});

		it("should mask passwords in context", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test", { password: "secret123", user_password: "pass123" });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.password).toBe("[REDACTED]");
			expect(parsed.context?.user_password).toBe("[REDACTED]");
		});

		it("should mask sensitive keys case-insensitively", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test", { ApiKey: "secret", API_TOKEN: "token" });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.ApiKey).toBe("[REDACTED]");
			expect(parsed.context?.API_TOKEN).toBe("[REDACTED]");
		});

		it("should mask sensitive data in nested objects", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test", {
				user: {
					id: "user-123",
					apiKey: "secret123",
				},
			});

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			const user = parsed.context?.user as { id: string; apiKey: string } | undefined;
			expect(user?.id).toBe("user-123");
			expect(user?.apiKey).toBe("[REDACTED]");
		});

		it("should not mask non-sensitive keys", () => {
			process.env.LOG_LEVEL = "info";
			const logger = createLogger();

			logger.info("test", { userId: "user-123", requestId: "req-456" });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.userId).toBe("user-123");
			expect(parsed.context?.requestId).toBe("req-456");
		});
	});

	describe("Error logging", () => {
		it("should include error object with stack trace", () => {
			process.env.LOG_LEVEL = "error";
			const logger = createLogger();
			const error = new Error("test error");

			logger.error("operation failed", error);

			expect(stderrSpy).toHaveBeenCalledTimes(1);
			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.error?.message).toBe("test error");
			expect(parsed.error?.stack).toBeDefined();
			expect(parsed.error?.stack).toContain("test error");
		});

		it("should include error code if present", () => {
			process.env.LOG_LEVEL = "error";
			const logger = createLogger();
			const error = new Error("test error") as Error & { code: string };
			error.code = "ECONNREFUSED";

			logger.error("connection failed", error);

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.error?.code).toBe("ECONNREFUSED");
		});

		it("should support error with additional context", () => {
			process.env.LOG_LEVEL = "error";
			const logger = createLogger({ request_id: "req-123" });
			const error = new Error("test error");

			logger.error("operation failed", error, { attempt: 3 });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.error?.message).toBe("test error");
			expect(parsed.context?.request_id).toBe("req-123");
			expect(parsed.context?.attempt).toBe(3);
		});

		it("should support error logging without Error object", () => {
			process.env.LOG_LEVEL = "error";
			const logger = createLogger();

			logger.error("operation failed", { reason: "timeout" });

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.error).toBeUndefined();
			expect(parsed.context?.reason).toBe("timeout");
		});
	});

	describe("Child loggers", () => {
		it("should create child logger with extended context", () => {
			process.env.LOG_LEVEL = "info";
			const parent = createLogger({ request_id: "req-123" });
			const child = parent.child({ job_id: "job-789" });

			child.info("test");

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.request_id).toBe("req-123");
			expect(parsed.context?.job_id).toBe("job-789");
		});

		it("should not affect parent logger context", () => {
			process.env.LOG_LEVEL = "info";
			const parent = createLogger({ request_id: "req-123" });
			const child = parent.child({ job_id: "job-789" });

			parent.info("parent");
			child.info("child");

			const parentOutput = stderrSpy.mock.calls[0]?.[0];
			const parentParsed = JSON.parse(parentOutput as string) as LogEntry;
			expect(parentParsed.context?.request_id).toBe("req-123");
			expect(parentParsed.context?.job_id).toBeUndefined();

			const childOutput = stderrSpy.mock.calls[1]?.[0];
			const childParsed = JSON.parse(childOutput as string) as LogEntry;
			expect(childParsed.context?.request_id).toBe("req-123");
			expect(childParsed.context?.job_id).toBe("job-789");
		});

		it("should support nested child loggers", () => {
			process.env.LOG_LEVEL = "info";
			const parent = createLogger({ request_id: "req-123" });
			const child1 = parent.child({ job_id: "job-789" });
			const child2 = child1.child({ task_id: "task-456" });

			child2.info("test");

			const output = stderrSpy.mock.calls[0]?.[0];
			const parsed = JSON.parse(output as string) as LogEntry;
			expect(parsed.context?.request_id).toBe("req-123");
			expect(parsed.context?.job_id).toBe("job-789");
			expect(parsed.context?.task_id).toBe("task-456");
		});
	});
});
