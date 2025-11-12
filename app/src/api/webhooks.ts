/**
 * Stripe webhook signature verification and event handlers.
 *
 * This module handles incoming webhook events from Stripe and synchronizes
 * subscription state with the local database.
 */

import type Stripe from "stripe";
import { getStripeClient } from "./stripe";
import { getServiceClient } from "@db/client";
import type { Tier } from "@shared/types/auth";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "api-webhooks" });

/**
 * Helper type for Stripe Subscription with full property access.
 * Stripe SDK types are sometimes overly strict or incomplete.
 */
type StripeSubscriptionFull = Stripe.Subscription & {
	current_period_start: number;
	current_period_end: number;
	cancel_at_period_end: boolean;
	canceled_at?: number;
	trial_end?: number;
};

/**
 * Verify Stripe webhook signature.
 * Returns the constructed event if signature is valid.
 *
 * @param rawBody - Raw request body as string
 * @param signature - Stripe signature from stripe-signature header
 * @returns Constructed Stripe event
 * @throws Error if signature verification fails
 */
export async function verifyWebhookSignature(
	rawBody: string,
	signature: string,
): Promise<Stripe.Event> {
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) {
		const error = new Error(
			"STRIPE_WEBHOOK_SECRET environment variable is not configured",
		);
		logger.error("Webhook secret not configured", error);
		Sentry.captureException(error);
		throw error;
	}

	const stripe = getStripeClient();

	try {
		const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
		logger.info("Webhook signature verified", {
			eventType: event.type,
			eventId: event.id,
		});
		return event;
	} catch (err) {
		const error = err as Error;
		logger.error("Webhook signature verification failed", error, {
			signaturePrefix: signature.substring(0, 20),
		});
		Sentry.captureException(error);
		throw new Error(`Webhook signature verification failed: ${error.message}`);
	}
}

/**
 * Handle invoice.paid event.
 * Creates or updates subscription record and sets tier to active.
 *
 * @param event - Stripe invoice.paid event
 */
export async function handleInvoicePaid(
	event: Stripe.InvoicePaidEvent,
): Promise<void> {
	const invoice = event.data.object as Stripe.Invoice;

	// Extract subscription ID from parent.subscription_details or top-level subscription field
	const invoiceAny = invoice as any;
	let subscriptionId: string | undefined;

	// Try parent.subscription_details.subscription first (newer Stripe API structure)
	if (invoiceAny.parent?.subscription_details?.subscription) {
		subscriptionId = invoiceAny.parent.subscription_details.subscription;
	}
	// Fallback to top-level subscription field (older structure)
	else if (invoiceAny.subscription) {
		subscriptionId = typeof invoiceAny.subscription === "string"
			? invoiceAny.subscription
			: invoiceAny.subscription?.id;
	}

	const customerId =
		typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

	if (!subscriptionId || !customerId) {
		logger.warn("Invoice missing subscription or customer ID", {
			invoiceId: invoice.id,
			hasSubscriptionId: !!subscriptionId,
			hasCustomerId: !!customerId,
		});
		return;
	}

	const invoiceLines = (invoice as any).lines;
	if (!invoiceLines || !invoiceLines.data || invoiceLines.data.length === 0) {
		logger.warn("Invoice has no line items", {
			invoiceId: invoice.id,
		});
		return;
	}

	const lineItem = invoiceLines.data[0];
	if (!lineItem?.period) {
		logger.warn("Invoice line item missing period data", {
			invoiceId: invoice.id,
		});
		return;
	}

	const periodStart = lineItem.period.start;
	const periodEnd = lineItem.period.end;

	const stripe = getStripeClient();
	const subscription = (await stripe.subscriptions.retrieve(
		subscriptionId,
	)) as unknown as StripeSubscriptionFull;

	// Get user_id from subscription metadata or customer metadata
	const customer = await stripe.customers.retrieve(customerId);
	const userId =
		subscription.metadata?.user_id ||
		(customer.deleted ? undefined : customer.metadata?.user_id);

	if (!userId) {
		logger.warn("Invoice missing user_id in metadata", {
			invoiceId: invoice.id,
			subscriptionId,
			customerId,
		});
		return; // Return success to avoid Stripe webhook retries
	}

	// Determine tier from price ID
	const priceId = subscription.items.data[0]?.price.id;
	const tier = getTierFromPriceId(priceId);

	const supabase = getServiceClient();

	// Upsert subscription record using periods from invoice line item
	const { error: subError } = await supabase
		.from("subscriptions")
		.upsert(
			{
				user_id: userId,
				stripe_customer_id: customerId,
				stripe_subscription_id: subscriptionId,
				tier,
				status: "active" as const,
				current_period_start: new Date(periodStart * 1000).toISOString(),
				current_period_end: new Date(periodEnd * 1000).toISOString(),
				cancel_at_period_end: subscription.cancel_at_period_end,
				trial_end: subscription.trial_end
					? new Date(subscription.trial_end * 1000).toISOString()
					: null,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "user_id" },
		);

	if (subError) {
		const error = new Error(`Failed to upsert subscription: ${subError.message}`);
		logger.error("Subscription upsert failed", error, {
			subscriptionId,
			userId,
			tier,
		});
		Sentry.captureException(error);
		throw error;
	}

	// Update api_keys tier
	const { error: keyError } = await supabase
		.from("api_keys")
		.update({ tier })
		.eq("user_id", userId);

	if (keyError) {
		const error = new Error(`Failed to update API key tier: ${keyError.message}`);
		logger.error("API key tier update failed", error, {
			userId,
			tier,
			subscriptionId,
		});
		Sentry.captureException(error);
		throw error;
	}

	logger.info("Subscription activated", {
		subscriptionId,
		userId,
		tier,
		invoiceId: invoice.id,
	});
}

