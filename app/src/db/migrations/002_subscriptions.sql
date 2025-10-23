-- Migration: 002_subscriptions
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

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON subscriptions
    FOR SELECT
    USING (user_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY subscriptions_insert ON subscriptions
    FOR INSERT
    WITH CHECK (user_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY subscriptions_update ON subscriptions
    FOR UPDATE
    USING (user_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY subscriptions_delete ON subscriptions
    FOR DELETE
    USING (user_id = (current_setting('app.user_id', true))::uuid);

-- ============================================================================
-- Migration Tracking
-- ============================================================================

INSERT INTO migrations (name) VALUES ('002_subscriptions');
