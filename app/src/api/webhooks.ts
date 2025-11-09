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
	// Access subscription field which Stripe SDK types don't fully expose
	const subscriptionRef = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription;
	const subscriptionId =
		typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
	const customerId =
		typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

	if (!subscriptionId || !customerId) {
		process.stderr.write("Invoice has no subscription or customer ID, skipping\n");
		return;
	}

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

	// Upsert subscription record
	const { error: subError } = await supabase
		.from("subscriptions")
		.upsert(
			{
				user_id: userId,
				stripe_customer_id: customerId,
				stripe_subscription_id: subscriptionId,
				tier,
				status: "active" as const,
				current_period_start: new Date(
					subscription.current_period_start * 1000,
				).toISOString(),
				current_period_end: new Date(
					subscription.current_period_end * 1000,
				).toISOString(),
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
			`Checkout session ${session.id} has no user_id in subscription or customer metadata, skipping (subscription: ${subscriptionId})\n`,
		);
		return; // Return success to avoid Stripe webhook retries
	}

	// Determine tier from price ID
	const priceId = subscription.items.data[0]?.price.id;
	const tier = getTierFromPriceId(priceId);

	const supabase = getServiceClient();

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
				current_period_start: new Date(
					subscription.current_period_start * 1000,
				).toISOString(),
				current_period_end: new Date(
					subscription.current_period_end * 1000,
				).toISOString(),
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
