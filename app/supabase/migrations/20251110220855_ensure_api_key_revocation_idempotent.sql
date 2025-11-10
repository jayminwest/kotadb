-- Ensure API key revocation column exists (idempotent fix for migration drift)
-- This migration ensures the revoked_at column exists regardless of which version
-- of the add_api_key_revocation migration was previously applied
-- (20251105205054 in source vs 20251105230821 in some environments)

ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Create partial index for query performance on revoked keys
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys(revoked_at)
WHERE revoked_at IS NOT NULL;
