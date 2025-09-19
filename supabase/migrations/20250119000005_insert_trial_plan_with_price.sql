-- Insert trial and premium plans with correct column structure
-- Based on the error, the table has: id, name, price, currency, features, trial_days, is_active, created_at, updated_at

INSERT INTO public.subscription_plans (
    id,
    name,
    price,
    currency,
    features,
    trial_days,
    is_active
) VALUES (
    'trial',
    '14-Day Free Trial',
    0,
    'GBP',
    '{}',
    14,
    true
) ON CONFLICT (id) DO NOTHING;

-- Also insert premium plan
INSERT INTO public.subscription_plans (
    id,
    name,
    price,
    currency,
    features,
    trial_days,
    is_active
) VALUES (
    'premium',
    'Premium Plan',
    2500,
    'GBP',
    '{"Address management","Completion tracking","Arrangement scheduling","Earnings calculation","Cloud sync","Route planning","Priority support"}',
    14,
    true
) ON CONFLICT (id) DO NOTHING;