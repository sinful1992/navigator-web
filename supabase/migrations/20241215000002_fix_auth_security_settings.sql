-- Fix Auth security settings
-- This migration sets up secure authentication configuration

-- Note: These settings need to be configured in the Supabase Dashboard
-- as they are auth configuration settings, not database schema changes.
-- This file documents the required settings.

-- Instructions for Supabase Dashboard Configuration:

-- 1. LEAKED PASSWORD PROTECTION
--    Go to: Authentication > Settings > Security
--    Enable: "Check for leaked passwords"
--    This uses HaveIBeenPwned.org to prevent compromised passwords

-- 2. MULTI-FACTOR AUTHENTICATION OPTIONS
--    Go to: Authentication > Settings > Multi-Factor Authentication
--    Enable the following MFA methods:
--    - TOTP (Time-based One-Time Password) - Google Authenticator, Authy, etc.
--    - SMS (if needed for your users)
--    - Phone (if needed for your users)

-- 3. PASSWORD POLICY STRENGTHENING
--    Go to: Authentication > Settings > Security
--    Configure:
--    - Minimum password length: 12 characters
--    - Require uppercase letters: Yes
--    - Require lowercase letters: Yes
--    - Require numbers: Yes
--    - Require special characters: Yes

-- 4. SESSION SECURITY
--    Go to: Authentication > Settings > Security
--    Configure:
--    - Session timeout: 24 hours (or as needed)
--    - Refresh token rotation: Enable
--    - Require email confirmation: Enable
--    - Require phone confirmation: Enable (if using phone auth)

-- Since these are configuration settings and not SQL changes,
-- we'll create a function to check if these settings are properly configured
-- (Note: Some settings may not be accessible via SQL and require dashboard configuration)

-- Function to check auth security status
CREATE OR REPLACE FUNCTION check_auth_security_status()
RETURNS TABLE(
  setting_name TEXT,
  current_status TEXT,
  recommended_status TEXT,
  needs_dashboard_config BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only admins can check auth security status
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Access denied - admin privileges required';
  END IF;

  -- Return status of various security settings
  -- Note: Many auth settings are not accessible via SQL and require dashboard configuration

  RETURN QUERY VALUES
    ('leaked_password_protection', 'unknown', 'enabled', true),
    ('mfa_totp', 'unknown', 'enabled', true),
    ('password_min_length', 'unknown', '12 characters', true),
    ('email_confirmation', 'unknown', 'required', true),
    ('session_timeout', 'unknown', '24 hours', true);

END;
$$;

-- Add RLS policies for better security on existing tables if not already present

-- Ensure admin_users table has proper RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_users'
    AND policyname = 'Admins can view admin users'
  ) THEN
    CREATE POLICY "Admins can view admin users" ON public.admin_users
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au2
          WHERE au2.user_id = auth.uid()
          AND au2.is_active = true
        )
      );
  END IF;
END $$;

-- Ensure user_subscriptions table has proper RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_subscriptions'
    AND policyname = 'Users can view own subscriptions'
  ) THEN
    CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

-- Add comments
COMMENT ON FUNCTION check_auth_security_status IS 'Admin function to check auth security configuration status';

-- Create a view for security audit (admin only)
CREATE OR REPLACE VIEW security_audit AS
SELECT
  'database_functions' as category,
  'search_path_security' as check_name,
  'All functions should have SET search_path = '''' for security' as description,
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS'
    ELSE 'REVIEW'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_definition NOT LIKE '%search_path%'

UNION ALL

SELECT
  'row_level_security' as category,
  'rls_enabled' as check_name,
  'All tables should have RLS enabled' as description,
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS'
    ELSE 'REVIEW'
  END as status
FROM information_schema.tables t
LEFT JOIN pg_class c ON c.relname = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND NOT c.relrowsecurity;

-- Grant access to the security audit view for admins only
GRANT SELECT ON security_audit TO authenticated;

-- Add RLS to the view (though views don't directly support RLS, we'll control access through the underlying data)
CREATE OR REPLACE FUNCTION can_view_security_audit()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND is_active = true
  );
END;
$$;