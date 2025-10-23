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
 * Verify Stripe webhook signature.
 * Returns the constructed event if signature is valid.
 *
 * @param rawBody - Raw request body as string
 * @param signature - Stripe signature from stripe-signature header
 * @returns Constructed Stripe event
 * @throws Error if signature verification fails
 */
export function verifyWebhookSignature(
	rawBody: string,
	signature: string,
): Stripe.Event {
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) {
		throw new Error(
			"STRIPE_WEBHOOK_SECRET environment variable is not configured",
		);
	}

	const stripe = getStripeClient();

	try {
		return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
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
	const invoice = event.data.object as any;
	const subscriptionId =
		typeof invoice.subscription === "string"
			? invoice.subscription
			: invoice.subscription?.id;
	const customerId =
		typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

	if (!subscriptionId || !customerId) {
		console.warn("Invoice has no subscription or customer ID, skipping");
		return;
	}

	const stripe = getStripeClient();
	const subscription = (await stripe.subscriptions.retrieve(
		subscriptionId,
	)) as any;

	// Get user_id from subscription metadata or customer metadata
	const userId =
		subscription.metadata.user_id ||
		((await stripe.customers.retrieve(customerId)) as Stripe.Customer).metadata
			?.user_id;

	if (!userId) {
		throw new Error(
			`No user_id found in subscription or customer metadata for subscription ${subscriptionId}`,
		);
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
					(subscription.current_period_start as number) * 1000,
				).toISOString(),
				current_period_end: new Date(
					(subscription.current_period_end as number) * 1000,
				).toISOString(),
				cancel_at_period_end: subscription.cancel_at_period_end,
				trial_end: subscription.trial_end
					? new Date((subscription.trial_end as number) * 1000).toISOString()
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

	console.log(
		`Subscription ${subscriptionId} activated for user ${userId} (tier: ${tier})`,
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
	const subscription = event.data.object as any;
	const customerId =
		typeof subscription.customer === "string"
			? subscription.customer
			: subscription.customer?.id;
	const userId =
		subscription.metadata.user_id ||
		((await getStripeClient().customers.retrieve(
			customerId,
		)) as Stripe.Customer).metadata?.user_id;

	if (!userId) {
		throw new Error(
			`No user_id found in subscription metadata for subscription ${subscription.id}`,
		);
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
				(subscription.current_period_start as number) * 1000,
			).toISOString(),
			current_period_end: new Date(
				(subscription.current_period_end as number) * 1000,
			).toISOString(),
			cancel_at_period_end: subscription.cancel_at_period_end,
			canceled_at: subscription.canceled_at
				? new Date((subscription.canceled_at as number) * 1000).toISOString()
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

	console.log(
		`Subscription ${subscription.id} updated for user ${userId} (status: ${subscription.status}, tier: ${tier})`,
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
	const subscription = event.data.object as any;
	const customerId =
		typeof subscription.customer === "string"
			? subscription.customer
			: subscription.customer?.id;
	const userId =
		subscription.metadata.user_id ||
		((await getStripeClient().customers.retrieve(
			customerId,
		)) as Stripe.Customer).metadata?.user_id;

	if (!userId) {
		throw new Error(
			`No user_id found in subscription metadata for subscription ${subscription.id}`,
		);
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

	console.log(`Subscription ${subscription.id} canceled for user ${userId}`);
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
