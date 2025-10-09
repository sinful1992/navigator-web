-- Fix admin_extend_trial to use correct 'trial' plan_id instead of 'basic-monthly'

DROP FUNCTION IF EXISTS public.admin_extend_trial(UUID, INTEGER, TEXT) CASCADE;

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
      AND status IN ('trial', 'trialing', 'active', 'expired')
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
            current_period_end = GREATEST(
                COALESCE(current_period_end, NOW()),
                NOW()
            ) + INTERVAL '1 day' * additional_days,
            updated_at = NOW()
        WHERE id = existing_sub_id;
    ELSE
        -- Create new trial subscription with 'trial' plan_id
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
            'trial',
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
GRANT EXECUTE ON FUNCTION public.admin_extend_trial TO authenticated;

COMMENT ON FUNCTION public.admin_extend_trial IS 'Extends trial period for a user by specified days, creating trial subscription if none exists';
