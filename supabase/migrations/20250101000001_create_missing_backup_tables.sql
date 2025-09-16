-- Create missing tables for backup functionality
-- This migration creates the essential tables that were referenced but never defined

-- Create navigator_state table for main app state syncing
CREATE TABLE IF NOT EXISTS public.navigator_state (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    checksum TEXT,
    device_id TEXT,
    PRIMARY KEY (user_id)
);

-- Create backups table for file backup tracking
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_key TEXT NOT NULL, -- Format: YYYY-MM-DD
    object_path TEXT NOT NULL, -- Path in Supabase Storage
    size_bytes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, object_path)
);

-- Create navigator_operations table for operation tracking (used by sync system)
CREATE TABLE IF NOT EXISTS public.navigator_operations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'create', 'update', 'delete'
    entity TEXT NOT NULL, -- 'completion', 'arrangement', etc.
    entity_id TEXT NOT NULL,
    data JSONB,
    device_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    local_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, operation_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS navigator_state_updated_at_idx ON public.navigator_state(updated_at);
CREATE INDEX IF NOT EXISTS backups_user_day_idx ON public.backups(user_id, day_key);
CREATE INDEX IF NOT EXISTS backups_created_at_idx ON public.backups(created_at DESC);
CREATE INDEX IF NOT EXISTS navigator_operations_user_timestamp_idx ON public.navigator_operations(user_id, timestamp DESC);

-- Enable RLS on all tables
ALTER TABLE public.navigator_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigator_operations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for navigator_state
DROP POLICY IF EXISTS "navigator_state_select_policy" ON public.navigator_state;
DROP POLICY IF EXISTS "navigator_state_insert_policy" ON public.navigator_state;
DROP POLICY IF EXISTS "navigator_state_update_policy" ON public.navigator_state;
DROP POLICY IF EXISTS "navigator_state_delete_policy" ON public.navigator_state;

CREATE POLICY "navigator_state_select_policy" ON public.navigator_state
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "navigator_state_insert_policy" ON public.navigator_state
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_state_update_policy" ON public.navigator_state
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_state_delete_policy" ON public.navigator_state
    FOR DELETE USING (user_id = (select auth.uid()));

-- Create RLS policies for backups
DROP POLICY IF EXISTS "backups_select_policy" ON public.backups;
DROP POLICY IF EXISTS "backups_insert_policy" ON public.backups;

CREATE POLICY "backups_select_policy" ON public.backups
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "backups_insert_policy" ON public.backups
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- Create RLS policies for navigator_operations
DROP POLICY IF EXISTS "navigator_operations_select_policy" ON public.navigator_operations;
DROP POLICY IF EXISTS "navigator_operations_insert_policy" ON public.navigator_operations;

CREATE POLICY "navigator_operations_select_policy" ON public.navigator_operations
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "navigator_operations_insert_policy" ON public.navigator_operations
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- Create Supabase Storage bucket for backups if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('navigator-backups', 'navigator-backups', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for backup files
DROP POLICY IF EXISTS "Users can upload own backup files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own backup files" ON storage.objects;

CREATE POLICY "Users can upload own backup files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'navigator-backups' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can view own backup files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'navigator-backups' AND
        (storage.foldername(name))[1] = auth.uid()::text
    );

-- Comments for documentation
COMMENT ON TABLE public.navigator_state IS 'Stores main application state for each user with conflict resolution';
COMMENT ON TABLE public.backups IS 'Tracks backup files stored in Supabase Storage';
COMMENT ON TABLE public.navigator_operations IS 'Logs operations for sync system and conflict resolution';
COMMENT ON COLUMN public.navigator_state.version IS 'Version number for conflict resolution';
COMMENT ON COLUMN public.navigator_state.checksum IS 'Data integrity checksum';
COMMENT ON COLUMN public.backups.day_key IS 'Date key in YYYY-MM-DD format for organizing backups';
COMMENT ON COLUMN public.backups.object_path IS 'Full path to backup file in Supabase Storage';