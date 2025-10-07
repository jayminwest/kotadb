-- Atomic rate limit increment function
-- Returns: { request_count, window_start, rate_limit }
-- Usage: SELECT increment_rate_limit('test_key_abc123', 100);

CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_key_id text,
    p_rate_limit integer
) RETURNS jsonb AS $$
DECLARE
    v_window_start timestamptz;
    v_request_count integer;
BEGIN
    -- Calculate current hourly window
    v_window_start := date_trunc('hour', now());

    -- Atomic insert or update
    INSERT INTO rate_limit_counters (key_id, window_start, request_count)
    VALUES (p_key_id, v_window_start, 1)
    ON CONFLICT (key_id, window_start)
    DO UPDATE SET request_count = rate_limit_counters.request_count + 1
    RETURNING request_count INTO v_request_count;

    -- Return current state
    RETURN jsonb_build_object(
        'request_count', v_request_count,
        'window_start', v_window_start,
        'rate_limit', p_rate_limit,
        'remaining', GREATEST(0, p_rate_limit - v_request_count),
        'reset_at', v_window_start + interval '1 hour'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_rate_limit(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_rate_limit(text, integer) TO service_role;
