-- Complete fix for get_admin_subscription_overview function
-- This version eliminates all potential ambiguous column references

DROP FUNCTION IF EXISTS public.get_admin_subscription_overview() CASCADE;

CREATE OR REPLACE FUNCTION public.get_admin_subscription_overview()
RETURNS TABLE(
    user_email TEXT,
    subscription_status TEXT,
    subscription_plan TEXT,
    trial_end TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    subscription_created_at TIMESTAMPTZ,
    total_api_requests BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only admins can access this function
    IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        auth_users.email::TEXT as user_email,
        COALESCE(user_subs.status, 'none')::TEXT as subscription_status,
        COALESCE(user_subs.plan_id, 'none')::TEXT as subscription_plan,
        user_subs.trial_end,
        user_subs.current_period_end,
        user_subs.created_at as subscription_created_at,
        COALESCE(api_requests.total_requests, 0)::BIGINT as total_api_requests
    FROM auth.users auth_users
    LEFT JOIN public.user_subscriptions user_subs ON auth_users.id = user_subs.user_id
    LEFT JOIN (
        SELECT
            api_usage.user_id,
            SUM(api_usage.requests_count) as total_requests
        FROM public.api_usage api_usage
        WHERE api_usage.created_at > (NOW() - INTERVAL '30 days')
        GROUP BY api_usage.user_id
    ) api_requests ON auth_users.id = api_requests.user_id
    ORDER BY user_subs.created_at DESC NULLS LAST, auth_users.created_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_admin_subscription_overview TO authenticated;