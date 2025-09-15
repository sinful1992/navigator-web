-- Final fix for get_admin_subscription_overview function
-- This completely replaces the function to fix the ambiguous created_at issue

DROP FUNCTION IF EXISTS public.get_admin_subscription_overview() CASCADE;

CREATE OR REPLACE FUNCTION public.get_admin_subscription_overview()
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
SET search_path = public
AS $$
BEGIN
    -- Only admins can access this function
    IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        u.email::TEXT as user_email,
        COALESCE(s.status, 'none')::TEXT as subscription_status,
        COALESCE(s.plan_id, 'none')::TEXT as subscription_plan,
        s.trial_end,
        s.current_period_end,
        s.created_at as created_at,
        COALESCE(api_stats.total_requests, 0)::BIGINT as total_api_requests
    FROM auth.users u
    LEFT JOIN public.user_subscriptions s ON u.id = s.user_id
    LEFT JOIN (
        SELECT
            user_id,
            SUM(requests_count) as total_requests
        FROM public.api_usage
        WHERE created_at > (NOW() - INTERVAL '30 days')
        GROUP BY user_id
    ) api_stats ON u.id = api_stats.user_id
    ORDER BY s.created_at DESC NULLS LAST, u.created_at DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_admin_subscription_overview TO authenticated;