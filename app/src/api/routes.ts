import type { RateLimitResult } from "@app-types/rate-limit";
import { authenticateRequest } from "@auth/middleware";
import { buildSnippet } from "@indexer/extractors";
import { createLogger } from "@logging/logger.js";
import { createMcpServer, createMcpTransport } from "@mcp/server";
import type { AuthContext } from "@shared/types";
import type { ValidationRequest } from "@shared/types/validation";
import { validateOutput } from "@validation/schemas";
import cors from "cors";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { Sentry } from "../instrument.js";

const logger = createLogger({ module: "api-routes" });
import { errorLoggingMiddleware, requestLoggingMiddleware } from "@logging/middleware";
import { expressErrorHandler } from "../instrument.js";
import { listRecentFiles, searchFiles } from "./queries";
import { buildOpenAPISpec } from "./openapi/builder.js";
import { isLocalMode } from "@config/environment";

/**
 * Extended Express Request with auth context attached
 */
interface AuthenticatedRequest extends Request {
	authContext?: AuthContext;
}

/**
 * Cached API version from package.json
 */
let apiVersion: string | null = null;

/**
 * Extract version from package.json
 * Cached at module load to avoid repeated file reads
 */
async function loadApiVersion(): Promise<string> {
	if (apiVersion !== null) {
		return apiVersion;
	}

	try {
		// Dynamic import with path relative to this file
		const pkg = await import("../../package.json", { with: { type: "json" } });
		apiVersion = pkg.default?.version || pkg.version || "unknown";
		return apiVersion;
	} catch (error) {
		logger.warn("Failed to load API version from package.json", { error });
		apiVersion = "unknown";
		return apiVersion;
	}
}

// Load version at module initialization
loadApiVersion().catch(() => {
	// Silently fail - version will default to "unknown"
});

