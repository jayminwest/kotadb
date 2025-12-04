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
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "api-routes" });
import {
	ensureRepository,
	listRecentFiles,
	runIndexingWorkflow,
	searchFiles,
} from "./queries";
import {
	createProject,
	listProjects,
	getProject,
	updateProject,
	deleteProject,
	addRepositoryToProject,
	removeRepositoryFromProject,
} from "./projects";
import type {
	CreateProjectRequest,
	UpdateProjectRequest,
} from "@shared/types";
import { triggerAutoReindex } from "./auto-reindex";
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
				version: apiVersion || "unknown",
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
				version: apiVersion || "unknown",
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
					const error = new Error("GITHUB_WEBHOOK_SECRET not configured");
					logger.error("GitHub webhook secret missing", error);
					Sentry.captureException(error);
					return res.status(500).json({ error: "Webhook secret not configured" });
				}

				// Convert raw body to string for signature verification
				const rawBody = req.body.toString("utf-8");

				// Verify signature
				const isValid = verifyWebhookSignature(rawBody, signature, secret);
				if (!isValid) {
					logger.warn("GitHub webhook signature invalid", {
						delivery,
						event,
					});
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
						const err = error instanceof Error ? error : new Error(String(error));
						logger.error("GitHub webhook processing error", err, {
							event,
							delivery,
						});
						Sentry.captureException(err);
					});
				}

				// Always return success for valid webhooks (GitHub expects 200 OK)
				res.status(200).json({ received: true });
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error("GitHub webhook handler error", err);
				Sentry.captureException(err);
				res.status(500).json({ error: "Internal server error" });
			}
		},
	);

	// Stripe webhook endpoint (must be before express.json() to preserve raw body)
	// Only registered if billing is enabled
	if (process.env.ENABLE_BILLING === "true") {
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
						const error = new Error("STRIPE_WEBHOOK_SECRET not configured");
						logger.error("Stripe webhook secret missing", error);
						Sentry.captureException(error);
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
						logger.error("Stripe webhook signature verification failed", err);
						Sentry.captureException(err);
						return res.status(401).json({ error: "Invalid signature" });
					}

					// Log webhook event
					logger.info("Stripe webhook received", {
						eventType: event.type,
						eventId: event.id,
					});

					// Route events to handlers asynchronously (don't block webhook response)
				if (event.type === "checkout.session.completed") {
					handleCheckoutSessionCompleted(event as Stripe.CheckoutSessionCompletedEvent).catch(
						(error) => {
							const err = error instanceof Error ? error : new Error(String(error));
							logger.error("Stripe checkout.session.completed handler error", err, {
								eventId: event.id,
								eventType: event.type,
							});
							Sentry.captureException(err);
						},
					);
				} else if (event.type === "invoice.paid") {
						handleInvoicePaid(event as Stripe.InvoicePaidEvent).catch((error) => {
							const err = error instanceof Error ? error : new Error(String(error));
							logger.error("Stripe invoice.paid handler error", err, {
								eventId: event.id,
								eventType: event.type,
							});
							Sentry.captureException(err);
						});
					} else if (event.type === "customer.subscription.updated") {
						handleSubscriptionUpdated(event as Stripe.CustomerSubscriptionUpdatedEvent).catch(
							(error) => {
								const err = error instanceof Error ? error : new Error(String(error));
								logger.error("Stripe customer.subscription.updated handler error", err, {
									eventId: event.id,
									eventType: event.type,
								});
								Sentry.captureException(err);
							},
						);
					} else if (event.type === "customer.subscription.deleted") {
						handleSubscriptionDeleted(event as Stripe.CustomerSubscriptionDeletedEvent).catch(
							(error) => {
								const err = error instanceof Error ? error : new Error(String(error));
								logger.error("Stripe customer.subscription.deleted handler error", err, {
									eventId: event.id,
									eventType: event.type,
								});
								Sentry.captureException(err);
							},
						);
					}

					// Always return success for valid webhooks (Stripe expects 200 OK)
					res.status(200).json({ received: true });
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					logger.error("Stripe webhook handler error", err);
					Sentry.captureException(err);
					res.status(500).json({ error: "Internal server error" });
				}
			},
		);
	}

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

				logger.info("Index job enqueued", {
					jobId: job.id,
					repositoryId,
					userId: context.userId,
				});
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error("Failed to enqueue job", err, {
					jobId: job.id,
					repositoryId,
					userId: context.userId,
				});
				Sentry.captureException(err);
				// Update job status to failed since we couldn't enqueue it
				await updateJobStatus(
					job.id,
					"failed",
					{ error: `Queue error: ${err.message}` },
					context.userId,
				);
				throw err;
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
		const projectId = req.query.project_id as string | undefined;
		const limit = req.query.limit ? Number(req.query.limit) : undefined;

		try {
			const results = await searchFiles(supabase, term, context.userId, {
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

	// POST /api/subscriptions/create-checkout-session - Create Stripe Checkout session
	// Only registered if billing is enabled
	if (process.env.ENABLE_BILLING === "true") {
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
					const err = configError instanceof Error ? configError : new Error(String(configError));
					logger.error("Stripe configuration error in checkout", err, {
						userId: context.userId,
						tier,
					});
					Sentry.captureException(err);
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
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error("Stripe checkout session creation failed", err, {
					userId: context.userId,
				});
				Sentry.captureException(err);
				res.status(500).json({ error: "Failed to create checkout session" });
			}
		});
	} else {
		app.post("/api/subscriptions/create-checkout-session", (req: AuthenticatedRequest, res: Response) => {
			const context = req.authContext!;
			addRateLimitHeaders(res, context.rateLimit);
			res.status(501).json({ error: "Billing is not enabled on this server" });
		});
	}

	// POST /api/subscriptions/create-portal-session - Create Stripe billing portal session
	// Only registered if billing is enabled
	if (process.env.ENABLE_BILLING === "true") {
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
					const err = configError instanceof Error ? configError : new Error(String(configError));
					logger.error("Stripe configuration error in portal", err, {
						userId: context.userId,
					});
					Sentry.captureException(err);
					return res.status(500).json({ error: "Stripe is not configured on this server" });
				}

				const session = await stripe.billingPortal.sessions.create({
					customer: subscription.stripe_customer_id,
					return_url: returnUrl,
				});

				res.json({ url: session.url });
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error("Stripe portal session creation failed", err, {
					userId: context.userId,
				});
				Sentry.captureException(err);
				res.status(500).json({ error: "Failed to create portal session" });
			}
		});
	} else {
		app.post("/api/subscriptions/create-portal-session", (req: AuthenticatedRequest, res: Response) => {
			const context = req.authContext!;
			addRateLimitHeaders(res, context.rateLimit);
			res.status(501).json({ error: "Billing is not enabled on this server" });
		});
	}

	// GET /api/subscriptions/current - Get current user's subscription
	// Only registered if billing is enabled
	if (process.env.ENABLE_BILLING === "true") {
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
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error("Get subscription failed", err, {
					userId: context.userId,
				});
				Sentry.captureException(err);
				res.status(500).json({ error: "Failed to fetch subscription" });
			}
		});
	} else {
		app.get("/api/subscriptions/current", (req: AuthenticatedRequest, res: Response) => {
			const context = req.authContext!;
			addRateLimitHeaders(res, context.rateLimit);
			res.status(501).json({ error: "Billing is not enabled on this server" });
		});
	}

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
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("API key generation failed", err);
			Sentry.captureException(err);
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
				logger.error("API key query failed", new Error(queryError.message), {
					userId: user.id,
				});
				Sentry.captureException(new Error(queryError.message));
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
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("Get API key metadata failed", err);
			Sentry.captureException(err);
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
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("API key reset failed", err);
			Sentry.captureException(err);

			// Return 404 if no active key exists
			if (err.message.includes("No active API key found")) {
				return res.status(404).json({ error: err.message });
			}

			res.status(500).json({ error: err.message });
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
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error("API key revocation failed", err);
			Sentry.captureException(err);

			// Return 404 if no active key exists
			if (err.message.includes("No active API key found")) {
				return res.status(404).json({ error: err.message });
			}

			res.status(500).json({ error: err.message });
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

	// ============================================================================
	// Project Management Endpoints
	// ============================================================================

	// POST /api/projects - Create a new project
	app.post("/api/projects", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const payload = req.body as Partial<CreateProjectRequest>;

		if (!payload?.name) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Field 'name' is required" });
		}

		try {
			const projectId = await createProject(supabase, context.userId, {
				name: payload.name,
				description: payload.description,
				repository_ids: payload.repository_ids,
			});

			addRateLimitHeaders(res, context.rateLimit);
			res.status(201).json({ id: projectId });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to create project", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
	});

	// GET /api/projects - List all projects
	app.get("/api/projects", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;

		try {
			const projects = await listProjects(supabase, context.userId);
			addRateLimitHeaders(res, context.rateLimit);
			res.json({ projects });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to list projects", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
	});

	// GET /api/projects/:id - Get project details
	app.get("/api/projects/:id", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const projectId = req.params.id;

		if (!projectId) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Project ID is required" });
		}

		try {
			const project = await getProject(supabase, context.userId, projectId);

			if (!project) {
				addRateLimitHeaders(res, context.rateLimit);
				return res.status(404).json({ error: "Project not found" });
			}

			addRateLimitHeaders(res, context.rateLimit);
			res.json(project);
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to get project", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
	});

	// PATCH /api/projects/:id - Update project
	app.patch("/api/projects/:id", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const projectId = req.params.id;
		const payload = req.body as Partial<UpdateProjectRequest>;

		if (!projectId) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Project ID is required" });
		}

		try {
			await updateProject(supabase, context.userId, projectId, payload);
			addRateLimitHeaders(res, context.rateLimit);
			res.json({ success: true });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to update project", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
	});

	// DELETE /api/projects/:id - Delete project
	app.delete("/api/projects/:id", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const projectId = req.params.id;

		if (!projectId) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Project ID is required" });
		}

		try {
			await deleteProject(supabase, context.userId, projectId);
			addRateLimitHeaders(res, context.rateLimit);
			res.json({ success: true });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to delete project", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
	});

	// POST /api/projects/:id/repositories/:repoId - Add repository to project
	app.post("/api/projects/:id/repositories/:repoId", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const { id: projectId, repoId } = req.params;

		if (!projectId || !repoId) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Project ID and Repository ID are required" });
		}

		try {
			await addRepositoryToProject(supabase, context.userId, projectId, repoId);
			addRateLimitHeaders(res, context.rateLimit);
			res.json({ success: true });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to add repository to project", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
	});

	// DELETE /api/projects/:id/repositories/:repoId - Remove repository from project
	app.delete("/api/projects/:id/repositories/:repoId", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;
		const { id: projectId, repoId } = req.params;

		if (!projectId || !repoId) {
			addRateLimitHeaders(res, context.rateLimit);
			return res.status(400).json({ error: "Project ID and Repository ID are required" });
		}

		try {
			await removeRepositoryFromProject(supabase, context.userId, projectId, repoId);
			addRateLimitHeaders(res, context.rateLimit);
			res.json({ success: true });
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to remove repository from project", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
	});

	// POST /api/auto-reindex - Trigger auto-reindex for user's project repositories
	app.post("/api/auto-reindex", async (req: AuthenticatedRequest, res: Response) => {
		const context = req.authContext!;

		try {
			const result = await triggerAutoReindex(context);

			if (result.rateLimited) {
				addRateLimitHeaders(res, context.rateLimit);
				return res.status(429).json({
					triggered: false,
					reason: result.reason,
				});
			}

			addRateLimitHeaders(res, context.rateLimit);

			// Add X-Auto-Reindex-Triggered header with job count
			res.set("X-Auto-Reindex-Triggered", String(result.jobCount));

			res.json({
				triggered: result.triggered,
				jobCount: result.jobCount,
				jobIds: result.jobIds,
				reason: result.reason,
			});
		} catch (error) {
			addRateLimitHeaders(res, context.rateLimit);
			const err = error as Error;
			logger.error("Failed to trigger auto-reindex", err);
			Sentry.captureException(err);
			res.status(500).json({ error: err.message });
		}
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
