-- Add missing indexes on foreign keys for better query performance
-- This addresses unindexed_foreign_keys warnings

-- Index for admin_actions.target_subscription_id foreign key
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_subscription_id
ON public.admin_actions(target_subscription_id);

-- Index for admin_users.created_by foreign key
CREATE INDEX IF NOT EXISTS idx_admin_users_created_by
ON public.admin_users(created_by);

-- Index for user_subscriptions.plan_id foreign key
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id
ON public.user_subscriptions(plan_id);

-- Add comments explaining the indexes
COMMENT ON INDEX idx_admin_actions_target_subscription_id
IS 'Index for foreign key lookup and JOIN performance on target_subscription_id';

COMMENT ON INDEX idx_admin_users_created_by
IS 'Index for foreign key lookup and JOIN performance on created_by';

COMMENT ON INDEX idx_user_subscriptions_plan_id
IS 'Index for foreign key lookup and JOIN performance on plan_id';
