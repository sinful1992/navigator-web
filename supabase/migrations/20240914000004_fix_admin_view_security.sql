-- Fix security vulnerabilities in admin dashboard
-- Drop the insecure admin_subscription_overview view if it exists
DROP VIEW IF EXISTS public.admin_subscription_overview;

-- Create a secure function to get subscription overview data for admins only
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
AS $$
BEGIN
  -- Only admins can access this function
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
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
  LEFT JOIN user_subscriptions us ON au.id = us.user_id
  LEFT JOIN (
    SELECT 
      user_id,
      SUM(requests_count) as total_requests
    FROM api_usage
    WHERE created_at > (NOW() - INTERVAL '30 days')
    GROUP BY user_id
  ) api_stats ON au.id = api_stats.user_id
  ORDER BY us.created_at DESC NULLS LAST, au.created_at DESC;
END;
$$;

-- Create a secure function to get admin API usage statistics
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
AS $$
BEGIN
  -- Only admins can access this function
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
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
  FROM api_usage au
  WHERE au.created_at > (NOW() - INTERVAL '1 day' * days_back);
END;
$$;

-- Add comments
COMMENT ON FUNCTION get_admin_subscription_overview IS 'Securely provides subscription overview data for admin dashboard (admin-only access)';
COMMENT ON FUNCTION get_admin_api_stats IS 'Securely provides API usage statistics for admin dashboard (admin-only access)';

-- Revoke any unnecessary permissions to ensure security
REVOKE ALL ON FUNCTION get_admin_subscription_overview() FROM anon, authenticated;
REVOKE ALL ON FUNCTION get_admin_api_stats(INTEGER) FROM anon, authenticated;

-- Grant execute permission only to authenticated users (function itself checks admin status)
GRANT EXECUTE ON FUNCTION get_admin_subscription_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_api_stats(INTEGER) TO authenticated;