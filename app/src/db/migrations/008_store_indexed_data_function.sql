-- Migration: store_indexed_data function for atomic indexing worker storage
-- Epic: #234 (Job Queue & Background Processing)
-- Issue: #237 (Indexing worker with retry logic)
--
-- This migration creates a Postgres function that atomically stores indexed data from
-- the background worker. The function uses transactions to ensure consistency when storing
-- files, symbols, references, and dependency graph entries.
--
-- Design decisions:
-- - Idempotent DELETE + INSERT pattern for retry safety (handles duplicate job execution)
-- - Single transaction for all inserts (atomicity: all or nothing)
-- - Returns summary stats (files_indexed, symbols_extracted, etc.) for job tracking
-- - Uses RETURNING clauses for efficient ID mapping (file_id, symbol_id)

-- ============================================================================
-- Store Indexed Data Function
-- ============================================================================

CREATE OR REPLACE FUNCTION store_indexed_data(
    p_repository_id uuid,
    p_files jsonb,
    p_symbols jsonb,
    p_references jsonb,
    p_dependency_graph jsonb
) RETURNS jsonb AS $$
DECLARE
    v_files_indexed integer := 0;
    v_symbols_extracted integer := 0;
    v_references_found integer := 0;
    v_dependencies_extracted integer := 0;
    v_file record;
    v_symbol record;
    v_reference record;
    v_dependency record;
    v_file_id uuid;
    v_symbol_id uuid;
    v_file_id_map jsonb := '{}'::jsonb;
    v_symbol_id_map jsonb := '{}'::jsonb;
BEGIN
    -- Delete existing indexed data for this repository (idempotent for retries)
    DELETE FROM dependency_graph WHERE repository_id = p_repository_id;
    DELETE FROM references WHERE source_file_id IN (
        SELECT id FROM indexed_files WHERE repository_id = p_repository_id
    );
    DELETE FROM symbols WHERE file_id IN (
        SELECT id FROM indexed_files WHERE repository_id = p_repository_id
    );
    DELETE FROM indexed_files WHERE repository_id = p_repository_id;

    -- Insert indexed files
    FOR v_file IN SELECT * FROM jsonb_to_recordset(p_files) AS (
        path text,
        content text,
        language text,
        size_bytes integer,
        metadata jsonb
    ) LOOP
        INSERT INTO indexed_files (repository_id, path, content, language, size_bytes, metadata)
        VALUES (p_repository_id, v_file.path, v_file.content, v_file.language, v_file.size_bytes, COALESCE(v_file.metadata, '{}'::jsonb))
        RETURNING id INTO v_file_id;

        -- Store file path -> ID mapping for symbol/reference insertion
        v_file_id_map := jsonb_set(v_file_id_map, ARRAY[v_file.path], to_jsonb(v_file_id::text));
        v_files_indexed := v_files_indexed + 1;
    END LOOP;

    -- Insert symbols
    FOR v_symbol IN SELECT * FROM jsonb_to_recordset(p_symbols) AS (
        file_path text,
        name text,
        kind text,
        line_start integer,
        line_end integer,
        signature text,
        documentation text,
        metadata jsonb
    ) LOOP
        -- Lookup file_id from file_path
        v_file_id := (v_file_id_map->>v_symbol.file_path)::uuid;

        IF v_file_id IS NOT NULL THEN
            INSERT INTO symbols (file_id, name, kind, line_start, line_end, signature, documentation, metadata)
            VALUES (v_file_id, v_symbol.name, v_symbol.kind, v_symbol.line_start, v_symbol.line_end,
                    v_symbol.signature, v_symbol.documentation, COALESCE(v_symbol.metadata, '{}'::jsonb))
            RETURNING id INTO v_symbol_id;

            -- Store symbol key -> ID mapping for reference insertion
            -- Symbol key format: "file_path::symbol_name::line_start"
            v_symbol_id_map := jsonb_set(
                v_symbol_id_map,
                ARRAY[v_symbol.file_path || '::' || v_symbol.name || '::' || v_symbol.line_start::text],
                to_jsonb(v_symbol_id::text)
            );
            v_symbols_extracted := v_symbols_extracted + 1;
        END IF;
    END LOOP;

    -- Insert references
    FOR v_reference IN SELECT * FROM jsonb_to_recordset(p_references) AS (
        source_file_path text,
        target_symbol_key text,
        target_file_path text,
        line_number integer,
        reference_type text,
        metadata jsonb
    ) LOOP
        -- Lookup source file_id
        v_file_id := (v_file_id_map->>v_reference.source_file_path)::uuid;

        -- Lookup target symbol_id (nullable)
        v_symbol_id := (v_symbol_id_map->>v_reference.target_symbol_key)::uuid;

        IF v_file_id IS NOT NULL THEN
            INSERT INTO references (source_file_id, target_symbol_id, target_file_path, line_number, reference_type, metadata)
            VALUES (v_file_id, v_symbol_id, v_reference.target_file_path, v_reference.line_number,
                    v_reference.reference_type, COALESCE(v_reference.metadata, '{}'::jsonb));
            v_references_found := v_references_found + 1;
        END IF;
    END LOOP;

    -- Insert dependency graph entries
    FOR v_dependency IN SELECT * FROM jsonb_to_recordset(p_dependency_graph) AS (
        from_file_path text,
        to_file_path text,
        from_symbol_key text,
        to_symbol_key text,
        dependency_type text,
        metadata jsonb
    ) LOOP
        DECLARE
            v_from_file_id uuid;
            v_to_file_id uuid;
            v_from_symbol_id uuid;
            v_to_symbol_id uuid;
        BEGIN
            -- Lookup file IDs
            v_from_file_id := (v_file_id_map->>v_dependency.from_file_path)::uuid;
            v_to_file_id := (v_file_id_map->>v_dependency.to_file_path)::uuid;

            -- Lookup symbol IDs (nullable)
            v_from_symbol_id := (v_symbol_id_map->>v_dependency.from_symbol_key)::uuid;
            v_to_symbol_id := (v_symbol_id_map->>v_dependency.to_symbol_key)::uuid;

            -- Insert if at least one dependency relationship exists
            IF (v_from_file_id IS NOT NULL AND v_to_file_id IS NOT NULL) OR
               (v_from_symbol_id IS NOT NULL AND v_to_symbol_id IS NOT NULL) THEN
                INSERT INTO dependency_graph (repository_id, from_file_id, to_file_id, from_symbol_id, to_symbol_id, dependency_type, metadata)
                VALUES (p_repository_id, v_from_file_id, v_to_file_id, v_from_symbol_id, v_to_symbol_id,
                        v_dependency.dependency_type, COALESCE(v_dependency.metadata, '{}'::jsonb));
                v_dependencies_extracted := v_dependencies_extracted + 1;
            END IF;
        END;
    END LOOP;

    -- Return summary stats
    RETURN jsonb_build_object(
        'files_indexed', v_files_indexed,
        'symbols_extracted', v_symbols_extracted,
        'references_found', v_references_found,
        'dependencies_extracted', v_dependencies_extracted
    );
END;
$$ LANGUAGE plpgsql;
