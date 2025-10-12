-- Migration: Fix Supabase Security Linter Warnings
-- Date: 2025-10-12
-- Purpose: Address security vulnerabilities identified by Supabase Database Linter
--
-- Fixes:
-- 1. ERROR: admin_upcoming_deletions view uses SECURITY DEFINER (exposes admin permissions)
-- 2. WARN: get_inactive_accounts function has mutable search_path (search path hijacking vulnerability)
-- 3. WARN: warn_inactive_accounts function has mutable search_path
-- 4. WARN: cancel_deletion_on_activity function has mutable search_path
--
-- Reference: https://supabase.com/docs/guides/database/database-linter

-- ============================================================================
-- FIX 1: Recreate admin_upcoming_deletions view with SECURITY INVOKER
-- ============================================================================
-- Issue: View currently runs with creator's permissions, bypassing RLS
-- Fix: Use security_invoker = true to enforce RLS of querying user

DROP VIEW IF EXISTS public.admin_upcoming_deletions;

CREATE VIEW public.admin_upcoming_deletions
WITH (security_invoker = true) -- 🔒 Security fix: Enforce querying user's permissions
AS
SELECT
  w.user_id,
  w.user_email,
  w.last_sign_in_at as last_activity_at,
  w.deletion_scheduled_for,
  w.warning_sent_at,
  w.warning_acknowledged,
  w.cancelled,
  EXTRACT(days FROM w.deletion_scheduled_for - NOW())::INTEGER as days_until_deletion,
  EXISTS(
    SELECT 1 FROM user_subscriptions s
    WHERE s.user_id = w.user_id
    AND s.status IN ('active', 'trial')
  ) as has_active_subscription
FROM inactive_account_warnings w
WHERE w.cancelled = FALSE
  AND w.deletion_scheduled_for > NOW()
ORDER BY w.deletion_scheduled_for ASC;

COMMENT ON VIEW public.admin_upcoming_deletions IS
'Admin view of accounts scheduled for deletion due to inactivity (security_invoker enforces RLS)';

-- ============================================================================
-- FIX 2: Set search_path for get_inactive_accounts function
-- ============================================================================
-- Issue: Function doesn't have fixed search_path, vulnerable to search path hijacking
-- Fix: Add "SET search_path = public, pg_temp" to prevent malicious schema attacks

ALTER FUNCTION public.get_inactive_accounts(INTEGER)
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.get_inactive_accounts(INTEGER) IS
'Returns accounts inactive for specified months based on actual data activity. Secure search_path prevents hijacking.';

-- ============================================================================
-- FIX 3: Set search_path for warn_inactive_accounts function
-- ============================================================================
-- Issue: Function doesn't have fixed search_path
-- Fix: Add secure search_path

ALTER FUNCTION public.warn_inactive_accounts()
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.warn_inactive_accounts IS
'Identifies accounts inactive for 5 months and creates warning records. Secure search_path prevents hijacking.';

-- ============================================================================
-- FIX 4: Set search_path for cancel_deletion_on_activity function
-- ============================================================================
-- Issue: Trigger function doesn't have fixed search_path
-- Fix: Add secure search_path

ALTER FUNCTION public.cancel_deletion_on_activity()
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.cancel_deletion_on_activity IS
'Automatically cancels scheduled account deletion when user creates operations. Secure search_path prevents hijacking.';

-- ============================================================================
-- Verification: Confirm all fixes applied
-- ============================================================================
-- You can verify fixes by checking:
-- 1. View security: SELECT relname, reloptions FROM pg_class WHERE relname = 'admin_upcoming_deletions';
--    Expected: reloptions should contain 'security_invoker=true'
--
-- 2. Function search_path: SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname IN ('get_inactive_accounts', 'warn_inactive_accounts', 'cancel_deletion_on_activity');
--    Expected: proconfig should contain 'search_path=public, pg_temp'
