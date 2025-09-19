-- Secure server-side trial access validation
-- This prevents client-side manipulation of trial access

-- Function to check if user has valid trial access (server-side validation)
CREATE OR REPLACE FUNCTION public.check_trial_access(target_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    subscription_record record;
    result jsonb;
    hours_since_creation numeric;
BEGIN
    -- Get the user's subscription
    SELECT *
    INTO subscription_record
    FROM public.user_subscriptions
    WHERE user_id = target_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- No subscription found
    IF subscription_record IS NULL THEN
        RETURN jsonb_build_object(
            'hasAccess', false,
            'reason', 'no_subscription',
            'message', 'No subscription found'
        );
    END IF;

    -- Check if subscription is active (normal case)
    IF subscription_record.status = 'trial' AND subscription_record.current_period_end > NOW() THEN
        RETURN jsonb_build_object(
            'hasAccess', true,
            'reason', 'active_trial',
            'expiresAt', subscription_record.current_period_end,
            'daysRemaining', EXTRACT(EPOCH FROM (subscription_record.current_period_end - NOW())) / 86400
        );
    END IF;

    -- Check if this is a fresh trial (within 24 hours) for unconfirmed users
    hours_since_creation := EXTRACT(EPOCH FROM (NOW() - subscription_record.created_at)) / 3600;

    -- If user created trial within last 24 hours, check if email is confirmed
    IF hours_since_creation <= 24 AND subscription_record.status = 'trial' THEN
        -- Check if user email is confirmed in auth.users
        IF EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = target_user_id
            AND email_confirmed_at IS NOT NULL
        ) THEN
            -- Email confirmed - should have normal trial access
            RETURN jsonb_build_object(
                'hasAccess', true,
                'reason', 'confirmed_trial',
                'expiresAt', subscription_record.current_period_end,
                'daysRemaining', EXTRACT(EPOCH FROM (subscription_record.current_period_end - NOW())) / 86400
            );
        ELSE
            -- Email not confirmed but within 24 hour grace period
            RETURN jsonb_build_object(
                'hasAccess', true,
                'reason', 'unconfirmed_grace_period',
                'graceExpiresAt', subscription_record.created_at + INTERVAL '24 hours',
                'hoursRemaining', 24 - hours_since_creation,
                'message', 'Please confirm your email to continue after 24 hours'
            );
        END IF;
    END IF;

    -- Trial expired or other status
    RETURN jsonb_build_object(
        'hasAccess', false,
        'reason', 'expired',
        'message', 'Trial period has expired',
        'expiredAt', subscription_record.current_period_end
    );

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_trial_access(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.check_trial_access IS 'Securely validates trial access server-side to prevent client manipulation';