-- Create RLS Policies for Navigator Web
-- Run this AFTER enabling RLS on all tables
-- This ensures users can only access their own data

-- ==== ENTITY_STORE TABLE POLICIES ====
-- This table stores user's addresses, completions, arrangements, sessions

-- Policy: Users can only see their own data
CREATE POLICY "Users can view own entity_store data" ON public.entity_store
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own data
CREATE POLICY "Users can insert own entity_store data" ON public.entity_store
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own data
CREATE POLICY "Users can update own entity_store data" ON public.entity_store
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own data
CREATE POLICY "Users can delete own entity_store data" ON public.entity_store
    FOR DELETE USING (auth.uid() = user_id);

-- ==== SYNC_OPLOG TABLE POLICIES ====
-- This table stores sync operations log

-- Policy: Users can only see their own sync operations
CREATE POLICY "Users can view own sync_oplog data" ON public.sync_oplog
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own sync operations
CREATE POLICY "Users can insert own sync_oplog data" ON public.sync_oplog
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own sync operations
CREATE POLICY "Users can update own sync_oplog data" ON public.sync_oplog
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own sync operations
CREATE POLICY "Users can delete own sync_oplog data" ON public.sync_oplog
    FOR DELETE USING (auth.uid() = user_id);

-- ==== NAVIGATOR_OPERATIONS TABLE POLICIES ====
-- This table stores navigation/operation history

-- Policy: Users can only see their own operations
CREATE POLICY "Users can view own navigator_operations data" ON public.navigator_operations
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own operations
CREATE POLICY "Users can insert own navigator_operations data" ON public.navigator_operations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own operations
CREATE POLICY "Users can update own navigator_operations data" ON public.navigator_operations
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own operations
CREATE POLICY "Users can delete own navigator_operations data" ON public.navigator_operations
    FOR DELETE USING (auth.uid() = user_id);

-- ==== NAVIGATOR_STATE TABLE POLICIES ====
-- This table stores the main application state for each user

-- Policy: Users can only see their own state
CREATE POLICY "Users can view own navigator_state data" ON public.navigator_state
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own state
CREATE POLICY "Users can insert own navigator_state data" ON public.navigator_state
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own state
CREATE POLICY "Users can update own navigator_state data" ON public.navigator_state
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own state
CREATE POLICY "Users can delete own navigator_state data" ON public.navigator_state
    FOR DELETE USING (auth.uid() = user_id);

-- ==== VERIFICATION ====
-- Check that all policies were created successfully
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename IN ('navigator_operations', 'sync_oplog', 'entity_store', 'navigator_state')
ORDER BY tablename, policyname;