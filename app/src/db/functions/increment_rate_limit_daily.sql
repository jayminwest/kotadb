-- Atomic daily rate limit increment function
-- Returns: { request_count, day_start, daily_limit, remaining, reset_at }
-- Usage: SELECT increment_rate_limit_daily('test_key_abc123', 5000);

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
