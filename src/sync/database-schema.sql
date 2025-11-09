-- Database schema for operation-based sync
-- This replaces the monolithic navigator_state table with an operation log

-- NOTE: This table already existed in a different form and was updated manually
-- The actual migration steps used were:
--   1. Table already existed with: id, user_id, operation_id, type, entity, entity_id, data, device_id, timestamp, local_timestamp, created_at
--   2. Added missing columns with ALTER TABLE statements
--   3. Added constraints and indexes

-- Original table structure (for reference):
-- CREATE TABLE navigator_operations (
--   id uuid not null default gen_random_uuid (),
--   user_id uuid null,
--   operation_id text not null,
--   type text not null,
--   entity text not null,
--   entity_id text not null,
--   data jsonb null,
--   device_id text null,
--   timestamp timestamp with time zone not null,
--   local_timestamp timestamp with time zone not null,
--   created_at timestamp with time zone null default now()
-- );

-- Updated table schema for operation-based sync:
-- Operations table - stores individual operations instead of full state
CREATE TABLE navigator_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL, -- Client-generated operation ID
  sequence_number BIGINT, -- Legacy field (nullable, for diagnostics only)
  operation_type TEXT NOT NULL, -- 'COMPLETION_CREATE', 'ADDRESS_ADD', etc.
  operation_data JSONB NOT NULL, -- Full operation object
  client_id TEXT NOT NULL, -- Which device created this operation
  timestamp TIMESTAMPTZ NOT NULL, -- Primary ordering field
  server_timestamp TIMESTAMPTZ DEFAULT NOW(),
  applied BOOLEAN DEFAULT FALSE, -- For future use in conflict resolution

  -- Constraints
  UNIQUE(user_id, operation_id) -- Prevent duplicate operations (idempotency)
  -- Note: sequence_number is now nullable and NOT unique (legacy field for diagnostics only)
);

-- Indexes for performance (timestamp-based sync)
CREATE INDEX idx_navigator_operations_user_timestamp_id
ON navigator_operations(user_id, timestamp, operation_id);

CREATE INDEX idx_navigator_operations_type
ON navigator_operations(user_id, operation_type);

-- Enable real-time subscriptions
ALTER TABLE navigator_operations ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only access their own operations
CREATE POLICY "Users can access own operations" ON navigator_operations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- Function to get operations since a timestamp
CREATE OR REPLACE FUNCTION get_operations_since(
  target_user_id UUID,
  since_timestamp TIMESTAMPTZ DEFAULT '1970-01-01'::timestamptz
)
RETURNS TABLE (
  operation_data JSONB,
  sequence_number BIGINT,
  timestamp TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    operation_data,
    sequence_number,
    timestamp
  FROM navigator_operations
  WHERE user_id = target_user_id
    AND timestamp > since_timestamp
  ORDER BY timestamp ASC, operation_id ASC;
$$;

-- Function to reconstruct current state from operations
CREATE OR REPLACE FUNCTION get_current_state(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result JSONB;
  op RECORD;
  initial_state JSONB := '{
    "addresses": [],
    "activeIndex": null,
    "completions": [],
    "daySessions": [],
    "arrangements": [],
    "currentListVersion": 1,
    "subscription": null,
    "reminderSettings": {
      "enabled": false,
      "agentName": "Navigator Assistant",
      "agentPersonality": "professional"
    },
    "reminderNotifications": []
  }';
BEGIN
  -- Start with initial state
  result := initial_state;

  -- Apply operations in chronological order
  FOR op IN
    SELECT operation_data
    FROM navigator_operations
    WHERE user_id = target_user_id
    ORDER BY timestamp ASC, operation_id ASC
  LOOP
    -- Here you would apply each operation to transform the state
    -- For now, we'll just return the operations for client-side processing
    -- In a production system, you'd implement the state transformations in SQL
  END LOOP;

  RETURN result;
END;
$$;

-- Migration script to convert existing state-based data to operations
-- This should be run once to migrate existing users
CREATE OR REPLACE FUNCTION migrate_state_to_operations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  state_record RECORD;
  operation_data JSONB;
  seq_num BIGINT := 0;
  migrated_count INTEGER := 0;
BEGIN
  -- Loop through existing navigator_state records
  FOR state_record IN
    SELECT user_id, data, updated_at
    FROM navigator_state
    WHERE data IS NOT NULL
  LOOP
    seq_num := seq_num + 1;

    -- Create a bulk import operation for the existing state
    operation_data := jsonb_build_object(
      'id', 'migration_' || state_record.user_id || '_' || seq_num,
      'type', 'STATE_MIGRATION',
      'timestamp', state_record.updated_at,
      'clientId', 'migration_script',
      'sequence', seq_num,
      'payload', jsonb_build_object(
        'fullState', state_record.data
      )
    );

    -- Insert the migration operation
    INSERT INTO navigator_operations (
      user_id,
      operation_id,
      sequence_number,
      operation_type,
      operation_data,
      client_id,
      timestamp
    ) VALUES (
      state_record.user_id,
      'migration_' || state_record.user_id || '_' || seq_num,
      seq_num,
      'STATE_MIGRATION',
      operation_data,
      'migration_script',
      state_record.updated_at
    );

    migrated_count := migrated_count + 1;
  END LOOP;

  RETURN migrated_count;
END;
$$;

-- Cleanup function to remove old operations (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_operations(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete operations older than specified days
  DELETE FROM navigator_operations
  WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant necessary permissions
GRANT ALL ON navigator_operations TO authenticated;
GRANT EXECUTE ON FUNCTION get_operations_since TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_state TO authenticated;