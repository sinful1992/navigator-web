-- Add user_id columns to tables if they don't exist
-- Run this BEFORE creating RLS policies
-- This ensures each row can be associated with a user

-- Add user_id to entity_store table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'entity_store' 
                   AND column_name = 'user_id' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.entity_store ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add user_id to sync_oplog table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'sync_oplog' 
                   AND column_name = 'user_id' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.sync_oplog ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add user_id to navigator_operations table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'navigator_operations' 
                   AND column_name = 'user_id' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.navigator_operations ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add user_id to navigator_state table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'navigator_state' 
                   AND column_name = 'user_id' 
                   AND table_schema = 'public') THEN
        ALTER TABLE public.navigator_state ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_entity_store_user_id ON public.entity_store(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_oplog_user_id ON public.sync_oplog(user_id);
CREATE INDEX IF NOT EXISTS idx_navigator_operations_user_id ON public.navigator_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_navigator_state_user_id ON public.navigator_state(user_id);

-- Verify columns were added
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name IN ('navigator_operations', 'sync_oplog', 'entity_store', 'navigator_state')
AND column_name = 'user_id'
AND table_schema = 'public'
ORDER BY table_name;