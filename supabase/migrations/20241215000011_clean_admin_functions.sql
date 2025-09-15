-- Clean recreation of all admin functions to fix ambiguous column issues
-- This drops all existing admin functions and recreates them cleanly

-- Drop all admin-related functions
DROP FUNCTION IF EXISTS public.is_admin CASCADE;
DROP FUNCTION IF EXISTS public.get_admin_subscription_overview CASCADE;
DROP FUNCTION IF EXISTS public.admin_grant_subscription CASCADE;
DROP FUNCTION IF EXISTS public.admin_extend_trial CASCADE;

-- Create is_admin function
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Use the is_admin_user function to avoid RLS recursion
    RETURN public.is_admin_user();
END;
$$;

-- Create get_admin_subscription_overview function with proper column qualification
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        auth_users.email::TEXT as user_email,
        COALESCE(user_subs.status, 'none')::TEXT as subscription_status,
        COALESCE(user_subs.plan_id, 'none')::TEXT as subscription_plan,
        user_subs.trial_end,
        user_subs.current_period_end,
        user_subs.created_at as created_at,
        COALESCE(api_stats.total_requests, 0)::BIGINT as total_api_requests
    FROM auth.users auth_users
    LEFT JOIN public.user_subscriptions user_subs ON auth_users.id = user_subs.user_id
    LEFT JOIN (
        SELECT
            user_id,
            SUM(requests_count) as total_requests
        FROM public.api_usage
        WHERE created_at > (NOW() - INTERVAL '30 days')
        GROUP BY user_id
    ) api_stats ON auth_users.id = api_stats.user_id
    ORDER BY user_subs.created_at DESC NULLS LAST, auth_users.created_at DESC;
END;
$$;

-- Create admin_grant_subscription function
CREATE OR REPLACE FUNCTION public.admin_grant_subscription(
    target_user_id UUID,
    plan_id VARCHAR(50),
    duration_months INTEGER DEFAULT 1,
    admin_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_sub_id UUID;
BEGIN
    -- Only admins can grant subscriptions
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    -- Check if plan exists
    IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = plan_id) THEN
        RAISE EXCEPTION 'Plan does not exist: %', plan_id;
    END IF;

    -- Check if user has existing subscription
    SELECT id INTO existing_sub_id
    FROM public.user_subscriptions
    WHERE user_id = target_user_id
      AND status IN ('active', 'trial')
    LIMIT 1;

    IF existing_sub_id IS NOT NULL THEN
        -- Extend existing subscription
        UPDATE public.user_subscriptions
        SET
            plan_id = admin_grant_subscription.plan_id,
            current_period_end = GREATEST(
                current_period_end,
                NOW()
            ) + INTERVAL '1 month' * duration_months,
            status = 'active',
            updated_at = NOW()
        WHERE id = existing_sub_id;
    ELSE
        -- Create new subscription
        INSERT INTO public.user_subscriptions (
            user_id,
            plan_id,
            status,
            current_period_start,
            current_period_end
        ) VALUES (
            target_user_id,
            admin_grant_subscription.plan_id,
            'active',
            NOW(),
            NOW() + INTERVAL '1 month' * duration_months
        );
    END IF;

    RETURN TRUE;
END;
$$;

-- Create admin_extend_trial function
CREATE OR REPLACE FUNCTION public.admin_extend_trial(
    target_user_id UUID,
    additional_days INTEGER,
    admin_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_sub_id UUID;
BEGIN
    -- Only admins can extend trials
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied - admin privileges required';
    END IF;

    -- Find existing subscription
    SELECT id INTO existing_sub_id
    FROM public.user_subscriptions
    WHERE user_id = target_user_id
      AND status IN ('trial', 'active', 'expired')
    ORDER BY created_at DESC
    LIMIT 1;

    IF existing_sub_id IS NOT NULL THEN
        -- Extend trial
        UPDATE public.user_subscriptions
        SET
            status = 'trial',
            trial_end = GREATEST(
                COALESCE(trial_end, NOW()),
                NOW()
            ) + INTERVAL '1 day' * additional_days,
            trial_start = CASE
                WHEN trial_start IS NULL THEN NOW()
                ELSE trial_start
            END,
            updated_at = NOW()
        WHERE id = existing_sub_id;
    ELSE
        -- Create new trial subscription with default plan
        INSERT INTO public.user_subscriptions (
            user_id,
            plan_id,
            status,
            current_period_start,
            current_period_end,
            trial_start,
            trial_end
        ) VALUES (
            target_user_id,
            'basic-monthly',
            'trial',
            NOW(),
            NOW() + INTERVAL '1 day' * additional_days,
            NOW(),
            NOW() + INTERVAL '1 day' * additional_days
        );
    END IF;

    RETURN TRUE;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_subscription_overview TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial TO authenticated;