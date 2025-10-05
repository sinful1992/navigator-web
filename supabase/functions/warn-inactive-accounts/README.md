# Warn Inactive Accounts - Supabase Edge Function

This edge function automatically sends warning emails to users who haven't logged in for 5 months, notifying them that their account will be deleted in 30 days due to inactivity.

## Features

- ✅ Calls `warn_inactive_accounts()` database function
- ✅ Sends professional HTML emails via Resend API
- ✅ Includes deletion date and "Log In to Cancel" button
- ✅ GDPR-compliant messaging
- ✅ Error handling and logging
- ✅ Secure with bearer token authentication
- ✅ Returns detailed results (success/failure counts)

## Prerequisites

1. **Resend Account**
   - Sign up at https://resend.com
   - Get your API key from https://resend.com/api-keys
   - Verify your sending domain (or use Resend's test domain for development)

2. **Supabase CLI**
   ```bash
   npm install -g supabase
   ```

3. **Migrations Applied**
   - `20250105000001_add_delete_user_account_function.sql`
   - `20250105000002_add_inactive_account_deletion.sql`

## Setup Instructions

### Step 1: Set Environment Variables

In your Supabase dashboard:

1. Go to **Settings** → **Edge Functions**
2. Click **Add Secret**
3. Add these environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `RESEND_API_KEY` | `re_...` | Your Resend API key |
| `CRON_SECRET` | `your-random-secret` | Secret for authenticating cron requests (optional) |

**Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in edge functions.

### Step 2: Update Email "From" Address

Edit `index.ts` line 66:

```typescript
from: "Navigator Web <noreply@fieldnav.app>", // Update with your verified domain
```

Replace with your verified Resend domain:
- Development: `"Navigator Web <onboarding@resend.dev>"` (Resend test domain)
- Production: `"Navigator Web <noreply@yourdomain.com>"` (your verified domain)

**To verify a domain in Resend:**
1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Add DNS records as shown
4. Wait for verification

### Step 3: Deploy the Edge Function

From your project root:

```bash
# Login to Supabase (first time only)
npx supabase login

# Link to your project (first time only)
npx supabase link --project-ref your-project-ref

# Deploy the function
npx supabase functions deploy warn-inactive-accounts
```

**Find your project ref:**
- Go to your Supabase dashboard
- Settings → General → Project Settings → Reference ID

### Step 4: Test the Function

#### Test via Supabase Dashboard

1. Go to **Edge Functions** in Supabase dashboard
2. Select `warn-inactive-accounts`
3. Click **Invoke**
4. Add headers (if using CRON_SECRET):
   ```json
   {
     "Authorization": "Bearer your-cron-secret"
   }
   ```
5. Click **Send Request**

#### Test via curl

```bash
# Get your function URL from Supabase dashboard
curl -i --location --request POST \
  'https://your-project-ref.supabase.co/functions/v1/warn-inactive-accounts' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json'
```

**Expected response:**
```json
{
  "success": true,
  "summary": {
    "total_warnings": 3,
    "emails_sent": 3,
    "emails_failed": 0
  },
  "results": [
    {
      "email": "user1@example.com",
      "success": true,
      "resend_id": "re_abc123..."
    }
  ]
}
```

### Step 5: Schedule Monthly Execution

You have two options:

#### Option A: Supabase Cron (Recommended)

Create a Supabase cron job that calls the edge function:

```sql
-- In Supabase SQL Editor
SELECT cron.schedule(
  'monthly-warn-inactive-accounts',
  '0 2 1 * *', -- 1st of month at 2 AM
  $$
    SELECT
      net.http_post(
        url := 'https://your-project-ref.supabase.co/functions/v1/warn-inactive-accounts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
        )
      ) as request_id;
  $$
);
```

**Set the cron secret:**
```sql
-- In Supabase SQL Editor
ALTER DATABASE postgres SET "app.settings.cron_secret" TO 'your-cron-secret';
```

#### Option B: External Cron (GitHub Actions, Vercel Cron, etc.)

Use a GitHub Action workflow:

```yaml
# .github/workflows/warn-inactive-accounts.yml
name: Warn Inactive Accounts
on:
  schedule:
    - cron: '0 2 1 * *' # 1st of month at 2 AM UTC
  workflow_dispatch: # Allow manual trigger

jobs:
  warn:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Edge Function
        run: |
          curl -X POST \
            https://your-project-ref.supabase.co/functions/v1/warn-inactive-accounts \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

### Step 6: Monitor Execution

#### View Logs

In Supabase dashboard:
1. Go to **Edge Functions**
2. Select `warn-inactive-accounts`
3. Click **Logs** tab

#### Query Results

```sql
-- Check warnings created
SELECT * FROM inactive_account_warnings
WHERE warning_sent_at > NOW() - INTERVAL '7 days'
ORDER BY warning_sent_at DESC;

-- Check upcoming deletions
SELECT * FROM admin_upcoming_deletions;
```

## Email Customization

### Change Email Content

Edit the `generateEmailHTML()` function in `index.ts`:

```typescript
function generateEmailHTML(email: string, deletionDate: string): string {
  return `
    <!-- Your custom HTML here -->
  `;
}
```

### Add Text-Only Version (Recommended)

Modify the Resend API call to include a text version:

```typescript
body: JSON.stringify({
  from: "Navigator Web <noreply@fieldnav.app>",
  to: [warning.email],
  subject: "⚠️ Your Navigator Web Account Will Be Deleted Soon",
  html: generateEmailHTML(warning.email, deletionDate),
  text: generateEmailText(warning.email, deletionDate), // Add this
}),
```

Then create:

```typescript
function generateEmailText(email: string, deletionDate: string): string {
  return `
Hi,

Your Navigator Web account (${email}) has been inactive for 5 months.

Due to our data retention policy (GDPR compliance), accounts inactive for 6 months are automatically deleted.

Your account will be deleted on: ${deletionDate}

To keep your account:
→ Log in at https://fieldnav.app/

Want to keep your data but stop using the service?
→ Export your data: Settings → Export All Data

Questions? Reply to this email or contact support.

Thanks,
Navigator Web Team
  `.trim();
}
```

## Troubleshooting

### Emails Not Sending

1. **Check Resend API Key**
   ```bash
   curl https://api.resend.com/emails \
     -H "Authorization: Bearer re_your_api_key" \
     -H "Content-Type: application/json" \
     -d '{"from": "onboarding@resend.dev", "to": "test@example.com", "subject": "Test", "html": "Test"}'
   ```

2. **Check Domain Verification**
   - Go to https://resend.com/domains
   - Ensure your domain is verified (green checkmark)

3. **Check Edge Function Logs**
   - Supabase Dashboard → Edge Functions → warn-inactive-accounts → Logs
   - Look for error messages

### Function Returns 401 Unauthorized

- Check `CRON_SECRET` matches in both:
  - Edge function environment variables
  - Cron job or GitHub Action

### No Warnings Created

```sql
-- Check if there are any inactive users
SELECT * FROM get_inactive_accounts(5);

-- Manually run warning function
SELECT * FROM warn_inactive_accounts();
```

## Security Best Practices

1. **Use CRON_SECRET** to prevent unauthorized invocations
2. **Verify sending domain** to avoid spoofing
3. **Monitor logs** for unusual activity
4. **Rate limit** if needed (Resend has built-in limits)
5. **Store secrets** in Supabase environment variables, not in code

## Cost Estimates

**Resend Pricing (as of 2025):**
- Free tier: 100 emails/day, 3,000 emails/month
- Pro: $20/month for 50,000 emails

**Supabase Edge Functions:**
- Free tier: 500,000 invocations/month
- Pro: $25/month for 2,000,000 invocations

**Monthly cost for this function:**
- Runs once per month
- Sends ~N emails (N = number of inactive users)
- Likely stays within free tier

## Support

- **Resend Docs:** https://resend.com/docs
- **Supabase Edge Functions Docs:** https://supabase.com/docs/guides/functions
- **Deno Docs:** https://deno.land/manual

---

**Last Updated:** 2025-01-05
