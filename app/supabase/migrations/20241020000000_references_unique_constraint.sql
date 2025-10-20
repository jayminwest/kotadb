-- Add unique constraint for references table to support upsert on re-indexing
-- Also update reference_type check constraint to include property_access and type_reference

-- Drop existing check constraint
ALTER TABLE "references" DROP CONSTRAINT IF EXISTS references_reference_type_check;

-- Add updated check constraint with new reference types
ALTER TABLE "references" ADD CONSTRAINT references_reference_type_check
    CHECK (reference_type IN ('import', 'call', 'property_access', 'type_reference', 'extends', 'implements'));

-- Add unique constraint for upsert conflict resolution
-- Multiple references can exist at the same line if they have different types
-- For precise deduplication, we would need column_number, but Supabase upsert doesn't support
-- JSONB path syntax in onConflict, so we use a hash of metadata as a workaround
CREATE UNIQUE INDEX IF NOT EXISTS idx_references_upsert_key
    ON "references"(source_file_id, line_number, md5(metadata::text), reference_type);
