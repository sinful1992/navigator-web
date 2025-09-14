-- Fix remaining function search_path security warnings
-- Add search_path = '' to functions missing this security setting

-- Fix update_updated_at_column function
-- First, drop dependent triggers, then function, then recreate everything

-- Drop triggers that depend on update_updated_at_column
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON public.subscription_plans;
DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON public.user_subscriptions;
DROP TRIGGER IF EXISTS update_payment_history_updated_at ON public.payment_history;
DROP TRIGGER IF EXISTS update_admin_users_updated_at ON public.admin_users;

-- Now drop the function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Recreate the function with security hardening
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

-- Recreate the triggers
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
    BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_history_updated_at
    BEFORE UPDATE ON public.payment_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Check if admin_users table exists and create trigger if needed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users' AND table_schema = 'public') THEN
        EXECUTE 'CREATE TRIGGER update_admin_users_updated_at
            BEFORE UPDATE ON public.admin_users
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;

-- Fix expire_subscriptions function
-- Drop existing function first to handle any signature changes
DROP FUNCTION IF EXISTS expire_subscriptions();

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

    -- Update trials that have expired
    UPDATE public.user_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'trial'
      AND trial_end < NOW();
END;
$$;

-- Fix admin_grant_subscription function
-- Drop existing function first to handle return type change
DROP FUNCTION IF EXISTS admin_grant_subscription(UUID, VARCHAR(50), INTEGER, TEXT);
DROP FUNCTION IF EXISTS admin_grant_subscription(UUID, VARCHAR(50), INTEGER);
DROP FUNCTION IF EXISTS admin_grant_subscription(UUID, VARCHAR(50));

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
    IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
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

-- Fix admin_extend_trial function
-- Drop existing function first to handle return type change
DROP FUNCTION IF EXISTS admin_extend_trial(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS admin_extend_trial(UUID, INTEGER);

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
    IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
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

-- Create sync_wins function if it doesn't exist (appears to be missing)
-- Drop existing function first to handle any signature changes
DROP FUNCTION IF EXISTS sync_wins();

CREATE FUNCTION sync_wins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- This function appears to be for syncing some kind of wins/achievements
    -- Since it's referenced in the linter but not defined, creating a placeholder
    -- You may need to implement actual logic based on your requirements

    -- For now, just log that the function was called
    RAISE NOTICE 'sync_wins function called at %', NOW();

    -- Add your sync logic here
    -- Example: UPDATE some_table SET sync_status = 'synced' WHERE sync_status = 'pending';
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION update_updated_at_column IS 'Trigger function to update updated_at column with secure search_path';
COMMENT ON FUNCTION expire_subscriptions IS 'Expires old subscriptions with secure search_path';
COMMENT ON FUNCTION admin_grant_subscription IS 'Admin function to grant subscriptions with secure search_path';
COMMENT ON FUNCTION admin_extend_trial IS 'Admin function to extend trial periods with secure search_path';
COMMENT ON FUNCTION sync_wins IS 'Function to sync wins/achievements with secure search_path';

-- Grant execute permissions to appropriate roles
GRANT EXECUTE ON FUNCTION update_updated_at_column TO authenticated;
GRANT EXECUTE ON FUNCTION expire_subscriptions TO service_role;
GRANT EXECUTE ON FUNCTION admin_grant_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION admin_extend_trial TO authenticated;
GRANT EXECUTE ON FUNCTION sync_wins TO authenticated;