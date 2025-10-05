-- Migration: Fix inactive account detection to use real activity instead of login
-- Date: 2025-01-05
-- Issue: Using last_sign_in_at can flag active users as inactive if they stay logged in
-- Solution: Track last time user created/updated data in entity_store

-- Drop existing function (required because return type changes)
DROP FUNCTION IF EXISTS get_inactive_accounts(INTEGER);

-- Recreate with activity-based detection
CREATE OR REPLACE FUNCTION get_inactive_accounts(inactive_months INTEGER DEFAULT 6)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  last_activity_at TIMESTAMPTZ,
  days_inactive INTEGER,
  has_active_subscription BOOLEAN
)
LANGUAGE sql STABLE
AS $$
  WITH user_activity AS (
    -- Get last activity from entity_store (completions, arrangements, addresses)
    SELECT
      user_id,
      MAX(GREATEST(
        -- Check data timestamp field (for completions/arrangements)
        COALESCE((data->>'timestamp')::timestamptz, '1970-01-01'::timestamptz),
        -- Check when record was last updated
        COALESCE(updated_at, '1970-01-01'::timestamptz),
        -- Check when record was created
        COALESCE(created_at, '1970-01-01'::timestamptz)
      )) as last_activity
    FROM entity_store
    GROUP BY user_id
  )
  SELECT
    u.id as user_id,
    u.email,
    -- Use latest of: data activity, login, or account creation
    COALESCE(ua.last_activity, u.last_sign_in_at, u.created_at) as last_activity_at,
    EXTRACT(days FROM NOW() - COALESCE(ua.last_activity, u.last_sign_in_at, u.created_at))::INTEGER as days_inactive,
    EXISTS(
      SELECT 1 FROM user_subscriptions s
      WHERE s.user_id = u.id
      AND s.status IN ('active', 'trial')
    ) as has_active_subscription
  FROM auth.users u
  LEFT JOIN user_activity ua ON ua.user_id = u.id
  WHERE COALESCE(ua.last_activity, u.last_sign_in_at, u.created_at) < NOW() - (inactive_months || ' months')::INTERVAL
  ORDER BY last_activity_at ASC NULLS FIRST;
$$;

COMMENT ON FUNCTION get_inactive_accounts IS 'Returns accounts inactive for specified months based on actual data activity (not just login). Checks entity_store for last completion/arrangement/address activity.';

-- Update warn_inactive_accounts to use new activity-based detection
DROP FUNCTION IF EXISTS warn_inactive_accounts();

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
  -- Find users inactive for 5+ months but less than 6 months (based on activity)
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
      -- Calculate deletion date (30 days from now, or when they hit 6 months of inactivity)
      deletion_date := GREATEST(
        NOW() + INTERVAL '30 days',
        inactive_user.last_activity_at + INTERVAL '6 months'
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
        inactive_user.last_activity_at, -- Now tracks activity, not just sign-in
        deletion_date
      );

      -- Return result
      user_id := inactive_user.user_id;
      email := inactive_user.email;
      warning_sent := TRUE;
      message := 'Warning email should be sent to ' || inactive_user.email || '. Account will be deleted on ' || deletion_date::DATE;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION warn_inactive_accounts IS 'Identifies accounts inactive for 5 months (based on data activity) and creates warning records. Run monthly via cron.';

-- Update delete_inactive_accounts to use activity-based detection
DROP FUNCTION IF EXISTS delete_inactive_accounts();

CREATE OR REPLACE FUNCTION delete_inactive_accounts()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  last_activity_at TIMESTAMPTZ,
  days_inactive INTEGER,
  deletion_result TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inactive_user RECORD;
BEGIN
  -- Find accounts to delete:
  -- 1. Inactive for 6+ months (based on data activity)
  -- 2. Warning was sent at least 30 days ago
  -- 3. User hasn't been active since warning
  -- 4. No active subscription
  FOR inactive_user IN
    SELECT
      ia.user_id,
      ia.email,
      ia.last_activity_at,
      ia.days_inactive
    FROM get_inactive_accounts(6) ia
    WHERE ia.has_active_subscription = FALSE -- No active subscription
      AND EXISTS (
        -- Warning was sent
        SELECT 1 FROM inactive_account_warnings w
        WHERE w.user_id = ia.user_id
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
        'last_activity', inactive_user.last_activity_at,
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
    last_activity_at := inactive_user.last_activity_at;
    days_inactive := inactive_user.days_inactive;
    deletion_result := 'Deleted successfully';
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_inactive_accounts TO authenticated;
COMMENT ON FUNCTION delete_inactive_accounts IS 'Automatically deletes accounts inactive for 6+ months (based on data activity) after warning. Run monthly via cron.';

-- Update admin view to show last activity
DROP VIEW IF EXISTS admin_upcoming_deletions;

CREATE OR REPLACE VIEW admin_upcoming_deletions AS
SELECT
  w.user_id,
  w.user_email,
  w.last_sign_in_at as last_activity_at, -- Column name kept for compatibility, but now tracks activity
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

COMMENT ON VIEW admin_upcoming_deletions IS 'Admin view of accounts scheduled for deletion due to inactivity (based on data activity, not just login)';

-- Update the auto-cancel trigger to also consider activity
-- When user creates ANY data in entity_store, cancel pending deletion
DROP TRIGGER IF EXISTS on_entity_activity_cancel_deletion ON entity_store;

CREATE OR REPLACE FUNCTION cancel_deletion_on_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When user creates/updates data, cancel any pending deletion warnings
  UPDATE inactive_account_warnings
  SET cancelled = TRUE,
      warning_acknowledged = TRUE
  WHERE user_id = NEW.user_id
    AND cancelled = FALSE;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_entity_activity_cancel_deletion
  AFTER INSERT OR UPDATE ON entity_store
  FOR EACH ROW
  EXECUTE FUNCTION cancel_deletion_on_activity();

COMMENT ON FUNCTION cancel_deletion_on_activity IS 'Automatically cancels scheduled account deletion when user creates or updates data';

-- Keep the original login-based trigger as well (double protection)
-- Already exists from previous migration, no changes needed