/**
 * Handle checkout.session.completed event.
 * Creates initial subscription record immediately after checkout completion.
 *
 * @param event - Stripe checkout.session.completed event
 */
export async function handleCheckoutSessionCompleted(
	event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
	const session = event.data.object;
	const customerId =
		typeof session.customer === "string"
			? session.customer
			: session.customer?.id;
	const subscriptionId =
		typeof session.subscription === "string"
			? session.subscription
			: session.subscription?.id;

	if (!subscriptionId || !customerId) {
		logger.warn("Checkout session missing subscription or customer ID", {
			sessionId: session.id,
			hasSubscriptionId: !!subscriptionId,
			hasCustomerId: !!customerId,
		});
		return;
	}

	const stripe = getStripeClient();
	logger.info("Retrieving subscription for checkout", {
		subscriptionId,
		sessionId: session.id,
	});
	const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;
	logger.info("Subscription retrieved", {
		subscriptionId,
		status: subscription.status,
		currentPeriodStart: (subscription as any).current_period_start,
		currentPeriodEnd: (subscription as any).current_period_end,
	});

	// Get user_id from subscription metadata or customer metadata
	const customer = await stripe.customers.retrieve(customerId);
	const userId =
		subscription.metadata?.user_id ||
		(customer.deleted ? undefined : customer.metadata?.user_id);

	if (!userId) {
		logger.warn("Checkout session missing user_id in metadata", {
			sessionId: session.id,
			subscriptionId,
			customerId,
		});
		return; // Return success to avoid Stripe webhook retries
	}

	logger.info("User ID extracted from checkout", {
		userId,
		subscriptionId,
		sessionId: session.id,
	});

	// Determine tier from price ID
	const priceId = subscription.items.data[0]?.price.id;
	const tier = getTierFromPriceId(priceId);

	const supabase = getServiceClient();

	// Access period fields (Stripe SDK types don't include these but they exist at runtime)
	const currentPeriodStart = (subscription as any).current_period_start;
	const currentPeriodEnd = (subscription as any).current_period_end;
	const cancelAtPeriodEnd = (subscription as any).cancel_at_period_end;
	const trialEnd = (subscription as any).trial_end;

	// If period fields are undefined, skip checkout handler and rely on invoice.paid event
	// This happens when checkout.session.completed fires before subscription is fully initialized
	if (!currentPeriodStart || !currentPeriodEnd) {
		logger.info("Subscription missing billing period data, deferring to invoice.paid", {
			subscriptionId,
			status: subscription.status,
			hasPeriodStart: !!currentPeriodStart,
			hasPeriodEnd: !!currentPeriodEnd,
		});
		return; // Return success to avoid Stripe retries
	}

	// Validate timestamp types
	if (typeof currentPeriodStart !== 'number' || typeof currentPeriodEnd !== 'number') {
		logger.warn("Subscription has invalid period types, deferring to invoice.paid", {
			subscriptionId,
			periodStartType: typeof currentPeriodStart,
			periodEndType: typeof currentPeriodEnd,
		});
		return;
	}

	// Convert Unix timestamps to Date objects
	const periodStart = new Date(currentPeriodStart * 1000);
	const periodEnd = new Date(currentPeriodEnd * 1000);

	// Validate Date objects are valid
	if (Number.isNaN(periodStart.getTime())) {
		const error = new Error(`Invalid Date created from current_period_start: ${currentPeriodStart}`);
		logger.error("Invalid period start timestamp", error, {
			subscriptionId,
			currentPeriodStart,
		});
		Sentry.captureException(error);
		throw error;
	}
	if (Number.isNaN(periodEnd.getTime())) {
		const error = new Error(`Invalid Date created from current_period_end: ${currentPeriodEnd}`);
		logger.error("Invalid period end timestamp", error, {
			subscriptionId,
			currentPeriodEnd,
		});
		Sentry.captureException(error);
		throw error;
	}

	// Upsert subscription record (idempotent for duplicate events)
	const { error: subError } = await supabase
		.from("subscriptions")
		.upsert(
			{
				user_id: userId,
				stripe_customer_id: customerId,
				stripe_subscription_id: subscriptionId,
				tier,
				status: "active" as const,
				current_period_start: periodStart.toISOString(),
				current_period_end: periodEnd.toISOString(),
				cancel_at_period_end: cancelAtPeriodEnd,
				trial_end: trialEnd
					? new Date(trialEnd * 1000).toISOString()
					: null,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "user_id" },
		);

	if (subError) {
		const error = new Error(`Failed to upsert subscription: ${subError.message}`);
		logger.error("Subscription upsert failed in checkout handler", error, {
			subscriptionId,
			userId,
			tier,
			sessionId: session.id,
		});
		Sentry.captureException(error);
		throw error;
	}

	// Update ALL api_keys tier for this user (not just primary key)
	const { error: keyError } = await supabase
		.from("api_keys")
		.update({ tier })
		.eq("user_id", userId);

	if (keyError) {
		const error = new Error(`Failed to update API key tier: ${keyError.message}`);
		logger.error("API key tier update failed in checkout handler", error, {
			userId,
			tier,
			subscriptionId,
			sessionId: session.id,
		});
		Sentry.captureException(error);
		throw error;
	}

	logger.info("Subscription created from checkout", {
		subscriptionId,
		userId,
		tier,
		sessionId: session.id,
	});
}

