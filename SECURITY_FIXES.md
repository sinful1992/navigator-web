# Security Linter Fixes - 2025-10-12

## Overview
This document tracks fixes for Supabase Database Linter security warnings.

---

## ✅ FIXED via Migration (20251012000001_fix_security_linter_warnings.sql)

### 🔴 ERROR: Security Definer View
**Issue**: `admin_upcoming_deletions` view runs with creator's permissions, bypassing RLS
**Risk**: High - Could expose sensitive deletion data to non-admin users
**Fix**: Recreated view with `security_invoker = true`
**Status**: ✅ **Fixed** - Apply migration to Supabase

### ⚠️ WARN: Function Search Path Mutable (3 functions)
**Issue**: Functions don't have fixed `search_path`, vulnerable to search path hijacking
**Risk**: Medium - Attacker could inject malicious functions in earlier schema paths
**Affected Functions**:
- `get_inactive_accounts(INTEGER)`
- `warn_inactive_accounts()`
- `cancel_deletion_on_activity()`

**Fix**: Added `SET search_path = public, pg_temp` to all 3 functions
**Status**: ✅ **Fixed** - Apply migration to Supabase

---

## ⏳ MANUAL FIXES REQUIRED (Dashboard Settings)

### ⚠️ WARN: Leaked Password Protection Disabled
**Issue**: Users can set passwords that appear in HaveIBeenPwned data breaches
**Risk**: Medium - Compromised passwords could lead to account takeover

**Fix Instructions**:
1. Go to Supabase Dashboard → **Authentication** → **Policies**
2. Enable **"Check if password has been leaked"**
3. (Optional) Enable **"Password strength requirements"**

**Reference**: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

**Status**: ⏳ **Pending** - Requires manual dashboard action

---

### ⚠️ WARN: Vulnerable Postgres Version
**Issue**: Current version `supabase-postgres-17.4.1.074` has available security patches
**Risk**: Medium - Unpatched vulnerabilities could be exploited

**Fix Instructions**:
1. Go to Supabase Dashboard → **Settings** → **Database**
2. Click **"Upgrade database"**
3. Review changelog and confirm upgrade
4. **⚠️ IMPORTANT**: Test in staging first, schedule during low-traffic hours

**Reference**: https://supabase.com/docs/guides/platform/upgrading

**Status**: ⏳ **Pending** - Requires scheduled maintenance window

---

## 🚀 How to Apply SQL Fixes

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to **SQL Editor** in Supabase Dashboard
2. Run the migration file:
   ```bash
   # Copy contents of:
   supabase/migrations/20251012000001_fix_security_linter_warnings.sql
   ```
3. Click **Run**

### Option 2: Via Supabase CLI (Local Development)
```bash
# Link to your project (if not already linked)
npx supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
npx supabase db push

# Verify fixes
npx supabase db lint
```

---

## 📊 Verification

After applying fixes, verify in Supabase Dashboard:

### Check View Security
```sql
SELECT relname, reloptions
FROM pg_class
WHERE relname = 'admin_upcoming_deletions';
```
Expected: `reloptions` should contain `{security_invoker=true}`

### Check Function Search Paths
```sql
SELECT proname, proconfig
FROM pg_proc
WHERE proname IN (
  'get_inactive_accounts',
  'warn_inactive_accounts',
  'cancel_deletion_on_activity'
);
```
Expected: `proconfig` should contain `{"search_path=public, pg_temp"}`

### Run Linter Again
```bash
npx supabase db lint
```
Expected: No more ERROR alerts, only the 2 manual warnings should remain

---

## 🎯 Summary

| Issue | Severity | Status | Action Required |
|-------|----------|--------|-----------------|
| Security Definer View | 🔴 ERROR | ✅ Fixed | Run migration |
| Search Path Mutable (3 functions) | ⚠️ WARN | ✅ Fixed | Run migration |
| Leaked Password Protection | ⚠️ WARN | ⏳ Pending | Enable in Dashboard |
| Postgres Version | ⚠️ WARN | ⏳ Pending | Schedule upgrade |

**Next Steps**:
1. ✅ Review migration file
2. ⏳ Apply migration to Supabase
3. ⏳ Enable leaked password protection (5 min)
4. ⏳ Schedule Postgres upgrade (plan maintenance window)
