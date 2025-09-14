-- Optimize RLS performance by fixing auth function calls and consolidating policies
-- This addresses auth_rls_initplan and multiple_permissive_policies warnings

-- Step 1: Fix auth function calls in RLS policies
-- Replace auth.uid() with (select auth.uid()) for better performance

-- Fix navigator_state table policies
DROP POLICY IF EXISTS "read own" ON public.navigator_state;
DROP POLICY IF EXISTS "upsert own" ON public.navigator_state;
DROP POLICY IF EXISTS "update own" ON public.navigator_state;
DROP POLICY IF EXISTS "Users can view own navigator_state data" ON public.navigator_state;
DROP POLICY IF EXISTS "Users can insert own navigator_state data" ON public.navigator_state;
DROP POLICY IF EXISTS "Users can update own navigator_state data" ON public.navigator_state;
DROP POLICY IF EXISTS "Users can delete own navigator_state data" ON public.navigator_state;

-- Create consolidated, optimized policies for navigator_state
CREATE POLICY "navigator_state_select_policy" ON public.navigator_state
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "navigator_state_insert_policy" ON public.navigator_state
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_state_update_policy" ON public.navigator_state
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_state_delete_policy" ON public.navigator_state
    FOR DELETE USING (user_id = (select auth.uid()));

-- Fix backups table policies
DROP POLICY IF EXISTS "User reads own backups" ON public.backups;
DROP POLICY IF EXISTS "User inserts own backups" ON public.backups;

CREATE POLICY "backups_select_policy" ON public.backups
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "backups_insert_policy" ON public.backups
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- Fix entity_store table policies
DROP POLICY IF EXISTS "Users can view own entity_store data" ON public.entity_store;
DROP POLICY IF EXISTS "Users can insert own entity_store data" ON public.entity_store;
DROP POLICY IF EXISTS "Users can update own entity_store data" ON public.entity_store;
DROP POLICY IF EXISTS "Users can delete own entity_store data" ON public.entity_store;

CREATE POLICY "entity_store_select_policy" ON public.entity_store
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "entity_store_insert_policy" ON public.entity_store
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "entity_store_update_policy" ON public.entity_store
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "entity_store_delete_policy" ON public.entity_store
    FOR DELETE USING (user_id = (select auth.uid()));

-- Fix sync_oplog table policies
DROP POLICY IF EXISTS "Users can view own sync_oplog data" ON public.sync_oplog;
DROP POLICY IF EXISTS "Users can insert own sync_oplog data" ON public.sync_oplog;
DROP POLICY IF EXISTS "Users can update own sync_oplog data" ON public.sync_oplog;
DROP POLICY IF EXISTS "Users can delete own sync_oplog data" ON public.sync_oplog;

CREATE POLICY "sync_oplog_select_policy" ON public.sync_oplog
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "sync_oplog_insert_policy" ON public.sync_oplog
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "sync_oplog_update_policy" ON public.sync_oplog
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "sync_oplog_delete_policy" ON public.sync_oplog
    FOR DELETE USING (user_id = (select auth.uid()));

-- Fix navigator_operations table policies
DROP POLICY IF EXISTS "Users can view own navigator_operations data" ON public.navigator_operations;
DROP POLICY IF EXISTS "Users can insert own navigator_operations data" ON public.navigator_operations;
DROP POLICY IF EXISTS "Users can update own navigator_operations data" ON public.navigator_operations;
DROP POLICY IF EXISTS "Users can delete own navigator_operations data" ON public.navigator_operations;

CREATE POLICY "navigator_operations_select_policy" ON public.navigator_operations
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "navigator_operations_insert_policy" ON public.navigator_operations
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_operations_update_policy" ON public.navigator_operations
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_operations_delete_policy" ON public.navigator_operations
    FOR DELETE USING (user_id = (select auth.uid()));

-- Fix subscription_plans table policies - optimize with admin check
DROP POLICY IF EXISTS "subscription_plans_select_policy" ON public.subscription_plans;

