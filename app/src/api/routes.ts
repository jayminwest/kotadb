import { authenticateRequest, requireAdmin } from "@auth/middleware";
import type { RateLimitResult } from "@app-types/rate-limit";
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
	runIndexingWorkflow,
	searchFiles,
} from "./queries";
import { createIndexJob, updateJobStatus, getJobStatus } from "../queue/job-tracker";
import {
	verifyWebhookSignature,
	parseWebhookPayload,
	logWebhookRequest,
} from "../github/webhook-handler";
import { processPushEvent } from "../github/webhook-processor";
import { getQueue, getDefaultSendOptions } from "@queue/client";
import { QUEUE_NAMES } from "@queue/config";
import type { IndexRepoJobPayload } from "@queue/types";
import {
	verifyWebhookSignature as verifyStripeSignature,
	handleCheckoutSessionCompleted,
	handleInvoicePaid,
	handleSubscriptionUpdated,
	handleSubscriptionDeleted,
} from "@api/webhooks";
import type Stripe from "stripe";
import { requestLoggingMiddleware, errorLoggingMiddleware } from "@logging/middleware";
import { expressErrorHandler } from "../instrument.js";

/**
 * Extended Express Request with auth context attached
 */
interface AuthenticatedRequest extends Request {
	authContext?: AuthContext;
}

