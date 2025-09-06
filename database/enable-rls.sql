-- Enable Row Level Security on all Navigator Web tables
-- Run this in your Supabase SQL Editor

-- Enable RLS on navigator_operations table
ALTER TABLE public.navigator_operations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on sync_oplog table  
ALTER TABLE public.sync_oplog ENABLE ROW LEVEL SECURITY;

-- Enable RLS on entity_store table
ALTER TABLE public.entity_store ENABLE ROW LEVEL SECURITY;

-- Enable RLS on navigator_state table
ALTER TABLE public.navigator_state ENABLE ROW LEVEL SECURITY;

-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('navigator_operations', 'sync_oplog', 'entity_store', 'navigator_state')
AND schemaname = 'public';