-- Migration: 007_add_rls_context_functions
-- Description: Add RPC functions for setting and clearing RLS context
-- Author: Claude Code
-- Date: 2025-10-21

-- ============================================================================
-- RLS Context Management Functions
-- ============================================================================

/**
 * Set RLS context for user-scoped queries.
 * Sets the app.user_id session variable for RLS policy enforcement.
 *
 * IMPORTANT: This uses SET LOCAL (transaction-scoped) to prevent
 * context bleed between requests. The variable is automatically
 * cleared when the transaction ends.
 *
 * @param user_id - User UUID to set as context
 * @returns void
 */
CREATE OR REPLACE FUNCTION set_user_context(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use SET LOCAL for transaction-scoped variable (safer than SET)
    -- This ensures the variable is automatically cleared at transaction end
    PERFORM set_config('app.user_id', user_id::text, true);
END;
$$;

/**
 * Clear RLS context (reset app.user_id).
 * Called after queries complete to prevent context bleed.
 *
 * @returns void
 */
CREATE OR REPLACE FUNCTION clear_user_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Clear the user context by setting to NULL
    PERFORM set_config('app.user_id', NULL, true);
END;
$$;