CREATE POLICY "subscription_plans_select_policy" ON public.subscription_plans
    FOR SELECT USING (
        is_active = true OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

-- Fix user_subscriptions table policies - optimize admin and user access
DROP POLICY IF EXISTS "user_subscriptions_select_policy" ON public.user_subscriptions;
DROP POLICY IF EXISTS "user_subscriptions_insert_policy" ON public.user_subscriptions;
DROP POLICY IF EXISTS "user_subscriptions_update_policy" ON public.user_subscriptions;

CREATE POLICY "user_subscriptions_select_policy" ON public.user_subscriptions
    FOR SELECT USING (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

CREATE POLICY "user_subscriptions_insert_policy" ON public.user_subscriptions
    FOR INSERT WITH CHECK (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

CREATE POLICY "user_subscriptions_update_policy" ON public.user_subscriptions
    FOR UPDATE USING (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    ) WITH CHECK (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

-- Fix payment_history table policies
DROP POLICY IF EXISTS "payment_history_select_policy" ON public.payment_history;

CREATE POLICY "payment_history_select_policy" ON public.payment_history
    FOR SELECT USING (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

-- Fix admin_actions table policies
DROP POLICY IF EXISTS "admin_actions_select_policy" ON public.admin_actions;
DROP POLICY IF EXISTS "admin_actions_insert_policy" ON public.admin_actions;

CREATE POLICY "admin_actions_select_policy" ON public.admin_actions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

CREATE POLICY "admin_actions_insert_policy" ON public.admin_actions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

-- Fix admin_users table policies
DROP POLICY IF EXISTS "admin_users_select_policy" ON public.admin_users;

CREATE POLICY "admin_users_select_policy" ON public.admin_users
    FOR SELECT USING (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users au2
            WHERE au2.user_id = (select auth.uid()) AND au2.is_active = true
        )
    );

-- Fix api_usage table policies - consolidate multiple permissive policies
DROP POLICY IF EXISTS "Users can view own API usage" ON public.api_usage;
DROP POLICY IF EXISTS "Admins can view all API usage" ON public.api_usage;

-- Create single consolidated policy for api_usage
CREATE POLICY "api_usage_select_policy" ON public.api_usage
    FOR SELECT USING (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );

-- Keep the system insert policy for service role
-- (This should already exist from previous migrations)

-- Add comments explaining the optimizations
COMMENT ON POLICY "navigator_state_select_policy" ON public.navigator_state IS 'Optimized RLS policy using (select auth.uid()) for better performance';
COMMENT ON POLICY "backups_select_policy" ON public.backups IS 'Optimized RLS policy using (select auth.uid()) for better performance';
COMMENT ON POLICY "entity_store_select_policy" ON public.entity_store IS 'Optimized RLS policy using (select auth.uid()) for better performance';
COMMENT ON POLICY "sync_oplog_select_policy" ON public.sync_oplog IS 'Optimized RLS policy using (select auth.uid()) for better performance';
COMMENT ON POLICY "navigator_operations_select_policy" ON public.navigator_operations IS 'Optimized RLS policy using (select auth.uid()) for better performance';
COMMENT ON POLICY "api_usage_select_policy" ON public.api_usage IS 'Consolidated RLS policy to eliminate multiple permissive policies and optimize performance';

-- Create a function to check RLS optimization status
CREATE OR REPLACE FUNCTION check_rls_optimization_status()
RETURNS TABLE(
    table_name TEXT,
    policy_count INTEGER,
    has_optimized_auth_calls BOOLEAN,
    optimization_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only admins can check RLS optimization status
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        t.tablename::TEXT,
        COUNT(p.policyname)::INTEGER as policy_count,
        NOT EXISTS (
            SELECT 1 FROM pg_policies pp
            WHERE pp.tablename = t.tablename
            AND pp.qual LIKE '%auth.uid()%'
            AND pp.qual NOT LIKE '%(select auth.uid())%'
        ) as has_optimized_auth_calls,
        CASE
            WHEN COUNT(p.policyname) <= 4 AND NOT EXISTS (
                SELECT 1 FROM pg_policies pp
                WHERE pp.tablename = t.tablename
                AND pp.qual LIKE '%auth.uid()%'
                AND pp.qual NOT LIKE '%(select auth.uid())%'
            ) THEN 'OPTIMIZED'
            WHEN COUNT(p.policyname) > 4 THEN 'TOO_MANY_POLICIES'
            ELSE 'NEEDS_OPTIMIZATION'
        END as optimization_status
    FROM pg_tables t
    LEFT JOIN pg_policies p ON p.tablename = t.tablename
    WHERE t.schemaname = 'public'
    GROUP BY t.tablename
    HAVING COUNT(p.policyname) > 0
    ORDER BY t.tablename;
END;
$$;

COMMENT ON FUNCTION check_rls_optimization_status IS 'Admin function to check RLS policy optimization status';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_rls_optimization_status TO authenticated;