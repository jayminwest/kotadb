/**
 * Integration tests for request logging middleware
 * 
 * Note: All log levels output to stderr to keep stdout clean for JSON output.
 * This is intentional - see issue #117.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import express from "express";
import type { Express, Request, Response } from "express";
import { requestLoggingMiddleware, errorLoggingMiddleware } from "@logging/middleware";
import type { LogEntry } from "@logging/logger";

describe("Request logging middleware", () => {
	let app: Express;
	let stderrSpy: ReturnType<typeof mock>;
	let originalLogLevel: string | undefined;

	beforeEach(() => {
		// Create Express app
		app = express();

		// Capture stderr (all logs go to stderr now)
		stderrSpy = mock(() => {});
		process.stderr.write = stderrSpy;

		// Save original log level
		originalLogLevel = process.env.LOG_LEVEL;
		process.env.LOG_LEVEL = "info";
	});

	afterEach(() => {
		// Restore log level
		if (originalLogLevel === undefined) {
			delete process.env.LOG_LEVEL;
		} else {
			process.env.LOG_LEVEL = originalLogLevel;
		}
	});

	describe("Request ID generation", () => {
		it("should generate unique request_id for each request", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				res.json({ requestId: req.requestId });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				const response1 = await fetch(`http://localhost:${port}/test`);
				const data1 = (await response1.json()) as { requestId: string };

				const response2 = await fetch(`http://localhost:${port}/test`);
				const data2 = (await response2.json()) as { requestId: string };

				expect(data1.requestId).not.toBe(data2.requestId);
				expect(data1.requestId.length).toBeGreaterThan(0);
				expect(data2.requestId.length).toBeGreaterThan(0);
			} finally {
				server.close();
			}
		});

		it("should attach request_id to logger context", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				res.json({ ok: true });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/test`);

				// Check that logs contain request_id (all logs go to stderr)
				const logs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.message.includes("Incoming request"));

				expect(logs.length).toBeGreaterThan(0);
				expect(logs[0]?.context?.request_id).toBeDefined();
				expect(typeof logs[0]?.context?.request_id).toBe("string");
			} finally {
				server.close();
			}
		});
	});

	describe("Request logging", () => {
		it("should log incoming request with method and URL", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/api/test", (req: Request, res: Response) => {
				res.json({ ok: true });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/api/test`);

				const logs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.message === "Incoming request");

				expect(logs.length).toBeGreaterThan(0);
				expect(logs[0]?.context?.method).toBe("GET");
				expect(logs[0]?.context?.url).toContain("/api/test");
			} finally {
				server.close();
			}
		});

		it("should log request completion with status and duration", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				res.status(200).json({ ok: true });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/test`);

				const logs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.message === "Request completed");

				expect(logs.length).toBeGreaterThan(0);
				expect(logs[0]?.context?.status).toBe(200);
				expect(logs[0]?.context?.duration_ms).toBeGreaterThanOrEqual(0);
			} finally {
				server.close();
			}
		});

		it("should log warning for 4xx responses", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				res.status(404).json({ error: "Not found" });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/test`);

				const logs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.level === "warn" && log.message.includes("Request completed"));

				expect(logs.length).toBeGreaterThan(0);
				expect(logs[0]?.context?.status).toBe(404);
			} finally {
				server.close();
			}
		});

		it("should log warning for 5xx responses", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				res.status(500).json({ error: "Internal error" });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/test`);

				const logs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.level === "warn" && log.message.includes("Request completed"));

				expect(logs.length).toBeGreaterThan(0);
				expect(logs[0]?.context?.status).toBe(500);
			} finally {
				server.close();
			}
		});
	});

	describe("Logger attachment", () => {
		it("should attach logger to req.logger", async () => {
			let loggerAttached = false;

			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				loggerAttached = req.logger !== undefined;
				res.json({ ok: true });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/test`);
				expect(loggerAttached).toBe(true);
			} finally {
				server.close();
			}
		});

		it("should allow handlers to use req.logger for custom logs", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				req.logger.info("Custom handler log", { customField: "test" });
				res.json({ ok: true });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/test`);

				const logs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.message === "Custom handler log");

				expect(logs.length).toBeGreaterThan(0);
				expect(logs[0]?.context?.customField).toBe("test");
				expect(logs[0]?.context?.request_id).toBeDefined();
			} finally {
				server.close();
			}
		});
	});

	describe("Error logging", () => {
		it("should log errors with stack traces", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/test", (req: Request, res: Response) => {
				throw new Error("Test error");
			});
			app.use(errorLoggingMiddleware);
			app.use((err: Error, req: Request, res: Response, next: unknown) => {
				res.status(500).json({ error: err.message });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/test`);

				const errorLogs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.level === "error");

				expect(errorLogs.length).toBeGreaterThan(0);
				expect(errorLogs[0]?.error?.message).toBe("Test error");
				expect(errorLogs[0]?.error?.stack).toBeDefined();
			} finally {
				server.close();
			}
		});

		it("should include request context in error logs", async () => {
			app.use(requestLoggingMiddleware);
			app.get("/api/fail", (req: Request, res: Response) => {
				throw new Error("Test error");
			});
			app.use(errorLoggingMiddleware);
			app.use((err: Error, req: Request, res: Response, next: unknown) => {
				res.status(500).json({ error: err.message });
			});

			const server = app.listen(0);
			const port = (server.address() as { port: number }).port;

			try {
				await fetch(`http://localhost:${port}/api/fail`);

				const errorLogs = stderrSpy.mock.calls
					.map((call) => JSON.parse(call[0] as string) as LogEntry)
					.filter((log) => log.level === "error");

				expect(errorLogs.length).toBeGreaterThan(0);
				expect(errorLogs[0]?.context?.request_id).toBeDefined();
				expect(errorLogs[0]?.context?.method).toBe("GET");
				expect(errorLogs[0]?.context?.url).toContain("/api/fail");
			} finally {
				server.close();
			}
		});
	});
});
