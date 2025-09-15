-- Fix infinite recursion in admin_users RLS policy
-- The issue: admin_users policy was referencing itself in EXISTS clause

-- Drop the problematic policy
DROP POLICY IF EXISTS "admin_users_select_policy" ON public.admin_users;

-- Create a simpler, non-recursive policy for admin_users
-- Only allow users to see their own admin record
CREATE POLICY "admin_users_select_policy" ON public.admin_users
    FOR SELECT USING (user_id = (select auth.uid()));

-- For admin functions that need to check admin status,
-- we'll use a separate function that bypasses RLS
CREATE OR REPLACE FUNCTION public.is_admin_user(check_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_user_id uuid;
BEGIN
    -- Use provided user_id or current user
    target_user_id := COALESCE(check_user_id, auth.uid());

    -- Check if user is an active admin (bypassing RLS)
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = target_user_id
        AND is_active = true
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO authenticated;

-- Update any views or functions that were relying on the recursive policy
-- to use the new is_admin_user function instead