-- Migration: Add delete_user_account function for GDPR compliance
-- Date: 2025-01-05
-- Purpose: Allow users to permanently delete their account and all associated data
--
-- GDPR Article 17: Right to Erasure ("Right to be Forgotten")
-- This function enables users to exercise their right to have their personal data deleted

-- Function to permanently delete a user account and all associated data
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Allows deletion from auth schema
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  deleted_counts JSONB;
  operations_count INTEGER;
  sync_count INTEGER;
  backups_count INTEGER;
  state_count INTEGER;
  api_usage_count INTEGER;
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();

  -- Security check: ensure user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Begin deletion process
  -- Note: Some tables have ON DELETE CASCADE, so they'll auto-delete
  -- We explicitly delete from tables that don't have CASCADE or to track counts

  -- 1. Delete from navigator_operations (operation log - contains all work data)
  DELETE FROM navigator_operations WHERE user_id = current_user_id;
  GET DIAGNOSTICS operations_count = ROW_COUNT;

  -- 3. Delete from sync_oplog (sync operations)
  DELETE FROM sync_oplog WHERE user_id = current_user_id;
  GET DIAGNOSTICS sync_count = ROW_COUNT;

  -- 4. Delete from backups table (backup data)
  DELETE FROM backups WHERE user_id = current_user_id;
  GET DIAGNOSTICS backups_count = ROW_COUNT;

  -- 5. Delete from navigator_state (state snapshots)
  DELETE FROM navigator_state WHERE user_id = current_user_id;
  GET DIAGNOSTICS state_count = ROW_COUNT;

  -- 6. Delete from api_usage (API tracking data)
  DELETE FROM api_usage WHERE user_id = current_user_id;
  GET DIAGNOSTICS api_usage_count = ROW_COUNT;

  -- 7. Delete from admin_actions where user is the target
  --    (Don't delete if user performed admin actions - preserve audit trail)
  DELETE FROM admin_actions WHERE target_user_id = current_user_id;

  -- 8. Delete from admin_users if user is an admin
  DELETE FROM admin_users WHERE user_id = current_user_id;

  -- 9. Delete from user_subscriptions (payment_history CASCADE deletes automatically)
  --    This is redundant due to ON DELETE CASCADE but included for clarity
  DELETE FROM user_subscriptions WHERE user_id = current_user_id;

  -- 10. Delete from auth.users (this is the final deletion)
  --     SECURITY DEFINER is required to access auth schema
  DELETE FROM auth.users WHERE id = current_user_id;

  -- Build response with deletion counts
  deleted_counts := jsonb_build_object(
    'user_id', current_user_id,
    'deleted_at', NOW(),
    'records_deleted', jsonb_build_object(
      'navigator_operations', operations_count,
      'sync_oplog', sync_count,
      'backups', backups_count,
      'navigator_state', state_count,
      'api_usage', api_usage_count
    ),
    'status', 'success',
    'message', 'Account and all associated data permanently deleted'
  );

  RETURN deleted_counts;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE EXCEPTION 'Failed to delete account: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION delete_user_account() IS
'GDPR Article 17 - Right to Erasure. Permanently deletes user account and all associated data. Can only be called by the authenticated user to delete their own account.';

-- Create audit log for account deletions (optional, for compliance tracking)
-- This table is intentionally NOT deleted when user deletes account (for legal compliance)
CREATE TABLE IF NOT EXISTS account_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- NOT a foreign key (user will be deleted)
  user_email TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_details JSONB,
  ip_address INET,
  user_agent TEXT
);

-- Enable RLS on deletion log (only admins can view)
ALTER TABLE account_deletion_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migrations)
DROP POLICY IF EXISTS "deletion_log_admin_only" ON account_deletion_log;
DROP POLICY IF EXISTS "deletion_log_insert_policy" ON account_deletion_log;

-- Only admins can view deletion log
CREATE POLICY "deletion_log_admin_only" ON account_deletion_log
  FOR SELECT USING (is_admin());

-- Allow authenticated users to insert their own deletion record
CREATE POLICY "deletion_log_insert_policy" ON account_deletion_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON account_deletion_log TO authenticated;
GRANT INSERT ON account_deletion_log TO authenticated;

COMMENT ON TABLE account_deletion_log IS 'Audit log of account deletions for legal compliance. Preserved after user deletion for regulatory requirements.';

-- Updated delete_user_account function with audit logging
CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  current_user_email TEXT;
  deleted_counts JSONB;
  operations_count INTEGER;
  sync_count INTEGER;
  backups_count INTEGER;
  state_count INTEGER;
  api_usage_count INTEGER;
BEGIN
  -- Get current authenticated user
  current_user_id := auth.uid();

  -- Security check
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user email before deletion (for audit log)
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = current_user_id;

  -- Log deletion request (before actual deletion)
  INSERT INTO account_deletion_log (user_id, user_email)
  VALUES (current_user_id, current_user_email);

  -- Delete user data (same as before)
  DELETE FROM navigator_operations WHERE user_id = current_user_id;
  GET DIAGNOSTICS operations_count = ROW_COUNT;

  DELETE FROM sync_oplog WHERE user_id = current_user_id;
  GET DIAGNOSTICS sync_count = ROW_COUNT;

  DELETE FROM backups WHERE user_id = current_user_id;
  GET DIAGNOSTICS backups_count = ROW_COUNT;

  DELETE FROM navigator_state WHERE user_id = current_user_id;
  GET DIAGNOSTICS state_count = ROW_COUNT;

  DELETE FROM api_usage WHERE user_id = current_user_id;
  GET DIAGNOSTICS api_usage_count = ROW_COUNT;

  DELETE FROM admin_actions WHERE target_user_id = current_user_id;
  DELETE FROM admin_users WHERE user_id = current_user_id;
  DELETE FROM user_subscriptions WHERE user_id = current_user_id;

  -- Update audit log with deletion details
  UPDATE account_deletion_log
  SET deletion_details = jsonb_build_object(
    'navigator_operations', operations_count,
    'sync_oplog', sync_count,
    'backups', backups_count,
    'navigator_state', state_count,
    'api_usage', api_usage_count
  )
  WHERE user_id = current_user_id
  AND deleted_at > NOW() - INTERVAL '1 minute'; -- Just updated record

  -- Final deletion: remove auth account
  DELETE FROM auth.users WHERE id = current_user_id;

  -- Build response
  deleted_counts := jsonb_build_object(
    'user_id', current_user_id,
    'email', current_user_email,
    'deleted_at', NOW(),
    'records_deleted', jsonb_build_object(
      'navigator_operations', operations_count,
      'sync_oplog', sync_count,
      'backups', backups_count,
      'navigator_state', state_count,
      'api_usage', api_usage_count
    ),
    'status', 'success',
    'message', 'Account and all associated data permanently deleted'
  );

  RETURN deleted_counts;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to delete account: %', SQLERRM;
END;
$$;

-- Re-grant execute permission
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;

COMMENT ON FUNCTION delete_user_account() IS
'GDPR Article 17 - Right to Erasure. Permanently deletes user account and all associated data. Logs deletion for compliance. Can only be called by the authenticated user to delete their own account.';
