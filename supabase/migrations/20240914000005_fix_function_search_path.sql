-- Fix function search_path security warnings
-- Add search_path = '' to all functions for security hardening

-- Fix has_subscription_access function
CREATE OR REPLACE FUNCTION has_subscription_access()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check if user is owner
  IF public.is_owner() THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has active subscription
  RETURN EXISTS (
    SELECT 1 FROM public.user_subscriptions 
    WHERE user_id = auth.uid() 
      AND status = 'active'
      AND current_period_end > NOW()
  ) OR EXISTS (
    SELECT 1 FROM public.user_subscriptions 
    WHERE user_id = auth.uid() 
      AND status = 'trial'
      AND trial_end > NOW()
  );
END;
$$;

-- Fix is_owner function
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND role = 'owner' 
    AND is_active = true
  );
END;
$$;

-- Fix is_admin function
CREATE OR REPLACE FUNCTION is_admin(user_uuid UUID DEFAULT auth.uid())
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

-- Fix get_admin_subscription_overview function
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
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
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

-- Fix get_admin_api_stats function
CREATE OR REPLACE FUNCTION get_admin_api_stats(days_back INTEGER DEFAULT 30)
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
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
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

-- Fix get_user_api_usage function
CREATE OR REPLACE FUNCTION get_user_api_usage(
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
  IF user_uuid != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  ) THEN
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

-- Fix get_api_usage_stats function
CREATE OR REPLACE FUNCTION get_api_usage_stats(days_back INTEGER DEFAULT 7)
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
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
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

-- Add comments
COMMENT ON FUNCTION has_subscription_access IS 'Checks if user has subscription access with secure search_path';
COMMENT ON FUNCTION is_owner IS 'Checks if user is owner with secure search_path';
COMMENT ON FUNCTION is_admin IS 'Checks if user is admin with secure search_path';
COMMENT ON FUNCTION get_admin_subscription_overview IS 'Admin subscription overview with secure search_path';
COMMENT ON FUNCTION get_admin_api_stats IS 'Admin API stats with secure search_path';
COMMENT ON FUNCTION get_user_api_usage IS 'User API usage with secure search_path';
COMMENT ON FUNCTION get_api_usage_stats IS 'API usage stats with secure search_path';