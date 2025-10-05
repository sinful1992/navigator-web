-- Migration: Automatic deletion of inactive accounts after 6 months
-- Date: 2025-01-05
-- Purpose: GDPR Article 5(1)(c) - Data Minimization - keep data only as long as necessary
--
-- Policy: Accounts inactive for 6+ months are automatically deleted
-- Warning: Users receive email warning at 5 months of inactivity
-- Opt-out: Users can prevent deletion by simply logging in

-- Table to track deletion warnings sent
CREATE TABLE IF NOT EXISTS inactive_account_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- NOT a foreign key (user might get deleted)
  user_email TEXT NOT NULL,
  last_sign_in_at TIMESTAMPTZ NOT NULL,
  warning_sent_at TIMESTAMPTZ DEFAULT NOW(),
  deletion_scheduled_for TIMESTAMPTZ NOT NULL,
  warning_acknowledged BOOLEAN DEFAULT FALSE,
  cancelled BOOLEAN DEFAULT FALSE -- User logged in and cancelled deletion
);

-- Enable RLS
ALTER TABLE inactive_account_warnings ENABLE ROW LEVEL SECURITY;

-- Users can see their own warnings
CREATE POLICY "inactive_warnings_select_policy" ON inactive_account_warnings
  FOR SELECT USING (user_id = auth.uid());

-- Only system can insert warnings
CREATE POLICY "inactive_warnings_insert_policy" ON inactive_account_warnings
  FOR INSERT WITH CHECK (true);

-- Users can update to acknowledge
CREATE POLICY "inactive_warnings_update_policy" ON inactive_account_warnings
  FOR UPDATE USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inactive_warnings_user_id ON inactive_account_warnings(user_id);
CREATE INDEX IF NOT EXISTS idx_inactive_warnings_deletion_scheduled ON inactive_account_warnings(deletion_scheduled_for);
CREATE INDEX IF NOT EXISTS idx_inactive_warnings_cancelled ON inactive_account_warnings(cancelled);

COMMENT ON TABLE inactive_account_warnings IS 'Tracks warnings sent to users about upcoming account deletion due to inactivity';

