-- Add revoked_at column to api_keys table for soft delete support
-- Note: Made idempotent with IF NOT EXISTS to handle migration drift
-- (staging had migration 20251105230821 while source has 20251105205054)
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Create partial index for query performance on revoked keys
-- Note: IF NOT EXISTS ensures safe re-application in environments where column already exists
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys(revoked_at)
WHERE revoked_at IS NOT NULL;
