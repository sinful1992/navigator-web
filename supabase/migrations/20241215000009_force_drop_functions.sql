-- Force drop all function overloads by specifying exact signatures
-- This handles cases where multiple function signatures exist

-- Drop functions with specific signatures to avoid conflicts
DROP FUNCTION IF EXISTS public.get_api_usage_stats(uuid);
DROP FUNCTION IF EXISTS public.get_api_usage_stats(user_uuid uuid);
DROP FUNCTION IF EXISTS public.get_all_api_usage();
DROP FUNCTION IF EXISTS public.get_admin_overview();
DROP FUNCTION IF EXISTS public.get_user_details(uuid);
DROP FUNCTION IF EXISTS public.get_user_details(target_user_id uuid);
DROP FUNCTION IF EXISTS public.grant_subscription(uuid, text, integer);
DROP FUNCTION IF EXISTS public.grant_subscription(target_user_id uuid, plan_id_param text, duration_days integer);
DROP FUNCTION IF EXISTS public.extend_trial(uuid, integer);
DROP FUNCTION IF EXISTS public.extend_trial(target_user_id uuid, additional_days integer);
DROP FUNCTION IF EXISTS public.check_auth_security();

-- Also drop any CASCADE dependencies if they exist
DROP FUNCTION IF EXISTS public.get_api_usage_stats CASCADE;
DROP FUNCTION IF EXISTS public.get_all_api_usage CASCADE;
DROP FUNCTION IF EXISTS public.get_admin_overview CASCADE;
DROP FUNCTION IF EXISTS public.get_user_details CASCADE;
DROP FUNCTION IF EXISTS public.grant_subscription CASCADE;
DROP FUNCTION IF EXISTS public.extend_trial CASCADE;
DROP FUNCTION IF EXISTS public.check_auth_security CASCADE;