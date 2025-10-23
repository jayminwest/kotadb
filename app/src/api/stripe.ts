/**
 * Stripe client initialization and helper functions.
 *
 * This module provides a singleton Stripe instance configured with
 * the secret key from environment variables.
 */

import Stripe from "stripe";

/**
 * Singleton Stripe client instance.
 * Initialized with secret key from STRIPE_SECRET_KEY environment variable.
 */
let stripeInstance: Stripe | null = null;

/**
 * Get or create the Stripe client instance.
 * Throws error if STRIPE_SECRET_KEY is not configured.
 */
export function getStripeClient(): Stripe {
	if (!stripeInstance) {
		const secretKey = process.env.STRIPE_SECRET_KEY;
		if (!secretKey) {
			throw new Error(
				"STRIPE_SECRET_KEY environment variable is not configured",
			);
		}

		stripeInstance = new Stripe(secretKey, {
			apiVersion: "2025-09-30.clover",
			typescript: true,
		});
	}

	return stripeInstance;
}

/**
 * Price IDs for subscription tiers.
 * These should be configured in Stripe dashboard and set via environment variables.
 */
export const STRIPE_PRICE_IDS = {
	solo: process.env.STRIPE_SOLO_PRICE_ID || "",
	team: process.env.STRIPE_TEAM_PRICE_ID || "",
} as const;

/**
 * Validate that required Stripe price IDs are configured.
 * Throws error if any price ID is missing.
 */
export function validateStripePriceIds(): void {
	if (!STRIPE_PRICE_IDS.solo) {
		throw new Error(
			"STRIPE_SOLO_PRICE_ID environment variable is not configured",
		);
	}
	if (!STRIPE_PRICE_IDS.team) {
		throw new Error(
			"STRIPE_TEAM_PRICE_ID environment variable is not configured",
		);
	}
}
