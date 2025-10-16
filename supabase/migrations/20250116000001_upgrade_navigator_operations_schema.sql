-- Upgrade navigator_operations table schema for delta sync
-- This migration updates the table structure to support the new operation-based sync system

-- First, check if we need to add the new columns
DO $$
BEGIN
    -- Add sequence_number if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'navigator_operations' AND column_name = 'sequence_number'
    ) THEN
        ALTER TABLE public.navigator_operations
        ADD COLUMN sequence_number BIGINT;
    END IF;

    -- Add operation_type if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'navigator_operations' AND column_name = 'operation_type'
    ) THEN
        ALTER TABLE public.navigator_operations
        ADD COLUMN operation_type TEXT;
    END IF;

    -- Add operation_data if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'navigator_operations' AND column_name = 'operation_data'
    ) THEN
        ALTER TABLE public.navigator_operations
        ADD COLUMN operation_data JSONB;
    END IF;

    -- Add client_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'navigator_operations' AND column_name = 'client_id'
    ) THEN
        ALTER TABLE public.navigator_operations
        ADD COLUMN client_id TEXT;
    END IF;

    -- Add server_timestamp if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'navigator_operations' AND column_name = 'server_timestamp'
    ) THEN
        ALTER TABLE public.navigator_operations
        ADD COLUMN server_timestamp TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- Add applied if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'navigator_operations' AND column_name = 'applied'
    ) THEN
        ALTER TABLE public.navigator_operations
        ADD COLUMN applied BOOLEAN DEFAULT FALSE;
    END IF;
END$$;

-- Migrate existing data from old schema to new schema
-- Use ROW_NUMBER() to ensure unique sequences (prevents collisions from duplicate timestamps)
WITH numbered_ops AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp, id) as new_sequence,
    type,
    operation_id,
    device_id,
    timestamp,
    created_at,
    entity,
    entity_id,
    data
  FROM public.navigator_operations
  WHERE sequence_number IS NULL OR operation_type IS NULL OR operation_data IS NULL
)
UPDATE public.navigator_operations ops
SET
    sequence_number = COALESCE(ops.sequence_number, numbered_ops.new_sequence),
    operation_type = COALESCE(ops.operation_type, numbered_ops.type),
    operation_data = COALESCE(ops.operation_data, jsonb_build_object(
        'id', numbered_ops.operation_id,
        'type', numbered_ops.type,
        'timestamp', numbered_ops.timestamp::text,
        'clientId', COALESCE(numbered_ops.device_id, 'legacy'),
        'sequence', numbered_ops.new_sequence,
        'payload', jsonb_build_object(
            'entity', numbered_ops.entity,
            'entityId', numbered_ops.entity_id,
            'data', numbered_ops.data
        )
    )),
    client_id = COALESCE(ops.client_id, numbered_ops.device_id, 'legacy'),
    server_timestamp = COALESCE(ops.server_timestamp, numbered_ops.created_at, NOW())
FROM numbered_ops
WHERE ops.id = numbered_ops.id;

-- Make new columns NOT NULL after migration
ALTER TABLE public.navigator_operations
    ALTER COLUMN sequence_number SET NOT NULL,
    ALTER COLUMN operation_type SET NOT NULL,
    ALTER COLUMN operation_data SET NOT NULL,
    ALTER COLUMN client_id SET NOT NULL;

-- Drop old columns if they exist (but only if new columns have data)
-- We'll keep them for now for backwards compatibility
-- Uncomment these when ready to fully migrate:
-- ALTER TABLE public.navigator_operations DROP COLUMN IF EXISTS type;
-- ALTER TABLE public.navigator_operations DROP COLUMN IF EXISTS entity;
-- ALTER TABLE public.navigator_operations DROP COLUMN IF EXISTS entity_id;

-- Drop existing constraints if they exist
ALTER TABLE public.navigator_operations
    DROP CONSTRAINT IF EXISTS navigator_operations_user_id_sequence_number_key;

-- Add unique constraints for the new schema
ALTER TABLE public.navigator_operations
    ADD CONSTRAINT navigator_operations_user_sequence_unique
    UNIQUE(user_id, sequence_number);

-- Create indexes for performance (drop if exists first)
DROP INDEX IF EXISTS idx_navigator_operations_user_sequence;
DROP INDEX IF EXISTS idx_navigator_operations_user_timestamp;
DROP INDEX IF EXISTS idx_navigator_operations_type;

CREATE INDEX idx_navigator_operations_user_sequence
    ON public.navigator_operations(user_id, sequence_number);

CREATE INDEX idx_navigator_operations_user_timestamp
    ON public.navigator_operations(user_id, timestamp);

CREATE INDEX idx_navigator_operations_type
    ON public.navigator_operations(user_id, operation_type);

-- Add comments
COMMENT ON COLUMN public.navigator_operations.sequence_number IS 'Sequential operation number per user for ordering';
COMMENT ON COLUMN public.navigator_operations.operation_type IS 'Type of operation (COMPLETION_CREATE, ADDRESS_ADD, etc.)';
COMMENT ON COLUMN public.navigator_operations.operation_data IS 'Full operation object including type, payload, timestamp';
COMMENT ON COLUMN public.navigator_operations.client_id IS 'Device/client that created this operation';
COMMENT ON COLUMN public.navigator_operations.server_timestamp IS 'Server timestamp when operation was received';
COMMENT ON COLUMN public.navigator_operations.applied IS 'Whether this operation has been applied to state (for conflict resolution)';

-- Update table comment
COMMENT ON TABLE public.navigator_operations IS 'Delta sync operation log - stores individual operations for efficient syncing';
