# Setup Automated Account Deletion (Cron Jobs)

## Overview

This document explains how to set up automated deletion of inactive accounts after 6 months.

**Policy:**
- Accounts inactive for **5 months** → Receive warning email
- Accounts inactive for **6 months** → Automatically deleted (if warning sent)
- **Exception:** Active paying subscribers are never auto-deleted
- **Opt-out:** User simply logs in to cancel deletion

## Prerequisites

- Supabase project with PostgreSQL database
- Migrations applied:
  - `20250105000001_add_delete_user_account_function.sql`
  - `20250105000002_add_inactive_account_deletion.sql`

## Setup Instructions

### Step 1: Enable pg_cron Extension

Run this in your Supabase SQL Editor (only needs to be done once):

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### Step 2: Schedule Warning Job

This job runs on the 1st of each month at 2 AM UTC and identifies users who need warnings:

```sql
SELECT cron.schedule(
  'warn-inactive-accounts',
  '0 2 1 * *',
  $$ SELECT warn_inactive_accounts(); $$
);
```

### Step 3: Schedule Deletion Job

This job runs on the 1st of each month at 3 AM UTC and deletes accounts that have been warned and haven't logged in:

```sql
SELECT cron.schedule(
  'delete-inactive-accounts',
  '0 3 1 * *',
  $$ SELECT delete_inactive_accounts(); $$
);
```

### Step 4: Verify Jobs Are Running

Check scheduled jobs:

```sql
SELECT * FROM cron.job;
```

Expected output:
```
jobid | schedule  | command                             | nodename  | nodeport | database | username | active | jobname
------+-----------+------------------------------------+-----------+----------+----------+----------+--------+-------------------------
1     | 0 2 1 * * | SELECT warn_inactive_accounts();   | localhost | 5432     | postgres | postgres | t      | warn-inactive-accounts
2     | 0 3 1 * * | SELECT delete_inactive_accounts(); | localhost | 5432     | postgres | postgres | t      | delete-inactive-accounts
```

## Email Integration (Optional but Recommended)

The `warn_inactive_accounts()` function creates warning records in the database, but doesn't send emails automatically.

### ✅ Recommended: Supabase Edge Function (Already Created!)

We've created a ready-to-deploy edge function that:
- ✅ Calls `warn_inactive_accounts()` database function
- ✅ Sends professional HTML emails via Resend API
- ✅ Includes deletion date and "Log In to Cancel" button
- ✅ Handles errors and provides detailed logging

**Location:** `supabase/functions/warn-inactive-accounts/`

**Full setup instructions:** See `supabase/functions/warn-inactive-accounts/README.md`

**Quick start:**
1. Sign up for Resend: https://resend.com (free for 3,000 emails/month)
2. Get your API key: https://resend.com/api-keys
3. Add to Supabase: Settings → Edge Functions → Add Secret → `RESEND_API_KEY`
4. Deploy: `npx supabase functions deploy warn-inactive-accounts`
5. Schedule with cron (see edge function README)

### Alternative: External Service

Use a service like n8n, Zapier, or Make.com to:
1. Query the `inactive_account_warnings` table daily
2. Send emails for warnings created in last 24 hours
3. Use your own email template

## Manual Testing

### Test Warning Function

```sql
-- See which accounts would be warned
SELECT * FROM get_inactive_accounts(5);

-- Run warning function (dry run - check results)
SELECT * FROM warn_inactive_accounts();

-- View warnings
SELECT * FROM inactive_account_warnings;
```

### Test Deletion Function

```sql
-- See which accounts would be deleted
SELECT * FROM get_inactive_accounts(6);

-- Run deletion function (CAUTION: This actually deletes accounts!)
SELECT * FROM delete_inactive_accounts();

-- View deletion log
SELECT * FROM account_deletion_log
WHERE deletion_details->>'reason' = 'inactive_account';
```

## Monitoring

### Admin Dashboard Query

View upcoming deletions:

```sql
SELECT * FROM admin_upcoming_deletions;
```

### Monthly Report

Run this on the 5th of each month to see what happened:

```sql
-- Warnings sent last month
SELECT COUNT(*) as warnings_sent
FROM inactive_account_warnings
WHERE warning_sent_at > NOW() - INTERVAL '30 days';

-- Deletions last month
SELECT COUNT(*) as accounts_deleted
FROM account_deletion_log
WHERE deleted_at > NOW() - INTERVAL '30 days'
AND deletion_details->>'reason' = 'inactive_account';
```

## Troubleshooting

### Cron Jobs Not Running

1. Check pg_cron is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Check cron logs:
   ```sql
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```

3. Verify database permissions:
   ```sql
   GRANT EXECUTE ON FUNCTION warn_inactive_accounts TO postgres;
   GRANT EXECUTE ON FUNCTION delete_inactive_accounts TO postgres;
   ```

### Unscheduling Jobs

If you need to disable the automation:

```sql
-- Unschedule warning job
SELECT cron.unschedule('warn-inactive-accounts');

-- Unschedule deletion job
SELECT cron.unschedule('delete-inactive-accounts');
```

### Cancelling a Specific User's Deletion

If a user contacts you before their account is deleted:

```sql
UPDATE inactive_account_warnings
SET cancelled = TRUE, warning_acknowledged = TRUE
WHERE user_email = 'user@example.com';
```

## Legal Compliance

This automated deletion system complies with:

- **GDPR Article 5(1)(c):** Data Minimization - keep data only as long as necessary
- **GDPR Article 5(1)(e):** Storage Limitation - don't keep data longer than needed
- **GDPR Article 17(1)(a):** Right to Erasure - data no longer necessary for purposes

## Important Notes

1. **Active subscribers are protected:** The deletion function checks for active subscriptions
2. **Warning required:** Accounts are only deleted if a warning was sent at least 30 days prior
3. **Audit trail:** All deletions are logged in `account_deletion_log`
4. **User control:** Users can prevent deletion simply by logging in
5. **Grace period:** 30-day warning period gives users time to respond

## Questions?

Contact: [YOUR_SUPPORT_EMAIL]

---

**Last Updated:** 2025-01-05
