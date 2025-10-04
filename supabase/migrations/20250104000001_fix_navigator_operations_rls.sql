-- Fix navigator_operations RLS policies
-- This addresses remaining auth_rls_initplan and multiple_permissive_policies warnings

-- Drop the old "Users can access own operations" policy that's causing the duplicate policy warning
DROP POLICY IF EXISTS "Users can access own operations" ON public.navigator_operations;

-- Also drop any other potentially duplicated policies
DROP POLICY IF EXISTS "navigator_operations_select_policy" ON public.navigator_operations;
DROP POLICY IF EXISTS "navigator_operations_insert_policy" ON public.navigator_operations;
DROP POLICY IF EXISTS "navigator_operations_update_policy" ON public.navigator_operations;
DROP POLICY IF EXISTS "navigator_operations_delete_policy" ON public.navigator_operations;

-- Recreate optimized policies with (select auth.uid()) for better performance
CREATE POLICY "navigator_operations_select_policy" ON public.navigator_operations
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "navigator_operations_insert_policy" ON public.navigator_operations
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_operations_update_policy" ON public.navigator_operations
    FOR UPDATE USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "navigator_operations_delete_policy" ON public.navigator_operations
    FOR DELETE USING (user_id = (select auth.uid()));

-- Add comments explaining the optimizations
COMMENT ON POLICY "navigator_operations_select_policy" ON public.navigator_operations
    IS 'Optimized RLS policy using (select auth.uid()) to prevent re-evaluation per row';

COMMENT ON POLICY "navigator_operations_insert_policy" ON public.navigator_operations
    IS 'Optimized RLS policy using (select auth.uid()) to prevent re-evaluation per row';

COMMENT ON POLICY "navigator_operations_update_policy" ON public.navigator_operations
    IS 'Optimized RLS policy using (select auth.uid()) to prevent re-evaluation per row';

COMMENT ON POLICY "navigator_operations_delete_policy" ON public.navigator_operations
    IS 'Optimized RLS policy using (select auth.uid()) to prevent re-evaluation per row';
