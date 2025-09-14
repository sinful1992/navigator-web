# Supabase Security Configuration Guide

This document outlines the steps to fix all security warnings identified in your Supabase linter report.

## 🔧 Database Migration Steps

### 1. Apply Database Migrations

Run these migrations in your Supabase SQL editor:

```bash
# Apply the function security fixes
supabase db push

# Or manually run in SQL editor:
# - 20241215000001_fix_remaining_function_security.sql
# - 20241215000002_fix_auth_security_settings.sql
```

## 🔐 Dashboard Configuration Steps

### 2. Fix Leaked Password Protection

**Location**: Supabase Dashboard → Authentication → Settings → Security

1. Navigate to your Supabase project dashboard
2. Go to **Authentication** → **Settings** → **Security**
3. Find **"Password protection"** section
4. **Enable** "Check for leaked passwords"
5. This uses HaveIBeenPwned.org database to prevent compromised passwords

### 3. Configure Multi-Factor Authentication

**Location**: Supabase Dashboard → Authentication → Settings → Multi-Factor Authentication

1. Go to **Authentication** → **Settings** → **Multi-Factor Authentication**
2. **Enable** the following MFA methods:
   - ✅ **TOTP** (Time-based One-Time Password) - for Google Authenticator, Authy, etc.
   - ✅ **Phone** (if you want SMS-based MFA)
   - ✅ **WebAuthn** (for hardware security keys - optional but recommended)

3. Configure MFA settings:
   - **Enrollment**: Allow users to enroll in MFA
   - **Enforcement**: Set to "Optional" initially, then "Required" after testing

### 4. Strengthen Password Policy

**Location**: Supabase Dashboard → Authentication → Settings → Security

1. In the **Password policy** section, configure:
   - **Minimum length**: 12 characters
   - **Require uppercase**: ✅ Yes
   - **Require lowercase**: ✅ Yes
   - **Require numbers**: ✅ Yes
   - **Require special characters**: ✅ Yes

### 5. Configure Session Security

**Location**: Supabase Dashboard → Authentication → Settings → Security

1. In the **Session management** section:
   - **JWT expiry**: 3600 seconds (1 hour)
   - **Refresh token rotation**: ✅ Enable
   - **Reuse interval**: 10 seconds

2. In the **Email** section:
   - **Confirm email**: ✅ Enable
   - **Email change confirmation**: ✅ Enable

## 🗄️ Database Version Update

### 6. Upgrade Postgres Version

**Location**: Supabase Dashboard → Settings → Database

1. Go to **Settings** → **Database**
2. In the **Database version** section
3. Click **"Upgrade"** to get the latest Postgres version with security patches
4. **Important**: Schedule this during low-traffic periods as it requires a brief downtime

## ✅ Verification Steps

### 7. Run Security Audit

After applying the changes, run this in your Supabase SQL editor to verify:

```sql
-- Check function security (should return no rows)
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_definition NOT LIKE '%search_path%';

-- Check RLS status
SELECT * FROM security_audit;

-- Check auth security status (admin only)
SELECT * FROM check_auth_security_status();
```

## 🎯 Expected Results

After completing all steps:

- ✅ **Function search_path warnings**: RESOLVED (all functions secured)
- ✅ **Leaked password protection**: ENABLED
- ✅ **MFA options**: CONFIGURED (TOTP + optional SMS/WebAuthn)
- ✅ **Postgres version**: UPDATED to latest

## 📋 Implementation Checklist

- [ ] Apply database migrations (function security fixes)
- [ ] Enable leaked password protection in dashboard
- [ ] Configure MFA options (TOTP minimum)
- [ ] Strengthen password policy (12+ chars, complexity)
- [ ] Configure session security settings
- [ ] Upgrade Postgres version
- [ ] Run verification queries
- [ ] Test authentication flow with new settings

## ⚠️ Important Notes

1. **Test thoroughly**: Test auth flows after each change
2. **User communication**: Inform users about new password requirements
3. **MFA rollout**: Consider gradual MFA enforcement
4. **Backup**: Ensure you have recent backups before Postgres upgrade
5. **Downtime**: Postgres upgrade requires brief downtime

## 🔍 Monitoring

After implementation, monitor:
- Authentication success/failure rates
- User complaints about password requirements
- MFA adoption rates
- Any security-related errors in logs

This comprehensive security update will resolve all the Supabase linter warnings and significantly improve your application's security posture.