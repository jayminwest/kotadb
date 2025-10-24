-- Migration: 012_subscriptions
-- Description: Add subscriptions table for Stripe payment integration
-- Author: Claude Code
-- Date: 2025-10-23

-- ============================================================================
-- Subscription Management
-- ============================================================================

CREATE TABLE subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id text NOT NULL UNIQUE,
    stripe_subscription_id text UNIQUE,
    tier text NOT NULL CHECK (tier IN ('free', 'solo', 'team')),
    status text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    canceled_at timestamptz,
    trial_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE UNIQUE INDEX idx_subscriptions_user_id_unique ON subscriptions(user_id);

-- Authorization Note:
-- RLS is NOT enabled on this table because:
-- 1. Backend uses service role client which bypasses RLS
-- 2. All subscription endpoints (routes.ts) enforce authorization via explicit
--    WHERE user_id = context.userId filters (lines 424, 473, 504)
-- 3. Webhook handlers use service role for Stripe event processing
--
-- This design is consistent with other backend-only tables (api_keys, index_jobs)
-- where application-layer authorization is preferred over database-layer RLS.

-- ============================================================================
-- Migration Tracking
-- ============================================================================

INSERT INTO migrations (name) VALUES ('012_subscriptions');
