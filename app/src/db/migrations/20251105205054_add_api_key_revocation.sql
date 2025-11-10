-- Add revoked_at column to api_keys table for soft delete support
ALTER TABLE api_keys
ADD COLUMN revoked_at TIMESTAMPTZ;

-- Create partial index for query performance on revoked keys
CREATE INDEX idx_api_keys_revoked_at ON api_keys(revoked_at)
WHERE revoked_at IS NOT NULL;
