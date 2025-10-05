-- Migration: Fix email confirmation trigger RLS issue
-- Date: 2025-01-06
-- Issue: Email confirmation was failing with "Database error granting user"
-- Root Cause: cancel_inactive_account_deletion trigger function lacked SECURITY DEFINER
--             causing RLS policy violations during email confirmation
-- Fix: Add SECURITY DEFINER and explicit search_path to bypass RLS

-- Drop existing function and trigger
DROP FUNCTION IF EXISTS cancel_inactive_account_deletion() CASCADE;

-- Recreate function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION cancel_inactive_account_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Allows function to bypass RLS policies
SET search_path = public -- Ensures function finds the correct schema
AS $$
BEGIN
  -- When user logs in (or confirms email), cancel any pending deletion warnings
  UPDATE inactive_account_warnings
  SET cancelled = TRUE,
      warning_acknowledged = TRUE
  WHERE user_id = NEW.id
    AND cancelled = FALSE;

  RETURN NEW;
END;
$$;

-- Recreate trigger on auth.users table
CREATE TRIGGER on_user_login_cancel_deletion
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION cancel_inactive_account_deletion();

COMMENT ON FUNCTION cancel_inactive_account_deletion IS 'Automatically cancels scheduled account deletion when user logs in or confirms email. Uses SECURITY DEFINER to bypass RLS.';
