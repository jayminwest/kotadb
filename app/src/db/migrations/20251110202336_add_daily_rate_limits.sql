-- Add daily rate limit tracking
-- Part of #423: increase rate limits and add daily quotas

-- ============================================================================
-- Daily Rate Limit Counters
-- ============================================================================

-- Rate Limit Counters (Daily): Track API usage per key per day
-- Mirrors hourly rate_limit_counters structure for consistent dual-limit enforcement
-- Note: No FK constraint on key_id to allow counters to persist after key deletion for auditing
CREATE TABLE rate_limit_counters_daily (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id text NOT NULL,
    day_start timestamptz NOT NULL,  -- Start of UTC day
    request_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(key_id, day_start)
);

CREATE INDEX idx_rate_limit_counters_daily_key_id ON rate_limit_counters_daily(key_id);
CREATE INDEX idx_rate_limit_counters_daily_day ON rate_limit_counters_daily(day_start);

-- ============================================================================
-- Daily Rate Limit Function
-- ============================================================================

-- Atomic daily rate limit increment function
-- Returns: { request_count, day_start, daily_limit, remaining, reset_at }
CREATE OR REPLACE FUNCTION increment_rate_limit_daily(
    p_key_id text,
    p_daily_limit integer
) RETURNS jsonb AS $$
DECLARE
    v_day_start timestamptz;
    v_request_count integer;
BEGIN
    -- Calculate current daily window (UTC midnight)
    v_day_start := date_trunc('day', now());

    -- Atomic insert or update
    INSERT INTO rate_limit_counters_daily (key_id, day_start, request_count)
    VALUES (p_key_id, v_day_start, 1)
    ON CONFLICT (key_id, day_start)
    DO UPDATE SET request_count = rate_limit_counters_daily.request_count + 1
    RETURNING request_count INTO v_request_count;

    -- Return current state
    RETURN jsonb_build_object(
        'request_count', v_request_count,
        'day_start', v_day_start,
        'daily_limit', p_daily_limit,
        'remaining', GREATEST(0, p_daily_limit - v_request_count),
        'reset_at', v_day_start + interval '1 day'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_rate_limit_daily(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_rate_limit_daily(text, integer) TO service_role;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE rate_limit_counters_daily ENABLE ROW LEVEL SECURITY;

-- Service role can access all daily counters (for rate limit enforcement)
CREATE POLICY "Service role can access all daily counters"
    ON rate_limit_counters_daily
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can only view their own daily counters
-- (Not currently used, but mirrors hourly table pattern for consistency)
CREATE POLICY "Users can view own daily counters"
    ON rate_limit_counters_daily
    FOR SELECT
    TO authenticated
    USING (key_id IN (
        SELECT key_id FROM api_keys WHERE user_id = auth.uid()
    ));