export function createExpressApp(): Express {
	const app = express();

	// Request logging middleware (before all other middleware)
	app.use(requestLoggingMiddleware);

	// CORS middleware - allow requests from web app
	app.use(
		cors({
			origin: true, // Allow all origins in development
			credentials: true,
		}),
	);

	// Health check endpoint (public, no auth)
	app.get("/health", async (_req: Request, res: Response) => {
		const mode = isLocalMode() ? "local" : "cloud";
		
		// In local-only mode, queue is not available
		res.json({
			status: "ok",
			version: apiVersion || "unknown",
			timestamp: new Date().toISOString(),
			mode,
			queue: null,
		});
	});

	// Body parser middleware for other routes
	app.use(express.json());

	// JSON parse error handler
	app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
		if (err instanceof SyntaxError && "body" in err) {
			return res.status(400).json({
				jsonrpc: "2.0",
				error: {
					code: -32700,
					message: "Parse error",
				},
				id: null,
			});
		}
		next(err);
	});

	// Authentication middleware for all other routes
	app.use(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
		// Skip auth for health check and OpenAPI spec
		if (req.path === "/health" || req.path === "/openapi.json") {
			return next();
		}

		// Convert Express Request to Bun Request for authentication
		const host = req.get("host") || "localhost";
		const url = `${req.protocol}://${host}${req.originalUrl}`;
		const headers = new Headers();
		for (const [key, value] of Object.entries(req.headers)) {
			if (value) {
				const headerValue = Array.isArray(value) ? value[0] : value;
				if (headerValue) {
					headers.set(key, headerValue);
				}
			}
		}

		const bunRequest = new Request(url, {
			method: req.method,
			headers,
		});

		const { context, response } = await authenticateRequest(bunRequest);

		if (response) {
			// Authentication failed
			const body = await response.text();
			const parsed = JSON.parse(body);
			return res.status(response.status).json(parsed);
		}

		// Attach context to request
		req.authContext = context;
		next();
	});

	// Authenticated routes below

	// GET /search - Search indexed files
	app.get("/search", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const term = req.query.term as string;

		if (!term) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Missing term query parameter" });
		}

		const repositoryId = req.query.repository as string | undefined;
		const projectId = req.query.project_id as string | undefined;
		const limit = req.query.limit ? Number(req.query.limit) : undefined;

		try {
			const results = searchFiles(term, {
				repositoryId,
				projectId,
				limit,
			});

			const resultsWithSnippets = results.map((row) => ({
				...row,
				snippet: buildSnippet(row.content, term),
			}));

			addRateLimitHeaders(res, context.rateLimit);
			res.json({ results: resultsWithSnippets });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			res.status(500).json({ error: `Search failed: ${(error as Error).message}` });
		}
	});

	// GET /files/recent - List recently indexed files
	app.get("/files/recent", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const limit = Number(req.query.limit ?? "10");

		try {
			const results = listRecentFiles(limit);
			addRateLimitHeaders(res, context.rateLimit);
			res.json({ results });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			res.status(500).json({ error: `Failed to list files: ${(error as Error).message}` });
		}
	});

	// POST /validate-output - Validate command output against schema
	app.post("/validate-output", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const payload = req.body as Partial<ValidationRequest>;

		if (!payload?.schema) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Field 'schema' is required" });
		}

		if (!payload?.output) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Field 'output' is required" });
		}

		try {
			const result = validateOutput(payload.schema, payload.output);
			addRateLimitHeaders(res, context.rateLimit);
			res.json(result);
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			res.status(500).json({ error: `Validation failed: ${(error as Error).message}` });
		}
	});

	// POST /mcp - MCP endpoint with SDK transport
	app.post("/mcp", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;

		// MCP endpoint works in local mode with SQLite
		// Query functions use SQLite via isLocalMode() checks
		
		// Log Accept header for debugging 406 errors (SDK requires both json AND sse)
		const acceptHeader = req.get("Accept") || req.get("accept");
		const hasJson =
			acceptHeader?.toLowerCase().includes("application/json") || acceptHeader?.includes("*/*");
		const hasSse = acceptHeader?.toLowerCase().includes("text/event-stream");

		if (!hasJson || !hasSse) {
			logger.warn("MCP Accept header validation may fail", {
				userId: context.userId,
				acceptHeader: acceptHeader || "not-provided",
				hasJson: !!hasJson,
				hasSse: !!hasSse,
				hint: "Client must accept both application/json AND text/event-stream",
			});
		}

		try {
			// Set rate limit headers BEFORE transport handles request
			addRateLimitHeaders(res, context.rateLimit);

			// Create per-request MCP server for user isolation
			const server = createMcpServer({
				userId: context.userId,
			});

			// Create transport
			const transport = createMcpTransport();

			// Connect server to transport
			await server.connect(transport);

			// Register cleanup on response close
			res.on("close", () => {
				transport.close();
			});

			// Handle the request via SDK transport
			// The transport will send the response directly
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			// Only send error if headers haven't been sent yet
			if (!res.headersSent) {
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error("MCP handler error", err, {
					userId: context.userId,
				});
				Sentry.captureException(err);
				res.status(500).json({ error: "Internal server error" });
			}
		}
	});

	// GET /mcp - Simple health check (not SSE streaming)
	app.get("/mcp", (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		addRateLimitHeaders(res, context.rateLimit);
		// Return success to indicate MCP endpoint is available
		res.status(200).json({
			status: "ok",
			protocol: "mcp",
			version: "2024-11-05",
			transport: "http",
		});
	});

	// GET /openapi.json - OpenAPI 3.1 specification (public endpoint)
	app.get("/openapi.json", (_req: Request, res: Response) => {
		try {
			const spec = buildOpenAPISpec();
			
			// Set cache headers for better performance
			res.set("Cache-Control", "public, max-age=3600");
			res.set("Content-Type", "application/json");
			
			res.json(spec);
		} catch (error) {
			const err = error as Error;
			logger.error("Failed to generate OpenAPI spec", err);
			Sentry.captureException(err);
			res.status(500).json({ error: "Failed to generate OpenAPI specification" });
		}
	});

	// Sentry error handler middleware (captures errors for remote monitoring)
	// Must be placed after all routes but before custom error logging
	app.use(expressErrorHandler());

	// Error logging middleware (structured logs for local debugging)
	app.use(errorLoggingMiddleware);

	// 404 handler
	app.use((_req: Request, res: Response) => {
		res.status(404).json({ error: "Not found" });
	});

	return app;
}

/**
 * Add rate limit headers to Express response.
 * Injects X-RateLimit-* headers into the response.
 *
 * @param res - Express response object
 * @param rateLimit - Rate limit result (optional)
 */
function addRateLimitHeaders(res: Response, rateLimit?: RateLimitResult): void {
	if (!rateLimit) {
		return;
	}

	res.set("X-RateLimit-Limit", String(rateLimit.limit));
	res.set("X-RateLimit-Remaining", String(rateLimit.remaining));
	res.set("X-RateLimit-Reset", String(rateLimit.resetAt));
}
