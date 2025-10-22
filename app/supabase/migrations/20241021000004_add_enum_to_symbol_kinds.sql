-- Migration: Add 'enum' to symbols.kind CHECK constraint
-- Epic: #234 (Job Queue & Background Processing)
-- Issue: #237 (Indexing worker with retry logic)
--
-- The symbol-extractor.ts module extracts TypeScript enums, but the symbols table
-- CHECK constraint did not include 'enum' as a valid kind, causing constraint violations
-- during worker execution.
--
-- This migration updates the CHECK constraint to include 'enum' as a valid symbol kind.

-- Drop existing CHECK constraint
ALTER TABLE symbols DROP CONSTRAINT IF EXISTS symbols_kind_check;

-- Add new CHECK constraint with 'enum' included
ALTER TABLE symbols ADD CONSTRAINT symbols_kind_check
    CHECK (kind IN ('function', 'class', 'interface', 'type', 'variable', 'constant', 'method', 'property', 'enum'));
