-- Fix ambiguous column reference in get_admin_subscription_overview function

CREATE OR REPLACE FUNCTION get_admin_subscription_overview()
RETURNS TABLE(
    user_email TEXT,
    subscription_status TEXT,
    subscription_plan TEXT,
    trial_end TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    total_api_requests BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only admins can access this function
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        au.email::TEXT,
        COALESCE(us.status, 'none')::TEXT as subscription_status,
        COALESCE(us.plan_id, 'none')::TEXT as subscription_plan,
        us.trial_end,
        us.current_period_end,
        us.created_at,
        COALESCE(api_stats.total_requests, 0)::BIGINT as total_api_requests
    FROM auth.users au
    LEFT JOIN public.user_subscriptions us ON au.id = us.user_id
    LEFT JOIN (
        SELECT
            user_id,
            SUM(requests_count) as total_requests
        FROM public.api_usage
        WHERE created_at > (NOW() - INTERVAL '30 days')
        GROUP BY user_id
    ) api_stats ON au.id = api_stats.user_id
    ORDER BY us.created_at DESC NULLS LAST, au.created_at DESC;
END;
$$;