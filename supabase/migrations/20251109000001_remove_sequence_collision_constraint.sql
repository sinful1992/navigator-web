-- Remove sequence-based uniqueness constraint that causes collisions
--
-- Root cause: Client-side sequence generation creates collisions when multiple
-- devices generate the same sequence number independently
--
-- Solution: Use timestamp + operation_id for ordering instead of sequence
--
-- Idempotency is already handled by UNIQUE(user_id, operation_id)

-- Remove the problematic constraint
ALTER TABLE public.navigator_operations
    DROP CONSTRAINT IF EXISTS navigator_operations_user_sequence_unique;

-- Make sequence_number nullable (optional field for diagnostics)
ALTER TABLE public.navigator_operations
    ALTER COLUMN sequence_number DROP NOT NULL;

-- Add composite index for timestamp-based ordering
-- This replaces sequence-based ordering with chronological ordering
CREATE INDEX IF NOT EXISTS idx_navigator_operations_user_timestamp_id
    ON public.navigator_operations(user_id, timestamp, operation_id);

-- Update table comment
COMMENT ON TABLE public.navigator_operations IS 'Delta sync operation log - uses timestamp+operation_id for ordering (not sequence)';

-- Update sequence_number comment
COMMENT ON COLUMN public.navigator_operations.sequence_number IS 'Legacy sequence number (optional, for diagnostics only - do not use for uniqueness)';
