-- Add API usage tracking table for monitoring OpenRouteService usage
CREATE TABLE api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('geocoding', 'route_optimization', 'address_search')),
  requests_count INTEGER DEFAULT 1,
  success_count INTEGER DEFAULT 0,
  addresses_count INTEGER DEFAULT 0, -- For batch operations
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX idx_api_usage_service ON api_usage(service);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX idx_api_usage_user_service ON api_usage(user_id, service);

-- RLS policies for api_usage table
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own usage
CREATE POLICY "Users can view own API usage" ON api_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Only the system can insert usage records (via service role)
CREATE POLICY "System can insert API usage" ON api_usage
  FOR INSERT WITH CHECK (true);

-- Admins can view all usage for analytics
CREATE POLICY "Admins can view all API usage" ON api_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE user_id = auth.uid()
    )
  );

-- Function to check if user has subscription access (already exists but ensuring it's available)
CREATE OR REPLACE FUNCTION has_subscription_access()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is owner
  IF is_owner() THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user has active subscription
  RETURN EXISTS (
    SELECT 1 FROM user_subscriptions 
    WHERE user_id = auth.uid() 
      AND status = 'active'
      AND current_period_end > NOW()
  ) OR EXISTS (
    SELECT 1 FROM user_subscriptions 
    WHERE user_id = auth.uid() 
      AND status = 'trial'
      AND trial_end > NOW()
  );
END;
$$;

-- Function to get user's API usage statistics
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
AS $$
BEGIN
  -- Only allow users to see their own stats or admins to see any stats
  IF user_uuid != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
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
  FROM api_usage au
  WHERE au.user_id = user_uuid
    AND au.created_at > (NOW() - INTERVAL '1 day' * days_back)
  GROUP BY au.service
  ORDER BY au.service;
END;
$$;

-- Function to get overall API usage statistics (admin only)
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
AS $$
BEGIN
  -- Only admins can access this
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
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
  FROM api_usage au
  WHERE au.created_at > (NOW() - INTERVAL '1 day' * days_back)
  GROUP BY au.service
  ORDER BY au.service;
END;
$$;

-- Add comment explaining the API usage tracking
COMMENT ON TABLE api_usage IS 'Tracks usage of OpenRouteService API calls made through our edge functions for analytics and billing purposes';
COMMENT ON FUNCTION get_user_api_usage IS 'Returns API usage statistics for a specific user over the specified time period';
COMMENT ON FUNCTION get_api_usage_stats IS 'Returns overall API usage statistics for admin dashboard (admin only)';