export function createExpressApp(supabase: SupabaseClient): Express {
	const app = express();

	// Request logging middleware (before all other middleware)
	app.use(requestLoggingMiddleware);

	// CORS middleware - allow requests from web app
	app.use(cors({
		origin: true, // Allow all origins in development
		credentials: true,
	}));

	// Health check endpoint (public, no auth)
	app.get("/health", async (req: Request, res: Response) => {
		const queue = getQueue();

		try {
			// Query pg-boss for queue metrics
			const queueInfo = await queue.getQueue(QUEUE_NAMES.INDEX_REPO);
			const failedJobs = await queue.fetch(QUEUE_NAMES.INDEX_REPO, { includeMetadata: true });

			// Calculate failed jobs in last 24 hours
			const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
			const recentFailed = failedJobs.filter(j =>
				j.state === 'failed' && j.completedOn && new Date(j.completedOn) > twentyFourHoursAgo
			).length;

			// Calculate oldest pending job age (fetch created jobs)
			const pendingJobs = await queue.fetch(QUEUE_NAMES.INDEX_REPO, { includeMetadata: true });
			const oldestPending = pendingJobs
				.filter(j => j.state === 'created')
				.sort((a, b) => a.createdOn.getTime() - b.createdOn.getTime())[0];

			const oldestAge = oldestPending
				? Math.floor((Date.now() - oldestPending.createdOn.getTime()) / 1000)
				: 0;

			res.json({
				status: "ok",
				timestamp: new Date().toISOString(),
				queue: {
					depth: queueInfo?.queuedCount || 0,
					workers: 3, // WORKER_TEAM_SIZE from config
					failed_24h: recentFailed,
					oldest_pending_age_seconds: oldestAge
				}
			});
		} catch (error) {
			// If queue not available, return basic health status
			res.json({
				status: "ok",
				timestamp: new Date().toISOString(),
				queue: null
			});
		}
	});

	// GitHub webhook endpoint (public, signature-verified)
	// IMPORTANT: Registered BEFORE express.json() middleware to preserve raw body for HMAC verification
	app.post(
		"/webhooks/github",
		express.raw({ type: "application/json" }),
		async (req: Request, res: Response) => {
			try {
				// Extract webhook headers
				const signature = req.get("x-hub-signature-256");
				const event = req.get("x-github-event");
				const delivery = req.get("x-github-delivery") || "unknown";

				// Validate required headers
				if (!signature) {
					return res.status(401).json({ error: "Missing signature header" });
				}
				if (!event) {
					return res.status(400).json({ error: "Missing event type header" });
				}

				// Get webhook secret from environment
				const secret = process.env.GITHUB_WEBHOOK_SECRET;
				if (!secret) {
					process.stderr.write("[Webhook] GITHUB_WEBHOOK_SECRET not configured\n");
					return res.status(500).json({ error: "Webhook secret not configured" });
				}

				// Convert raw body to string for signature verification
				const rawBody = req.body.toString("utf-8");

				// Verify signature
				const isValid = verifyWebhookSignature(rawBody, signature, secret);
				if (!isValid) {
					process.stderr.write(`[Webhook] Invalid signature for delivery ${delivery}\n`);
					return res.status(401).json({ error: "Invalid signature" });
				}

				// Parse JSON body after signature verification
				let parsedBody: unknown;
				try {
					parsedBody = JSON.parse(rawBody);
				} catch (error) {
					return res.status(400).json({ error: "Invalid JSON payload" });
				}

				// Parse webhook payload (type-specific)
				const payload = parseWebhookPayload(parsedBody, event);

				// Log webhook request
				logWebhookRequest(event, delivery, payload);

				// Process push event asynchronously (don't block webhook response)
				if (payload) {
					processPushEvent(payload).catch((error) => {
						process.stderr.write(`[Webhook] Processing error: ${JSON.stringify(error)}\n`);
					});
				}

				// Always return success for valid webhooks (GitHub expects 200 OK)
				res.status(200).json({ received: true });
			} catch (error) {
				process.stderr.write(`[Webhook] Handler error: ${JSON.stringify(error)}\n`);
				res.status(500).json({ error: "Internal server error" });
			}
		},
	);

	// Stripe webhook endpoint (must be before express.json() to preserve raw body)
	app.post(
		"/webhooks/stripe",
		express.raw({ type: "application/json" }),
		async (req: Request, res: Response) => {
			try {
				// Extract Stripe webhook signature
				const signature = req.get("stripe-signature");

				// Validate signature header
				if (!signature) {
					return res.status(401).json({ error: "Missing signature header" });
				}

				// Get webhook secret from environment
				const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
				if (!webhookSecret) {
					process.stderr.write("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured\n");
					return res.status(500).json({ error: "Webhook secret not configured" });
				}

				// Convert raw body to string for signature verification
				const rawBody = req.body.toString("utf-8");

				// Verify signature and construct event
				let event: Stripe.Event;
				try {
					event = await verifyStripeSignature(rawBody, signature);
				} catch (error) {
					const err = error as Error;
					process.stderr.write(`[Stripe Webhook] Signature verification failed: ${err.message}\n`);
					return res.status(401).json({ error: "Invalid signature" });
				}

				// Log webhook event
				process.stdout.write(
					`[Stripe Webhook] Received event: type=${event.type}, id=${event.id}\n`,
				);

				// Route events to handlers asynchronously (don't block webhook response)
			if (event.type === "checkout.session.completed") {
				handleCheckoutSessionCompleted(event as Stripe.CheckoutSessionCompletedEvent).catch(
					(error) => {
						const errorDetails = {
							message: error?.message || String(error),
							stack: error?.stack,
							name: error?.name,
							cause: error?.cause,
						};
						process.stderr.write(
							`[Stripe Webhook] checkout.session.completed handler error: ${JSON.stringify(errorDetails, null, 2)}\n`,
						);
					},
				);
			} else if (event.type === "invoice.paid") {
					handleInvoicePaid(event as Stripe.InvoicePaidEvent).catch((error) => {
						const errorDetails = {
							message: error?.message || String(error),
							stack: error?.stack,
							name: error?.name,
							cause: error?.cause,
						};
						process.stderr.write(
							`[Stripe Webhook] invoice.paid handler error: ${JSON.stringify(errorDetails, null, 2)}\n`,
						);
					});
				} else if (event.type === "customer.subscription.updated") {
					handleSubscriptionUpdated(event as Stripe.CustomerSubscriptionUpdatedEvent).catch(
						(error) => {
							const errorDetails = {
								message: error?.message || String(error),
								stack: error?.stack,
								name: error?.name,
								cause: error?.cause,
							};
							process.stderr.write(
								`[Stripe Webhook] customer.subscription.updated handler error: ${JSON.stringify(errorDetails, null, 2)}\n`,
							);
						},
					);
				} else if (event.type === "customer.subscription.deleted") {
					handleSubscriptionDeleted(event as Stripe.CustomerSubscriptionDeletedEvent).catch(
						(error) => {
							const errorDetails = {
								message: error?.message || String(error),
								stack: error?.stack,
								name: error?.name,
								cause: error?.cause,
							};
							process.stderr.write(
								`[Stripe Webhook] customer.subscription.deleted handler error: ${JSON.stringify(errorDetails, null, 2)}\n`,
							);
						},
					);
				}

				// Always return success for valid webhooks (Stripe expects 200 OK)
				res.status(200).json({ received: true });
			} catch (error) {
				process.stderr.write(`[Stripe Webhook] Handler error: ${JSON.stringify(error)}\n`);
				res.status(500).json({ error: "Internal server error" });
			}
		},
	);

	// Body parser middleware for other routes (after webhook)
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

	// Admin endpoints (require service role key authentication)
	app.get("/admin/jobs/failed", async (req: Request, res: Response) => {
		const authHeader = req.get("authorization") || null;

		if (!requireAdmin(authHeader)) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const queue = getQueue();
		const limit = parseInt(req.query.limit as string) || 50;
		const offset = parseInt(req.query.offset as string) || 0;

		try {
			// Fetch failed jobs from pg-boss archive
			const jobs = await queue.fetch(QUEUE_NAMES.INDEX_REPO, { includeMetadata: true });

			// Filter to failed jobs only and apply offset
			const failedJobs = jobs
				.filter(j => j.state === 'failed')
				.slice(offset, offset + limit)
				.map(j => {
					const data = j.data as { repositoryId?: string; commitSha?: string; ref?: string } | undefined;
					const output = j.output as { error?: string } | undefined;
					return {
						id: j.id || '',
						repository_id: data?.repositoryId,
						commit_sha: data?.commitSha,
						ref: data?.ref,
						error: output?.error || "Unknown error",
						failed_at: j.completedOn,
						retry_count: j.retryCount || 0
					};
				});

			res.json({
				jobs: failedJobs,
				limit,
				offset,
				total: jobs.filter(j => j.state === 'failed').length
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			res.status(500).json({ error: `Failed to fetch jobs: ${errorMessage}` });
		}
	});

	app.post("/admin/jobs/:jobId/retry", async (req: Request, res: Response) => {
		const authHeader = req.get("authorization") || null;

		if (!requireAdmin(authHeader)) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const { jobId } = req.params;
		if (!jobId) {
			return res.status(400).json({ error: "Missing job ID" });
		}

		const queue = getQueue();

		try {
			// Retry job via pg-boss (moves from archive back to active queue)
			await queue.retry(QUEUE_NAMES.INDEX_REPO, jobId);

			res.json({
				message: "Job requeued for retry",
				job_id: jobId
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			if (errorMessage.includes("not found")) {
				res.status(404).json({ error: "Job not found or not eligible for retry" });
			} else {
				res.status(500).json({ error: `Retry failed: ${errorMessage}` });
			}
		}
	});

	// Authentication middleware for all other routes
	app.use(
		async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			// Skip auth for health check and JWT-authenticated endpoints
			if (req.path === "/health" || req.path === "/api/keys/generate") {
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

			// Create index job in pending state
			const job = await createIndexJob(
				repositoryId,
				indexRequest.ref || "main",
				undefined, // commit_sha will be populated during indexing
				context.userId,
			);

			// Enqueue job to pg-boss for asynchronous processing
			try {
				const queue = getQueue();
				const payload: IndexRepoJobPayload = {
					indexJobId: job.id,
					repositoryId,
					commitSha: indexRequest.ref || "main",
				};

				await queue.send(
					QUEUE_NAMES.INDEX_REPO,
					payload,
					getDefaultSendOptions(),
				);

				process.stdout.write(
					`[${new Date().toISOString()}] Enqueued index job ${job.id} for repository ${repositoryId}\n`,
				);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				process.stderr.write(`Failed to enqueue job: ${errorMsg}\n`);
				// Update job status to failed since we couldn't enqueue it
				await updateJobStatus(
					job.id,
					"failed",
					{ error: `Queue error: ${errorMsg}` },
					context.userId,
				);
				throw error;
			}

			addRateLimitHeaders(res, context.rateLimit);
			res.status(202).json({ jobId: job.id, status: job.status });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			res.status(500).json({
				error: `Failed to start indexing: ${(error as Error).message}`,
			});
		}
	});

	// GET /jobs/:jobId - Get job status
	app.get("/jobs/:jobId", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const jobId = req.params.jobId;

		if (!jobId) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Job ID is required" });
		}

		try {
			const job = await getJobStatus(jobId, context.userId);
			addRateLimitHeaders(res, context.rateLimit);
			res.json(job);
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			// Return 404 if job not found (may be hidden by RLS)
			res.status(404).json({
				error: `Job not found: ${jobId}`,
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
				process.stderr.write(`MCP handler error: ${JSON.stringify(error)}\n`);
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

	// TEMPORARY: Test endpoint to verify Sentry error tracking
	// TODO: Remove after Sentry verification
	app.get("/test-sentry-error", (req: Request, res: Response) => {
		const { Sentry } = require("../instrument.js");
		try {
			// Intentionally throw an error to test Sentry
			throw new Error("Test error for Sentry verification - this is intentional!");
		} catch (e) {
			Sentry.captureException(e);
			res.status(500).json({
				error: "Test error captured by Sentry",
				message: "Check your Sentry dashboard for this error"
			});
		}
	});

	// POST /api/subscriptions/create-checkout-session - Create Stripe Checkout session
	app.post("/api/subscriptions/create-checkout-session", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		addRateLimitHeaders(res, context.rateLimit);

		try {
			const { tier, successUrl, cancelUrl } = req.body;

			if (!tier || (tier !== "solo" && tier !== "team")) {
				return res.status(400).json({ error: "Invalid tier. Must be 'solo' or 'team'" });
			}

			if (!successUrl || !cancelUrl) {
				return res.status(400).json({ error: "successUrl and cancelUrl are required" });
			}

			// Initialize Stripe with configuration validation
			let stripe;
			let priceId;
			try {
				const { getStripeClient, STRIPE_PRICE_IDS, validateStripePriceIds } = await import("./stripe");
				validateStripePriceIds();
				stripe = getStripeClient();
				priceId = STRIPE_PRICE_IDS[tier as "solo" | "team"];
			} catch (configError) {
				process.stderr.write(`[Stripe] Configuration error: ${JSON.stringify(configError)}\n`);
				return res.status(500).json({ error: "Stripe is not configured on this server" });
			}

			// Get or create Stripe customer
			const { data: existingSub } = await supabase
				.from("subscriptions")
				.select("stripe_customer_id")
				.eq("user_id", context.userId)
				.single();

			let customerId: string;

			if (existingSub?.stripe_customer_id) {
				customerId = existingSub.stripe_customer_id;
			} else {
				const customer = await stripe.customers.create({
					metadata: { user_id: context.userId },
				});
				customerId = customer.id;
			}

			// Create Checkout session
			const session = await stripe.checkout.sessions.create({
				customer: customerId,
				mode: "subscription",
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: successUrl,
				cancel_url: cancelUrl,
				subscription_data: {
					metadata: { user_id: context.userId },
				},
			});

			res.json({ url: session.url, sessionId: session.id });
		} catch (error) {
			process.stderr.write(`[Stripe] Checkout session error: ${JSON.stringify(error)}\n`);
			res.status(500).json({ error: "Failed to create checkout session" });
		}
	});

	// POST /api/subscriptions/create-portal-session - Create Stripe billing portal session
	app.post("/api/subscriptions/create-portal-session", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		addRateLimitHeaders(res, context.rateLimit);

		try {
			const { returnUrl } = req.body;

			if (!returnUrl) {
				return res.status(400).json({ error: "returnUrl is required" });
			}

			// Get Stripe customer ID from subscription
			const { data: subscription } = await supabase
				.from("subscriptions")
				.select("stripe_customer_id")
				.eq("user_id", context.userId)
				.single();

			if (!subscription?.stripe_customer_id) {
				return res.status(404).json({ error: "No subscription found" });
			}

			// Initialize Stripe with configuration validation
			let stripe;
			try {
				const { getStripeClient } = await import("./stripe");
				stripe = getStripeClient();
			} catch (configError) {
				process.stderr.write(`[Stripe] Configuration error: ${JSON.stringify(configError)}\n`);
				return res.status(500).json({ error: "Stripe is not configured on this server" });
			}

			const session = await stripe.billingPortal.sessions.create({
				customer: subscription.stripe_customer_id,
				return_url: returnUrl,
			});

			res.json({ url: session.url });
		} catch (error) {
			process.stderr.write(`[Stripe] Portal session error: ${JSON.stringify(error)}\n`);
			res.status(500).json({ error: "Failed to create portal session" });
		}
	});

	// GET /api/subscriptions/current - Get current user's subscription
	app.get("/api/subscriptions/current", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		addRateLimitHeaders(res, context.rateLimit);

		try {
			const { data: subscription } = await supabase
				.from("subscriptions")
				.select("id, tier, status, current_period_start, current_period_end, cancel_at_period_end")
				.eq("user_id", context.userId)
				.single();

			res.json({ subscription: subscription || null });
		} catch (error) {
			process.stderr.write(`[Stripe] Get subscription error: ${JSON.stringify(error)}\n`);
			res.status(500).json({ error: "Failed to fetch subscription" });
		}
	});

	// POST /api/keys/generate - Generate API key for authenticated user
	app.post("/api/keys/generate", async (req: Request, res: Response) => {
		try {
			// Extract JWT token from Authorization header
			const authHeader = req.get("Authorization");
			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				return res.status(401).json({ error: "Missing or invalid Authorization header" });
			}

			const token = authHeader.substring(7); // Remove "Bearer " prefix

			// Verify JWT with Supabase Auth
			const { data: { user }, error: authError } = await supabase.auth.getUser(token);
			if (authError || !user) {
				return res.status(401).json({ error: "Invalid or expired token" });
			}

			// Check if user already has an API key
			const { data: existingKey } = await supabase
				.from("api_keys")
				.select("key_id, tier, rate_limit_per_hour, created_at")
				.eq("user_id", user.id)
				.eq("enabled", true)
				.is("revoked_at", null)
				.maybeSingle();

			if (existingKey) {
				// Return existing key info (without secret, which is never stored)
				return res.json({
					keyId: existingKey.key_id,
					tier: existingKey.tier,
					rateLimitPerHour: existingKey.rate_limit_per_hour,
					createdAt: existingKey.created_at,
					message: "API key already exists for this user",
				});
			}

			// Check if user has an organization, create if not
			const { data: userOrg } = await supabase
				.from("user_organizations")
				.select("org_id")
				.eq("user_id", user.id)
				.maybeSingle();

			let orgId: string;
			if (!userOrg) {
				const { createDefaultOrganization } = await import("./queries");
				orgId = await createDefaultOrganization(supabase, user.id, user.email);
			} else {
				orgId = userOrg.org_id;
			}

			// Generate new API key (default to free tier)
			const { generateApiKey } = await import("@auth/keys");
			const result = await generateApiKey({
				userId: user.id,
				tier: "free",
				orgId,
			});

			res.json({
				apiKey: result.apiKey,
				keyId: result.keyId,
				tier: result.tier,
				rateLimitPerHour: result.rateLimitPerHour,
				createdAt: result.createdAt,
			});
		} catch (error) {
			process.stderr.write(`[API Keys] Generation error: ${JSON.stringify(error)}\n`);
			res.status(500).json({ error: "Failed to generate API key" });
		}
	});

	// GET /api/keys/current - Get current API key metadata
	app.get("/api/keys/current", async (req: Request, res: Response) => {
		try {
			// Extract JWT token from Authorization header
			const authHeader = req.get("Authorization");
			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				return res.status(401).json({ error: "Missing or invalid Authorization header" });
			}

			const token = authHeader.substring(7); // Remove "Bearer " prefix

			// Verify JWT with Supabase Auth
			const { data: { user }, error: authError } = await supabase.auth.getUser(token);
			if (authError || !user) {
				return res.status(401).json({ error: "Invalid or expired token" });
			}

			// Query for user's active API key metadata
			const { data: keyData, error: queryError } = await supabase
				.from("api_keys")
				.select("key_id, tier, rate_limit_per_hour, created_at, last_used_at, enabled")
				.eq("user_id", user.id)
				.is("revoked_at", null)
				.maybeSingle();

			if (queryError) {
				process.stderr.write(`[API Keys] Query error: ${JSON.stringify(queryError)}\n`);
				return res.status(500).json({ error: "Failed to fetch API key metadata" });
			}

			if (!keyData) {
				return res.status(404).json({ error: "No active API key found" });
			}

			res.json({
				keyId: keyData.key_id,
				tier: keyData.tier,
				rateLimitPerHour: keyData.rate_limit_per_hour,
				createdAt: keyData.created_at,
				lastUsedAt: keyData.last_used_at,
				enabled: keyData.enabled,
			});
		} catch (error) {
			process.stderr.write(`[API Keys] Get current error: ${JSON.stringify(error)}\n`);
			res.status(500).json({ error: "Failed to fetch API key metadata" });
		}
	});

	// POST /api/keys/reset - Reset API key (revoke old + generate new)
	app.post("/api/keys/reset", async (req: Request, res: Response) => {
		try {
			// Extract JWT token from Authorization header
			const authHeader = req.get("Authorization");
			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				return res.status(401).json({ error: "Missing or invalid Authorization header" });
			}

			const token = authHeader.substring(7); // Remove "Bearer " prefix

			// Verify JWT with Supabase Auth
			const { data: { user }, error: authError } = await supabase.auth.getUser(token);
			if (authError || !user) {
				return res.status(401).json({ error: "Invalid or expired token" });
			}

			// Enforce rate limit for reset endpoint (max 5 per hour)
			const resetKeyId = `api-key-reset:${user.id}`;
			const { enforceCustomRateLimit } = await import("@auth/rate-limit");
			const rateLimit = await enforceCustomRateLimit(resetKeyId, 5);

			if (!rateLimit.allowed) {
				return res.status(429).json({
					error: "Rate limit exceeded for API key reset",
					retryAfter: rateLimit.retryAfter,
				});
			}

			// Reset API key (revoke old + generate new)
			const { resetApiKey } = await import("@auth/keys");
			const result = await resetApiKey(user.id);

			res.json({
				apiKey: result.apiKey,
				keyId: result.keyId,
				tier: result.tier,
				rateLimitPerHour: result.rateLimitPerHour,
				createdAt: result.createdAt,
				message: "Old API key revoked, new key generated",
			});
		} catch (error) {
			process.stderr.write(`[API Keys] Reset error: ${JSON.stringify(error)}\n`);
			const errorMessage = error instanceof Error ? error.message : "Failed to reset API key";

			// Return 404 if no active key exists
			if (errorMessage.includes("No active API key found")) {
				return res.status(404).json({ error: errorMessage });
			}

			res.status(500).json({ error: errorMessage });
		}
	});

	// DELETE /api/keys/current - Revoke current API key
	app.delete("/api/keys/current", async (req: Request, res: Response) => {
		try {
			// Extract JWT token from Authorization header
			const authHeader = req.get("Authorization");
			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				return res.status(401).json({ error: "Missing or invalid Authorization header" });
			}

			const token = authHeader.substring(7); // Remove "Bearer " prefix

			// Verify JWT with Supabase Auth
			const { data: { user }, error: authError } = await supabase.auth.getUser(token);
			if (authError || !user) {
				return res.status(401).json({ error: "Invalid or expired token" });
			}

			// Revoke API key
			const { revokeApiKey } = await import("@auth/keys");
			const result = await revokeApiKey(user.id);

			res.json({
				success: true,
				message: "API key revoked successfully",
				keyId: result.keyId,
				revokedAt: result.revokedAt,
			});
		} catch (error) {
			process.stderr.write(`[API Keys] Revoke error: ${JSON.stringify(error)}\n`);
			const errorMessage = error instanceof Error ? error.message : "Failed to revoke API key";

			// Return 404 if no active key exists
			if (errorMessage.includes("No active API key found")) {
				return res.status(404).json({ error: errorMessage });
			}

			res.status(500).json({ error: errorMessage });
		}
	});

	// GET /api/keys/validate - Validate API key or JWT token
	app.get("/api/keys/validate", async (req: AuthenticatedRequest, res: Response) => {
		// Uses existing authenticateRequest middleware (automatically validates)
		const context = req.authContext!;

		res.json({
			valid: true,
			tier: context.tier,
			userId: context.userId,
			rateLimitInfo: {
				limit: context.rateLimitPerHour,
				remaining: context.rateLimit?.remaining ?? context.rateLimitPerHour,
				reset: context.rateLimit?.resetAt,
			},
		});
	});

	// Sentry error handler middleware (captures errors for remote monitoring)
	// Must be placed after all routes but before custom error logging
	app.use(expressErrorHandler());

	// Error logging middleware (structured logs for local debugging)
	app.use(errorLoggingMiddleware);

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
