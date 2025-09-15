-- Fix function name conflicts by dropping existing functions first
-- Then recreate them with the updated admin checks

-- Drop all existing functions that have conflicts
DROP FUNCTION IF EXISTS public.get_api_usage_stats;
DROP FUNCTION IF EXISTS public.get_all_api_usage;
DROP FUNCTION IF EXISTS public.get_admin_overview;
DROP FUNCTION IF EXISTS public.get_user_details;
DROP FUNCTION IF EXISTS public.grant_subscription;
DROP FUNCTION IF EXISTS public.extend_trial;
DROP FUNCTION IF EXISTS public.check_auth_security;

-- Now recreate them with proper admin checks and search_path
CREATE OR REPLACE FUNCTION public.get_api_usage_stats(user_uuid uuid)
RETURNS TABLE(
  service text,
  total_requests bigint,
  total_cost numeric,
  daily_stats jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow users to see their own stats or admins to see any stats
  IF user_uuid != auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    au.service,
    COUNT(*)::bigint as total_requests,
    COALESCE(SUM(au.cost), 0)::numeric as total_cost,
    jsonb_agg(
      jsonb_build_object(
        'date', au.created_at::date,
        'requests', COUNT(*),
        'cost', COALESCE(SUM(au.cost), 0)
      )
      ORDER BY au.created_at::date DESC
    ) as daily_stats
  FROM api_usage au
  WHERE au.user_id = user_uuid
    AND au.created_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY au.service
  ORDER BY total_requests DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_api_usage()
RETURNS TABLE(
  user_id uuid,
  user_email text,
  service text,
  total_requests bigint,
  total_cost numeric,
  last_used timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can access this
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied - admin required';
  END IF;

  RETURN QUERY
  SELECT
    au.user_id,
    u.email as user_email,
    au.service,
    COUNT(*)::bigint as total_requests,
    COALESCE(SUM(au.cost), 0)::numeric as total_cost,
    MAX(au.created_at) as last_used
  FROM api_usage au
  LEFT JOIN auth.users u ON u.id = au.user_id
  GROUP BY au.user_id, u.email, au.service
  ORDER BY total_requests DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_users integer;
  active_subs integer;
  total_api_calls bigint;
  recent_activity jsonb;
BEGIN
  -- Only admins can access this function
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied - admin privileges required';
  END IF;

  -- Get total registered users
  SELECT COUNT(*) INTO total_users FROM auth.users;

  -- Get active subscriptions
  SELECT COUNT(*) INTO active_subs
  FROM user_subscriptions
  WHERE status = 'active' AND current_period_end > NOW();

  -- Get total API calls in last 30 days
  SELECT COALESCE(COUNT(*), 0) INTO total_api_calls
  FROM api_usage
  WHERE created_at >= NOW() - INTERVAL '30 days';

  -- Get recent activity (last 10 registrations)
  SELECT jsonb_agg(
    jsonb_build_object(
      'email', email,
      'created_at', created_at
    )
    ORDER BY created_at DESC
  ) INTO recent_activity
  FROM (
    SELECT email, created_at
    FROM auth.users
    ORDER BY created_at DESC
    LIMIT 10
  ) recent;

  -- Build result
  result := jsonb_build_object(
    'total_users', total_users,
    'active_subscriptions', active_subs,
    'total_api_calls', total_api_calls,
    'recent_activity', COALESCE(recent_activity, '[]'::jsonb)
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_details(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  user_info jsonb;
  subscription_info jsonb;
  api_usage_info jsonb;
BEGIN
  -- Only admins can access this function
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied - admin privileges required';
  END IF;

  -- Get user basic info
  SELECT jsonb_build_object(
    'id', id,
    'email', email,
    'created_at', created_at,
    'last_sign_in_at', last_sign_in_at,
    'email_confirmed_at', email_confirmed_at
  ) INTO user_info
  FROM auth.users
  WHERE id = target_user_id;

  IF user_info IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Get subscription info
  SELECT jsonb_build_object(
    'plan_id', plan_id,
    'status', status,
    'current_period_start', current_period_start,
    'current_period_end', current_period_end,
    'created_at', created_at
  ) INTO subscription_info
  FROM user_subscriptions
  WHERE user_id = target_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Get API usage summary
  SELECT jsonb_build_object(
    'total_calls', COALESCE(COUNT(*), 0),
    'total_cost', COALESCE(SUM(cost), 0),
    'services', jsonb_agg(DISTINCT service)
  ) INTO api_usage_info
  FROM api_usage
  WHERE user_id = target_user_id
    AND created_at >= NOW() - INTERVAL '30 days';

  -- Combine all info
  result := jsonb_build_object(
    'user', user_info,
    'subscription', COALESCE(subscription_info, '{}'::jsonb),
    'api_usage', COALESCE(api_usage_info, '{}'::jsonb)
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_subscription(
    target_user_id uuid,
    plan_id_param text,
    duration_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
    existing_sub record;
    new_end_date timestamp with time zone;
BEGIN
    -- Only admins can grant subscriptions
    IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    -- Calculate new end date
    new_end_date := NOW() + (duration_days || ' days')::interval;

    -- Check for existing subscription
    SELECT * INTO existing_sub
    FROM user_subscriptions
    WHERE user_id = target_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF existing_sub.id IS NOT NULL THEN
        -- Update existing subscription
        UPDATE user_subscriptions
        SET
            plan_id = plan_id_param,
            status = 'active',
            current_period_start = NOW(),
            current_period_end = new_end_date,
            updated_at = NOW()
        WHERE id = existing_sub.id;

        result := jsonb_build_object(
            'action', 'updated',
            'subscription_id', existing_sub.id,
            'plan_id', plan_id_param,
            'expires_at', new_end_date
        );
    ELSE
        -- Create new subscription
        INSERT INTO user_subscriptions (
            user_id,
            plan_id,
            status,
            current_period_start,
            current_period_end
        ) VALUES (
            target_user_id,
            plan_id_param,
            'active',
            NOW(),
            new_end_date
        ) RETURNING id INTO existing_sub;

        result := jsonb_build_object(
            'action', 'created',
            'subscription_id', existing_sub.id,
            'plan_id', plan_id_param,
            'expires_at', new_end_date
        );
    END IF;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_trial(
    target_user_id uuid,
    additional_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
    subscription record;
    new_trial_end timestamp with time zone;
BEGIN
    -- Only admins can extend trials
    IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    -- Get current subscription
    SELECT * INTO subscription
    FROM user_subscriptions
    WHERE user_id = target_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF subscription.id IS NULL THEN
        RAISE EXCEPTION 'No subscription found for user';
    END IF;

    -- Calculate new trial end date
    new_trial_end := COALESCE(subscription.trial_end, NOW()) + (additional_days || ' days')::interval;

    -- Update subscription
    UPDATE user_subscriptions
    SET
        trial_end = new_trial_end,
        updated_at = NOW()
    WHERE id = subscription.id;

    result := jsonb_build_object(
        'subscription_id', subscription.id,
        'previous_trial_end', subscription.trial_end,
        'new_trial_end', new_trial_end,
        'days_added', additional_days
    );

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_auth_security()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
    total_users integer;
    unconfirmed_users integer;
    recent_signups integer;
    suspicious_activity integer;
BEGIN
  -- Only admins can check auth security status
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied - admin privileges required';
  END IF;

  -- Get user statistics
  SELECT COUNT(*) INTO total_users FROM auth.users;

  SELECT COUNT(*) INTO unconfirmed_users
  FROM auth.users
  WHERE email_confirmed_at IS NULL;

  SELECT COUNT(*) INTO recent_signups
  FROM auth.users
  WHERE created_at >= NOW() - INTERVAL '24 hours';

  -- Check for suspicious activity (multiple failed attempts, etc.)
  -- This is a placeholder - implement based on your audit logs
  suspicious_activity := 0;

  result := jsonb_build_object(
    'total_users', total_users,
    'unconfirmed_users', unconfirmed_users,
    'recent_signups', recent_signups,
    'suspicious_activity', suspicious_activity,
    'timestamp', NOW()
  );

  RETURN result;
END;
$$;