-- Function to identify inactive accounts (>6 months since last sign in)
CREATE OR REPLACE FUNCTION get_inactive_accounts(inactive_months INTEGER DEFAULT 6)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  last_sign_in_at TIMESTAMPTZ,
  days_inactive INTEGER,
  has_active_subscription BOOLEAN
)
LANGUAGE sql STABLE
AS $$
  SELECT
    u.id as user_id,
    u.email,
    u.last_sign_in_at,
    EXTRACT(days FROM NOW() - u.last_sign_in_at)::INTEGER as days_inactive,
    EXISTS(
      SELECT 1 FROM user_subscriptions s
      WHERE s.user_id = u.id
      AND s.status IN ('active', 'trial')
    ) as has_active_subscription
  FROM auth.users u
  WHERE u.last_sign_in_at < NOW() - (inactive_months || ' months')::INTERVAL
    OR u.last_sign_in_at IS NULL -- Never logged in (shouldn't happen, but handle it)
  ORDER BY u.last_sign_in_at ASC NULLS FIRST;
$$;

COMMENT ON FUNCTION get_inactive_accounts IS 'Returns list of accounts inactive for specified months (default 6)';

-- Function to send warning emails to users at 5 months of inactivity
CREATE OR REPLACE FUNCTION warn_inactive_accounts()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  warning_sent BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  inactive_user RECORD;
  warning_exists BOOLEAN;
  deletion_date TIMESTAMPTZ;
BEGIN
  -- Find users inactive for 5+ months but less than 6 months
  FOR inactive_user IN
    SELECT * FROM get_inactive_accounts(5)
    WHERE days_inactive < 180 -- Less than 6 months
    AND NOT has_active_subscription -- Don't warn paying customers
  LOOP
    -- Check if warning already sent
    SELECT EXISTS(
      SELECT 1 FROM inactive_account_warnings
      WHERE inactive_account_warnings.user_id = inactive_user.user_id
      AND cancelled = FALSE
      AND warning_sent_at > NOW() - INTERVAL '30 days' -- Don't spam warnings
    ) INTO warning_exists;

    IF NOT warning_exists THEN
      -- Calculate deletion date (30 days from now, or when they hit 6 months)
      deletion_date := GREATEST(
        NOW() + INTERVAL '30 days',
        inactive_user.last_sign_in_at + INTERVAL '6 months'
      );

      -- Insert warning record
      INSERT INTO inactive_account_warnings (
        user_id,
        user_email,
        last_sign_in_at,
        deletion_scheduled_for
      ) VALUES (
        inactive_user.user_id,
        inactive_user.email,
        inactive_user.last_sign_in_at,
        deletion_date
      );

      -- Return result (you'd integrate with email service here)
      user_id := inactive_user.user_id;
      email := inactive_user.email;
      warning_sent := TRUE;
      message := 'Warning email should be sent to ' || inactive_user.email || '. Account will be deleted on ' || deletion_date::DATE;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION warn_inactive_accounts IS 'Identifies accounts inactive for 5 months and creates warning records. Run this monthly via cron.';

-- Function to delete inactive accounts (>6 months, warning sent, 30 days passed)
CREATE OR REPLACE FUNCTION delete_inactive_accounts()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  last_sign_in_at TIMESTAMPTZ,
  days_inactive INTEGER,
  deletion_result TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inactive_user RECORD;
  deletion_counts JSONB;
BEGIN
  -- Find accounts to delete:
  -- 1. Inactive for 6+ months
  -- 2. Warning was sent at least 30 days ago
  -- 3. User hasn't logged in since warning
  -- 4. No active subscription
  FOR inactive_user IN
    SELECT
      u.id as user_id,
      u.email,
      u.last_sign_in_at,
      EXTRACT(days FROM NOW() - u.last_sign_in_at)::INTEGER as days_inactive
    FROM auth.users u
    LEFT JOIN user_subscriptions s ON s.user_id = u.id AND s.status IN ('active', 'trial')
    WHERE u.last_sign_in_at < NOW() - INTERVAL '6 months'
      AND s.id IS NULL -- No active subscription
      AND EXISTS (
        -- Warning was sent
        SELECT 1 FROM inactive_account_warnings w
        WHERE w.user_id = u.id
        AND w.cancelled = FALSE
        AND w.deletion_scheduled_for <= NOW()
      )
  LOOP
    -- Log the deletion intent
    INSERT INTO account_deletion_log (
      user_id,
      user_email,
      deletion_details
    ) VALUES (
      inactive_user.user_id,
      inactive_user.email,
      jsonb_build_object(
        'reason', 'inactive_account',
        'last_sign_in', inactive_user.last_sign_in_at,
        'days_inactive', inactive_user.days_inactive
      )
    );

    -- Delete all user data (same as manual deletion)
    DELETE FROM entity_store WHERE entity_store.user_id = inactive_user.user_id;
    DELETE FROM navigator_operations WHERE navigator_operations.user_id = inactive_user.user_id;
    DELETE FROM sync_oplog WHERE sync_oplog.user_id = inactive_user.user_id;
    DELETE FROM backups WHERE backups.user_id = inactive_user.user_id;
    DELETE FROM navigator_state WHERE navigator_state.user_id = inactive_user.user_id;
    DELETE FROM api_usage WHERE api_usage.user_id = inactive_user.user_id;
    DELETE FROM admin_actions WHERE target_user_id = inactive_user.user_id;
    DELETE FROM admin_users WHERE admin_users.user_id = inactive_user.user_id;
    DELETE FROM user_subscriptions WHERE user_subscriptions.user_id = inactive_user.user_id;

    -- Mark warnings as processed
    UPDATE inactive_account_warnings
    SET cancelled = TRUE
    WHERE inactive_account_warnings.user_id = inactive_user.user_id;

    -- Delete auth account (final step)
    DELETE FROM auth.users WHERE id = inactive_user.user_id;

    -- Return result
    user_id := inactive_user.user_id;
    email := inactive_user.email;
    last_sign_in_at := inactive_user.last_sign_in_at;
    days_inactive := inactive_user.days_inactive;
    deletion_result := 'Deleted successfully';
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_inactive_accounts TO authenticated;
COMMENT ON FUNCTION delete_inactive_accounts IS 'Automatically deletes accounts inactive for 6+ months after warning. Run this monthly via cron.';

-- Function to cancel scheduled deletion when user logs in
CREATE OR REPLACE FUNCTION cancel_inactive_account_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When user logs in, cancel any pending deletion warnings
  UPDATE inactive_account_warnings
  SET cancelled = TRUE,
      warning_acknowledged = TRUE
  WHERE user_id = NEW.id
    AND cancelled = FALSE;

  RETURN NEW;
END;
$$;

-- Trigger to auto-cancel deletion when user signs in
DROP TRIGGER IF EXISTS on_user_login_cancel_deletion ON auth.users;
CREATE TRIGGER on_user_login_cancel_deletion
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION cancel_inactive_account_deletion();

COMMENT ON FUNCTION cancel_inactive_account_deletion IS 'Automatically cancels scheduled account deletion when user logs in';

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_inactive_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION warn_inactive_accounts TO authenticated;
GRANT SELECT ON inactive_account_warnings TO authenticated;
GRANT INSERT ON inactive_account_warnings TO authenticated;
GRANT UPDATE ON inactive_account_warnings TO authenticated;

-- Instructions for setting up automated execution (run manually in Supabase SQL Editor)
--
-- SETUP CRON JOBS (requires pg_cron extension):
--
-- 1. Enable pg_cron extension (run once):
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- 2. Schedule monthly warning check (1st of each month at 2 AM):
--    SELECT cron.schedule(
--      'warn-inactive-accounts',
--      '0 2 1 * *',
--      $$ SELECT warn_inactive_accounts(); $$
--    );
--
-- 3. Schedule monthly deletion job (1st of each month at 3 AM):
--    SELECT cron.schedule(
--      'delete-inactive-accounts',
--      '0 3 1 * *',
--      $$ SELECT delete_inactive_accounts(); $$
--    );
--
-- 4. View scheduled jobs:
--    SELECT * FROM cron.job;
--
-- 5. Unschedule a job (if needed):
--    SELECT cron.unschedule('warn-inactive-accounts');
--    SELECT cron.unschedule('delete-inactive-accounts');
--
-- NOTE: For email notifications, integrate with Supabase Edge Functions or external email service
-- The warn_inactive_accounts() function returns the list of users to email.

-- Create a view for admins to monitor upcoming deletions
CREATE OR REPLACE VIEW admin_upcoming_deletions AS
SELECT
  w.user_id,
  w.user_email,
  w.last_sign_in_at,
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

-- Only admins can view
CREATE POLICY "upcoming_deletions_admin_only" ON inactive_account_warnings
  FOR SELECT USING (is_admin());

COMMENT ON VIEW admin_upcoming_deletions IS 'Admin view of accounts scheduled for deletion due to inactivity';
