import { authenticateRequest } from "@auth/middleware";
import type { RateLimitResult } from "@shared/types/rate-limit";
import { buildSnippet } from "@indexer/extractors";
import { createMcpServer, createMcpTransport } from "@mcp/server";
import type { AuthContext, IndexRequest } from "@shared/types";
import type { ValidationRequest } from "@shared/types/validation";
import { validateOutput } from "@validation/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import cors from "cors";
import express, {
	type Express,
	type Request,
	type Response,
	type NextFunction,
} from "express";
import {
	ensureRepository,
	listRecentFiles,
	recordIndexRun,
	runIndexingWorkflow,
	searchFiles,
	updateIndexRunStatus,
} from "./queries";

/**
 * Extended Express Request with auth context attached
 */
interface AuthenticatedRequest extends Request {
	authContext?: AuthContext;
}

export function createExpressApp(supabase: SupabaseClient): Express {
	const app = express();

	// CORS middleware - allow requests from web app
	app.use(cors({
		origin: true, // Allow all origins in development
		credentials: true,
	}));

	// Body parser middleware
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

	// Health check endpoint (public, no auth)
	app.get("/health", (req: Request, res: Response) => {
		res.json({ status: "ok", timestamp: new Date().toISOString() });
	});

	// Authentication middleware for all other routes
	app.use(
		async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			// Skip auth for health check
			if (req.path === "/health") {
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
		},
	);

	// Authenticated routes below

	// POST /index - Index a repository
	app.post("/index", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const payload = req.body as Partial<IndexRequest>;

		if (!payload?.repository) {
			return res.status(400).json({ error: "Field 'repository' is required" });
		}

		const indexRequest: IndexRequest = {
			repository: payload.repository,
			ref: payload.ref,
			localPath: payload.localPath,
		};

		try {
			const repositoryId = await ensureRepository(
				supabase,
				context.userId,
				indexRequest,
			);
			const runId = await recordIndexRun(
				supabase,
				indexRequest,
				context.userId,
				repositoryId,
			);

			queueMicrotask(() =>
				runIndexingWorkflow(
					supabase,
					indexRequest,
					runId,
					context.userId,
					repositoryId,
				).catch((error) => {
					console.error("Indexing workflow failed", error);
					updateIndexRunStatus(supabase, runId, "failed", error.message).catch(
						console.error,
					);
				}),
			);

			addRateLimitHeaders(res, context.rateLimit);
			res.status(202).json({ runId });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			res.status(500).json({
				error: `Failed to start indexing: ${(error as Error).message}`,
			});
		}
	});

	// GET /search - Search indexed files
	app.get("/search", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const term = req.query.term as string;

		if (!term) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Missing term query parameter" });
		}

		const repositoryId = req.query.repository as string | undefined;
		const limit = req.query.limit ? Number(req.query.limit) : undefined;

		try {
			const results = await searchFiles(supabase, term, context.userId, {
				repositoryId,
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
			res
				.status(500)
				.json({ error: `Search failed: ${(error as Error).message}` });
		}
	});

	// GET /files/recent - List recently indexed files
	app.get("/files/recent", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const limit = Number(req.query.limit ?? "10");

		try {
			const results = await listRecentFiles(supabase, limit, context.userId);
			addRateLimitHeaders(res, context.rateLimit);
			res.json({ results });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			res
				.status(500)
				.json({ error: `Failed to list files: ${(error as Error).message}` });
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

		try {
			// Set rate limit headers BEFORE transport handles request
			addRateLimitHeaders(res, context.rateLimit);

			// Create per-request MCP server for user isolation
			const server = createMcpServer({
				supabase,
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
				console.error("MCP handler error:", error);
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

	// 404 handler
	app.use((req: Request, res: Response) => {
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
