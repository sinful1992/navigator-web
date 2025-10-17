-- Migration: Fix Database Linter Performance Warnings
-- Date: 2025-10-17
-- Purpose: Address performance issues identified by Supabase Database Linter
--
-- Fixes:
-- 1. RLS policies with auth functions re-evaluating for each row (3 policies)
-- 2. Multiple permissive SELECT policies on inactive_account_warnings (causes redundant evaluation)
-- 3. Duplicate indexes on navigator_operations table
--
-- Reference: https://supabase.com/docs/guides/database/database-linter

-- ============================================================================
-- FIX 1: Optimize RLS policies to use (select auth.<function>()) pattern
-- ============================================================================
-- Issue: auth.uid() is re-evaluated for each row, causing performance degradation
-- Fix: Wrap in SELECT to evaluate once and use result for all rows

-- Fix account_deletion_log insert policy
DROP POLICY IF EXISTS "deletion_log_insert_policy" ON public.account_deletion_log;
CREATE POLICY "deletion_log_insert_policy" ON public.account_deletion_log
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Fix inactive_account_warnings select policy
DROP POLICY IF EXISTS "inactive_warnings_select_policy" ON public.inactive_account_warnings;
CREATE POLICY "inactive_warnings_select_policy" ON public.inactive_account_warnings
  FOR SELECT USING (user_id = (select auth.uid()));

-- Fix inactive_account_warnings update policy
DROP POLICY IF EXISTS "inactive_warnings_update_policy" ON public.inactive_account_warnings;
CREATE POLICY "inactive_warnings_update_policy" ON public.inactive_account_warnings
  FOR UPDATE USING (user_id = (select auth.uid()));

-- ============================================================================
-- FIX 2: Consolidate multiple permissive SELECT policies
-- ============================================================================
-- Issue: Multiple permissive policies for SELECT on inactive_account_warnings
--        Both policies are evaluated for every query (OR logic)
-- Fix: Combine into single policy with OR condition

-- Drop the separate admin policy
DROP POLICY IF EXISTS "upcoming_deletions_admin_only" ON public.inactive_account_warnings;

-- Drop and recreate the main select policy with combined logic
DROP POLICY IF EXISTS "inactive_warnings_select_policy" ON public.inactive_account_warnings;
CREATE POLICY "inactive_warnings_select_policy" ON public.inactive_account_warnings
  FOR SELECT USING (
    -- Users can see their own warnings OR admins can see all
    user_id = (select auth.uid()) OR (select public.is_admin())
  );

-- ============================================================================
-- FIX 3: Remove duplicate unique constraints on navigator_operations
-- ============================================================================
-- Issue: Two identical unique constraints exist creating duplicate indexes
-- Fix: Drop the auto-generated one, keep the explicitly named one

-- Drop the auto-generated constraint (this will also drop its index)
ALTER TABLE public.navigator_operations
  DROP CONSTRAINT IF EXISTS navigator_operations_user_sequence_key;

-- Ensure our explicitly named unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'navigator_operations_user_sequence_unique'
  ) THEN
    ALTER TABLE public.navigator_operations
      ADD CONSTRAINT navigator_operations_user_sequence_unique
      UNIQUE(user_id, sequence_number);
  END IF;
END$$;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON POLICY "deletion_log_insert_policy" ON public.account_deletion_log IS
'Optimized: Uses (select auth.uid()) to evaluate once instead of per-row';

COMMENT ON POLICY "inactive_warnings_select_policy" ON public.inactive_account_warnings IS
'Optimized: Consolidated policy with (select auth.uid()) and (select is_admin()) for better performance';

COMMENT ON POLICY "inactive_warnings_update_policy" ON public.inactive_account_warnings IS
'Optimized: Uses (select auth.uid()) to evaluate once instead of per-row';

-- ============================================================================
-- Verification Queries (Run manually to confirm fixes)
-- ============================================================================

-- 1. Check RLS policies use subselects
-- SELECT schemaname, tablename, policyname, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('account_deletion_log', 'inactive_account_warnings')
-- ORDER BY tablename, policyname;

-- 2. Count policies per table/role/action
-- SELECT tablename,
--        COUNT(*) FILTER (WHERE cmd = 'SELECT') as select_policies
-- FROM pg_policies
-- WHERE tablename = 'inactive_account_warnings'
-- GROUP BY tablename;

-- 3. Check for duplicate indexes
-- SELECT tablename, indexname
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename = 'navigator_operations'
--   AND indexname LIKE '%sequence%'
-- ORDER BY indexname;
