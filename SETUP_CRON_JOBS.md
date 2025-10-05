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

The `warn_inactive_accounts()` function returns a list of users to warn, but doesn't send emails automatically. You have two options:

### Option A: Supabase Edge Function

Create a Supabase Edge Function that:
1. Calls `warn_inactive_accounts()`
2. For each user returned, sends an email via SendGrid/AWS SES/Resend
3. Schedule the edge function to run monthly

### Option B: External Service

Use a service like n8n, Zapier, or Make.com to:
1. Query the `inactive_account_warnings` table daily
2. Send emails for warnings created in last 24 hours
3. Template email with deletion date and "log in to cancel" link

### Example Email Template

```
Subject: ⚠️ Your Navigator Web Account Will Be Deleted Soon

Hi,

Your Navigator Web account has been inactive for 5 months.

Due to our data retention policy (GDPR compliance), accounts inactive for 6 months are automatically deleted.

Your account will be deleted on: [DELETION_DATE]

To keep your account:
→ Simply log in at https://fieldnav.app/

If you want to keep your data but stop using the service:
→ Export your data: Settings → Export All Data

Questions? Contact [YOUR_EMAIL]

Thanks,
Navigator Web Team
```

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