/**
 * Handle customer.subscription.updated event.
 * Syncs subscription status and tier changes.
 *
 * @param event - Stripe customer.subscription.updated event
 */
export async function handleSubscriptionUpdated(
	event: Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<void> {
	const subscription = event.data.object as StripeSubscriptionFull;
	const customerId =
		typeof subscription.customer === "string"
			? subscription.customer
			: subscription.customer?.id;

	const customer = await getStripeClient().customers.retrieve(customerId);
	const userId =
		subscription.metadata.user_id ||
		(customer.deleted ? undefined : customer.metadata?.user_id);

	if (!userId) {
		logger.warn("Subscription update missing user_id in metadata", {
			subscriptionId: subscription.id,
			customerId,
		});
		return; // Return success to avoid Stripe webhook retries
	}

	const priceId = subscription.items.data[0]?.price.id;
	const tier = getTierFromPriceId(priceId);

	const supabase = getServiceClient();

	// Update subscription record
	const { error: subError } = await supabase
		.from("subscriptions")
		.update({
			tier,
			status: subscription.status as
				| "trialing"
				| "active"
				| "past_due"
				| "canceled"
				| "unpaid",
			current_period_start: new Date(
				subscription.current_period_start * 1000,
			).toISOString(),
			current_period_end: new Date(
				subscription.current_period_end * 1000,
			).toISOString(),
			cancel_at_period_end: subscription.cancel_at_period_end,
			canceled_at: subscription.canceled_at
				? new Date(subscription.canceled_at * 1000).toISOString()
				: null,
			updated_at: new Date().toISOString(),
		})
		.eq("stripe_subscription_id", subscription.id);

	if (subError) {
		const error = new Error(`Failed to update subscription: ${subError.message}`);
		logger.error("Subscription update failed", error, {
			subscriptionId: subscription.id,
			userId,
			status: subscription.status,
			tier,
		});
		Sentry.captureException(error);
		throw error;
	}

	// Update api_keys tier if status is active
	if (subscription.status === "active") {
		const { error: keyError } = await supabase
			.from("api_keys")
			.update({ tier })
			.eq("user_id", userId);

		if (keyError) {
			const error = new Error(`Failed to update API key tier: ${keyError.message}`);
			logger.error("API key tier update failed in subscription update", error, {
				userId,
				tier,
				subscriptionId: subscription.id,
			});
			Sentry.captureException(error);
			throw error;
		}
	}

	logger.info("Subscription updated", {
		subscriptionId: subscription.id,
		userId,
		status: subscription.status,
		tier,
		isActive: subscription.status === "active",
	});
}

/**
 * Handle customer.subscription.deleted event.
 * Marks subscription as canceled and downgrades tier to free.
 *
 * @param event - Stripe customer.subscription.deleted event
 */
export async function handleSubscriptionDeleted(
	event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<void> {
	const subscription = event.data.object;
	const customerId =
		typeof subscription.customer === "string"
			? subscription.customer
			: subscription.customer?.id;

	const customer = await getStripeClient().customers.retrieve(customerId);
	const userId =
		subscription.metadata.user_id ||
		(customer.deleted ? undefined : customer.metadata?.user_id);

	if (!userId) {
		logger.warn("Subscription deletion missing user_id in metadata", {
			subscriptionId: subscription.id,
			customerId,
		});
		return; // Return success to avoid Stripe webhook retries
	}

	const supabase = getServiceClient();

	// Update subscription status to canceled
	const { error: subError } = await supabase
		.from("subscriptions")
		.update({
			status: "canceled",
			canceled_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("stripe_subscription_id", subscription.id);

	if (subError) {
		const error = new Error(`Failed to update subscription: ${subError.message}`);
		logger.error("Subscription cancellation update failed", error, {
			subscriptionId: subscription.id,
			userId,
		});
		Sentry.captureException(error);
		throw error;
	}

	// Downgrade api_keys tier to free
	const { error: keyError } = await supabase
		.from("api_keys")
		.update({ tier: "free" as Tier })
		.eq("user_id", userId);

	if (keyError) {
		const error = new Error(`Failed to downgrade API key tier: ${keyError.message}`);
		logger.error("API key downgrade failed in subscription deletion", error, {
			userId,
			subscriptionId: subscription.id,
		});
		Sentry.captureException(error);
		throw error;
	}

	logger.info("Subscription canceled and tier downgraded", {
		subscriptionId: subscription.id,
		userId,
		newTier: "free",
	});
}

/**
 * Map Stripe price ID to subscription tier.
 *
 * @param priceId - Stripe price ID from subscription
 * @returns Tier corresponding to price ID
 */
function getTierFromPriceId(priceId: string | undefined): Tier {
	const soloPriceId = process.env.STRIPE_SOLO_PRICE_ID;
	const teamPriceId = process.env.STRIPE_TEAM_PRICE_ID;

	if (priceId === soloPriceId) {
		return "solo";
	}
	if (priceId === teamPriceId) {
		return "team";
	}

	// Default to free if price ID doesn't match
	return "free";
}
