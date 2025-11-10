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
		throw new Error(
			"STRIPE_WEBHOOK_SECRET environment variable is not configured",
		);
	}

	const stripe = getStripeClient();

	try {
		return await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
	} catch (err) {
		const error = err as Error;
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
		process.stderr.write(
			`Invoice ${invoice.id} has no subscription or customer ID, skipping\n`
		);
		return;
	}

	const invoiceLines = (invoice as any).lines;
	if (!invoiceLines || !invoiceLines.data || invoiceLines.data.length === 0) {
		process.stderr.write(
			`Invoice ${invoice.id} has no line items, skipping\n`
		);
		return;
	}

	const lineItem = invoiceLines.data[0];
	if (!lineItem?.period) {
		process.stderr.write(
			`Invoice ${invoice.id} line item has no period data, skipping\n`
		);
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
		process.stderr.write(
			`Invoice ${invoice.id} has no user_id in subscription or customer metadata, skipping (subscription: ${subscriptionId})\n`,
		);
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
		throw new Error(`Failed to upsert subscription: ${subError.message}`);
	}

	// Update api_keys tier
	const { error: keyError } = await supabase
		.from("api_keys")
		.update({ tier })
		.eq("user_id", userId);

	if (keyError) {
		throw new Error(`Failed to update API key tier: ${keyError.message}`);
	}

	process.stdout.write(
		`Subscription ${subscriptionId} activated for user ${userId} (tier: ${tier})\n`,
	);
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
		process.stderr.write(
			"Checkout session has no subscription or customer ID, skipping\n",
		);
		return;
	}

	const stripe = getStripeClient();
	process.stdout.write(`[Webhook] Retrieving subscription: ${subscriptionId}\n`);
	const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;
	process.stdout.write(`[Webhook] Subscription status: ${subscription.status}, current_period_start: ${(subscription as any).current_period_start}, current_period_end: ${(subscription as any).current_period_end}\n`);

	// Get user_id from subscription metadata or customer metadata
	const customer = await stripe.customers.retrieve(customerId);
	process.stdout.write(`[Webhook] Customer retrieved, checking metadata\n`);
	const userId =
		subscription.metadata?.user_id ||
		(customer.deleted ? undefined : customer.metadata?.user_id);
	process.stdout.write(`[Webhook] user_id extracted: ${userId || 'NOT FOUND'}\n`);

	if (!userId) {
		process.stderr.write(
			`Checkout session ${session.id} has no user_id in subscription or customer metadata, skipping (subscription: ${subscriptionId})\n`,
		);
		return; // Return success to avoid Stripe webhook retries
	}

	// Determine tier from price ID
	const priceId = subscription.items.data[0]?.price.id;
	const tier = getTierFromPriceId(priceId);

	const supabase = getServiceClient();

	process.stdout.write(`[Webhook] Upserting subscription for user ${userId}\n`);

	// Access period fields (Stripe SDK types don't include these but they exist at runtime)
	const currentPeriodStart = (subscription as any).current_period_start;
	const currentPeriodEnd = (subscription as any).current_period_end;
	const cancelAtPeriodEnd = (subscription as any).cancel_at_period_end;
	const trialEnd = (subscription as any).trial_end;

	// If period fields are undefined, skip checkout handler and rely on invoice.paid event
	// This happens when checkout.session.completed fires before subscription is fully initialized
	if (!currentPeriodStart || !currentPeriodEnd) {
		process.stdout.write(
			`[Webhook] Subscription ${subscriptionId} (status: ${subscription.status}) missing billing period data. ` +
			`Skipping checkout handler, will process via invoice.paid event. ` +
			`(start: ${currentPeriodStart}, end: ${currentPeriodEnd})\n`
		);
		return; // Return success to avoid Stripe retries
	}

	// Validate timestamp types
	if (typeof currentPeriodStart !== 'number' || typeof currentPeriodEnd !== 'number') {
		process.stdout.write(
			`[Webhook] Subscription ${subscriptionId} has invalid period types ` +
			`(start: ${typeof currentPeriodStart}, end: ${typeof currentPeriodEnd}). ` +
			`Skipping checkout handler, will process via invoice.paid event.\n`
		);
		return;
	}

	// Convert Unix timestamps to Date objects
	const periodStart = new Date(currentPeriodStart * 1000);
	const periodEnd = new Date(currentPeriodEnd * 1000);

	// Validate Date objects are valid
	if (Number.isNaN(periodStart.getTime())) {
		throw new Error(`Invalid Date created from current_period_start: ${currentPeriodStart}`);
	}
	if (Number.isNaN(periodEnd.getTime())) {
		throw new Error(`Invalid Date created from current_period_end: ${currentPeriodEnd}`);
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
		throw new Error(`Failed to upsert subscription: ${subError.message}`);
	}

	// Update ALL api_keys tier for this user (not just primary key)
	const { error: keyError } = await supabase
		.from("api_keys")
		.update({ tier })
		.eq("user_id", userId);

	if (keyError) {
		throw new Error(`Failed to update API key tier: ${keyError.message}`);
	}

	process.stdout.write(
		`Subscription ${subscriptionId} created for user ${userId} (tier: ${tier})\n`,
	);
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
		process.stderr.write(
			`Subscription update event has no user_id in metadata, skipping (subscription: ${subscription.id})\n`,
		);
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
		throw new Error(`Failed to update subscription: ${subError.message}`);
	}

	// Update api_keys tier if status is active
	if (subscription.status === "active") {
		const { error: keyError } = await supabase
			.from("api_keys")
			.update({ tier })
			.eq("user_id", userId);

		if (keyError) {
			throw new Error(`Failed to update API key tier: ${keyError.message}`);
		}
	}

	process.stdout.write(
		`Subscription ${subscription.id} updated for user ${userId} (status: ${subscription.status}, tier: ${tier})\n`,
	);
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
		process.stderr.write(
			`Subscription deleted event has no user_id in metadata, skipping (subscription: ${subscription.id})\n`,
		);
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
		throw new Error(`Failed to update subscription: ${subError.message}`);
	}

	// Downgrade api_keys tier to free
	const { error: keyError } = await supabase
		.from("api_keys")
		.update({ tier: "free" as Tier })
		.eq("user_id", userId);

	if (keyError) {
		throw new Error(`Failed to downgrade API key tier: ${keyError.message}`);
	}

	process.stdout.write(`Subscription ${subscription.id} canceled for user ${userId}\n`);
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
