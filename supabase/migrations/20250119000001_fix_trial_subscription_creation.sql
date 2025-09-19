-- Fix trial subscription creation for new users
-- This function allows new users to create their initial trial subscription

-- Create a function to initialize new user subscriptions
CREATE OR REPLACE FUNCTION public.create_trial_subscription(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = ''
AS $$
DECLARE
    trial_end_date timestamp with time zone;
    result jsonb;
    subscription_id uuid;
BEGIN
    -- Only allow users to create their own trial OR admins to create for anyone
    IF target_user_id != auth.uid() AND NOT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Access denied - can only create trial for yourself';
    END IF;

    -- Check if user already has a subscription
    IF EXISTS (
        SELECT 1 FROM public.user_subscriptions
        WHERE user_id = target_user_id
    ) THEN
        RAISE EXCEPTION 'User already has a subscription';
    END IF;

    -- Calculate trial end date (14 days from now)
    trial_end_date := NOW() + INTERVAL '14 days';

    -- Insert the trial subscription
    INSERT INTO public.user_subscriptions (
        user_id,
        plan_id,
        status,
        trial_start,
        trial_end,
        current_period_start,
        current_period_end,
        created_at,
        updated_at
    ) VALUES (
        target_user_id,
        'trial',
        'trialing',
        NOW(),
        trial_end_date,
        NOW(),
        trial_end_date,
        NOW(),
        NOW()
    ) RETURNING id INTO subscription_id;

    -- Return success result
    result := jsonb_build_object(
        'success', true,
        'subscription_id', subscription_id,
        'user_id', target_user_id,
        'plan_id', 'trial',
        'status', 'trialing',
        'trial_end', trial_end_date,
        'message', 'Trial subscription created successfully'
    );

    RETURN result;

EXCEPTION
    WHEN OTHERS THEN
        -- Return error details
        result := jsonb_build_object(
            'success', false,
            'error', SQLSTATE,
            'message', SQLERRM
        );
        RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_trial_subscription(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.create_trial_subscription IS 'Creates a 14-day trial subscription for new users, bypassing RLS restrictions';