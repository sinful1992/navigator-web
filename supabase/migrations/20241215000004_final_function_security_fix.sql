-- Final function security fix migration
-- This migration uses dynamic SQL to handle unknown function signatures

-- Step 1: Create a helper function to drop all variations of a function
CREATE OR REPLACE FUNCTION temp_drop_all_function_variations(func_name TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    func_record RECORD;
    drop_sql TEXT;
BEGIN
    -- Find all functions with the given name in public schema
    FOR func_record IN
        SELECT
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args,
            p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = func_name
    LOOP
        -- Build the drop statement with exact signature
        drop_sql := format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE',
                          func_record.proname,
                          func_record.args);

        RAISE NOTICE 'Executing: %', drop_sql;
        EXECUTE drop_sql;
    END LOOP;
END;
$$;

-- Step 2: Drop all function variations using the helper
SELECT temp_drop_all_function_variations('update_updated_at_column');
SELECT temp_drop_all_function_variations('expire_subscriptions');
SELECT temp_drop_all_function_variations('is_admin');
SELECT temp_drop_all_function_variations('is_owner');
SELECT temp_drop_all_function_variations('has_subscription_access');
SELECT temp_drop_all_function_variations('admin_grant_subscription');
SELECT temp_drop_all_function_variations('admin_extend_trial');
SELECT temp_drop_all_function_variations('sync_wins');
SELECT temp_drop_all_function_variations('get_user_api_usage');
SELECT temp_drop_all_function_variations('get_api_usage_stats');
SELECT temp_drop_all_function_variations('get_admin_subscription_overview');
SELECT temp_drop_all_function_variations('get_admin_api_stats');

-- Step 3: Drop the helper function
DROP FUNCTION temp_drop_all_function_variations(TEXT);

-- Step 4: Recreate all functions with security hardening

-- update_updated_at_column function
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Recreate triggers for update_updated_at_column
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_plans' AND table_schema = 'public') THEN
        CREATE TRIGGER update_subscription_plans_updated_at
            BEFORE UPDATE ON public.subscription_plans
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_subscriptions' AND table_schema = 'public') THEN
        CREATE TRIGGER update_user_subscriptions_updated_at
            BEFORE UPDATE ON public.user_subscriptions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_history' AND table_schema = 'public') THEN
        CREATE TRIGGER update_payment_history_updated_at
            BEFORE UPDATE ON public.payment_history
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users' AND table_schema = 'public') THEN
        CREATE TRIGGER update_admin_users_updated_at
            BEFORE UPDATE ON public.admin_users
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- expire_subscriptions function
CREATE FUNCTION expire_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.user_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('active', 'trial')
      AND current_period_end < NOW();

    UPDATE public.user_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'trial'
      AND trial_end < NOW();
END;
$$;

-- is_owner function
CREATE FUNCTION is_owner(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = user_uuid
        AND role = 'owner'
        AND is_active = true
    );
END;
$$;

-- is_admin function
CREATE FUNCTION is_admin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = user_uuid
        AND role IN ('owner', 'admin')
        AND is_active = true
    );
END;
$$;

