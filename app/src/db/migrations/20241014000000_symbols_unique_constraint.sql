-- Migration: Add unique constraint to symbols table
-- Purpose: Enable upsert operations in storeSymbols() function
-- Context: The code in queries.ts uses onConflict: "file_id,name,line_start"
--          but this constraint was missing from the initial schema.
--          This prevents duplicate symbol entries during re-indexing.

ALTER TABLE symbols
ADD CONSTRAINT symbols_file_name_line_unique
UNIQUE (file_id, name, line_start);