-- has_subscription_access function
CREATE FUNCTION has_subscription_access(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Check if user is owner
    IF public.is_owner(user_uuid) THEN
        RETURN TRUE;
    END IF;

    -- Check if user has active subscription
    RETURN EXISTS (
        SELECT 1 FROM public.user_subscriptions
        WHERE user_id = user_uuid
          AND status = 'active'
          AND current_period_end > NOW()
    ) OR EXISTS (
        SELECT 1 FROM public.user_subscriptions
        WHERE user_id = user_uuid
          AND status = 'trial'
          AND trial_end > NOW()
    );
END;
$$;

-- admin_grant_subscription function
CREATE FUNCTION admin_grant_subscription(
    target_user_id UUID,
    plan_id VARCHAR(50),
    duration_months INTEGER DEFAULT 1,
    admin_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- admin_extend_trial function
CREATE FUNCTION admin_extend_trial(
    target_user_id UUID,
    additional_days INTEGER,
    admin_notes TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- sync_wins function (simple placeholder)
CREATE FUNCTION sync_wins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Placeholder function for syncing wins/achievements
    RAISE NOTICE 'sync_wins function called at %', NOW();
    -- Add your specific sync logic here
END;
$$;

-- get_user_api_usage function
CREATE FUNCTION get_user_api_usage(
    user_uuid UUID DEFAULT auth.uid(),
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE(
    service TEXT,
    total_requests BIGINT,
    total_successes BIGINT,
    total_addresses BIGINT,
    success_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only allow users to see their own stats or admins to see any stats
    IF user_uuid != auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT
        au.service,
        SUM(au.requests_count)::BIGINT as total_requests,
        SUM(au.success_count)::BIGINT as total_successes,
        SUM(au.addresses_count)::BIGINT as total_addresses,
        CASE
            WHEN SUM(au.requests_count) > 0
            THEN ROUND(SUM(au.success_count)::NUMERIC / SUM(au.requests_count)::NUMERIC * 100, 2)
            ELSE 0
        END as success_rate
    FROM public.api_usage au
    WHERE au.user_id = user_uuid
      AND au.created_at > (NOW() - INTERVAL '1 day' * days_back)
    GROUP BY au.service
    ORDER BY au.service;
END;
$$;

-- get_api_usage_stats function
CREATE FUNCTION get_api_usage_stats(days_back INTEGER DEFAULT 7)
RETURNS TABLE(
    service TEXT,
    total_requests BIGINT,
    total_successes BIGINT,
    unique_users BIGINT,
    avg_requests_per_user NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only admins can access this
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied - admin required';
    END IF;

    RETURN QUERY
    SELECT
        au.service,
        SUM(au.requests_count)::BIGINT as total_requests,
        SUM(au.success_count)::BIGINT as total_successes,
        COUNT(DISTINCT au.user_id)::BIGINT as unique_users,
        CASE
            WHEN COUNT(DISTINCT au.user_id) > 0
            THEN ROUND(SUM(au.requests_count)::NUMERIC / COUNT(DISTINCT au.user_id)::NUMERIC, 2)
            ELSE 0
        END as avg_requests_per_user
    FROM public.api_usage au
    WHERE au.created_at > (NOW() - INTERVAL '1 day' * days_back)
    GROUP BY au.service
    ORDER BY au.service;
END;
$$;

-- get_admin_subscription_overview function
CREATE FUNCTION get_admin_subscription_overview()
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

-- get_admin_api_stats function
CREATE FUNCTION get_admin_api_stats(days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    total_requests BIGINT,
    total_successful BIGINT,
    unique_users BIGINT,
    geocoding_requests BIGINT,
    route_optimization_requests BIGINT,
    address_search_requests BIGINT
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
        SUM(au.requests_count)::BIGINT as total_requests,
        SUM(au.success_count)::BIGINT as total_successful,
        COUNT(DISTINCT au.user_id)::BIGINT as unique_users,
        SUM(CASE WHEN au.service = 'geocoding' THEN au.requests_count ELSE 0 END)::BIGINT as geocoding_requests,
        SUM(CASE WHEN au.service = 'route_optimization' THEN au.requests_count ELSE 0 END)::BIGINT as route_optimization_requests,
        SUM(CASE WHEN au.service = 'address_search' THEN au.requests_count ELSE 0 END)::BIGINT as address_search_requests
    FROM public.api_usage au
    WHERE au.created_at > (NOW() - INTERVAL '1 day' * days_back);
END;
$$;

-- Add function comments
COMMENT ON FUNCTION update_updated_at_column IS 'Trigger function to update updated_at column with secure search_path';
COMMENT ON FUNCTION expire_subscriptions IS 'Expires old subscriptions with secure search_path';
COMMENT ON FUNCTION is_admin IS 'Checks if user is admin with secure search_path';
COMMENT ON FUNCTION is_owner IS 'Checks if user is owner with secure search_path';
COMMENT ON FUNCTION has_subscription_access IS 'Checks subscription access with secure search_path';
COMMENT ON FUNCTION admin_grant_subscription IS 'Admin function to grant subscriptions with secure search_path';
COMMENT ON FUNCTION admin_extend_trial IS 'Admin function to extend trial periods with secure search_path';
COMMENT ON FUNCTION sync_wins IS 'Function to sync wins/achievements with secure search_path';
COMMENT ON FUNCTION get_user_api_usage IS 'Returns API usage statistics for a user with secure search_path';
COMMENT ON FUNCTION get_api_usage_stats IS 'Returns overall API usage statistics with secure search_path';
COMMENT ON FUNCTION get_admin_subscription_overview IS 'Admin subscription overview with secure search_path';
COMMENT ON FUNCTION get_admin_api_stats IS 'Admin API stats with secure search_path';

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION update_updated_at_column TO authenticated;
GRANT EXECUTE ON FUNCTION expire_subscriptions TO service_role;
GRANT EXECUTE ON FUNCTION is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION is_owner TO authenticated;
GRANT EXECUTE ON FUNCTION has_subscription_access TO authenticated;
GRANT EXECUTE ON FUNCTION admin_grant_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION admin_extend_trial TO authenticated;
GRANT EXECUTE ON FUNCTION sync_wins TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_api_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_api_usage_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_subscription_overview TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_api_stats TO authenticated;