// Supabase Edge Function: Warn Inactive Accounts
// Runs monthly to send warning emails to users who haven't logged in for 5 months
// Uses Resend API for email delivery

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface InactiveAccountWarning {
  user_id: string;
  email: string;
  warning_sent: boolean;
  message: string;
}

serve(async (req: Request) => {
  try {
    // Verify request is authorized (optional: add API key or cron secret)
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check required environment variables
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment variables are not set");
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Call database function to get users who need warnings
    const { data, error } = await supabase.rpc("warn_inactive_accounts");

    if (error) {
      console.error("Database error:", error);
      throw new Error(`Failed to get inactive accounts: ${error.message}`);
    }

    const warnings: InactiveAccountWarning[] = data || [];

    console.log(`Found ${warnings.length} users to warn`);

    // Send emails via Resend
    const emailResults = [];

    for (const warning of warnings) {
      try {
        // Extract deletion date from message
        const deletionDateMatch = warning.message.match(/(\d{4}-\d{2}-\d{2})/);
        const deletionDate = deletionDateMatch
          ? new Date(deletionDateMatch[1]).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })
          : "30 days from now";

        // Send email via Resend
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Navigator Web <noreply@fieldnav.app>", // Update with your verified domain
            to: [warning.email],
            subject: "⚠️ Your Navigator Web Account Will Be Deleted Soon",
            html: generateEmailHTML(warning.email, deletionDate),
          }),
        });

        const emailData = await emailResponse.json();

        if (!emailResponse.ok) {
          console.error(`Failed to send email to ${warning.email}:`, emailData);
          emailResults.push({
            email: warning.email,
            success: false,
            error: emailData.message || "Unknown error",
          });
        } else {
          console.log(`Email sent to ${warning.email}:`, emailData.id);
          emailResults.push({
            email: warning.email,
            success: true,
            resend_id: emailData.id,
          });
        }
      } catch (emailError) {
        console.error(`Error sending email to ${warning.email}:`, emailError);
        emailResults.push({
          email: warning.email,
          success: false,
          error: emailError.message,
        });
      }
    }

    // Summary
    const successCount = emailResults.filter(r => r.success).length;
    const failureCount = emailResults.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_warnings: warnings.length,
          emails_sent: successCount,
          emails_failed: failureCount,
        },
        results: emailResults,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});

// Generate HTML email content
function generateEmailHTML(email: string, deletionDate: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deletion Warning</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Navigator Web</h1>
      <p style="margin: 10px 0 0 0; color: #ffffff; opacity: 0.9; font-size: 14px;">Professional Enforcement Tools</p>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px;">
      <!-- Warning Icon -->
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; background-color: #fff5f5; border-radius: 50%; padding: 20px; margin-bottom: 20px;">
          <span style="font-size: 48px;">⚠️</span>
        </div>
        <h2 style="margin: 0; color: #c53030; font-size: 24px; font-weight: 600;">Account Deletion Warning</h2>
      </div>

      <!-- Main Message -->
      <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        Hi,
      </p>

      <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        Your Navigator Web account (<strong>${email}</strong>) has been inactive for 5 months.
      </p>

      <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
        Due to our data retention policy (GDPR compliance), accounts inactive for 6 months are automatically deleted to protect your privacy and minimize data storage.
      </p>

      <!-- Deletion Date Box -->
      <div style="background-color: #fff5f5; border-left: 4px solid #c53030; padding: 20px; margin: 30px 0; border-radius: 4px;">
        <p style="margin: 0 0 10px 0; color: #742a2a; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          Deletion Scheduled
        </p>
        <p style="margin: 0; color: #c53030; font-size: 22px; font-weight: 700;">
          ${deletionDate}
        </p>
      </div>

      <!-- Action Required -->
      <div style="background-color: #f0fff4; border: 1px solid #9ae6b4; padding: 25px; border-radius: 8px; margin: 30px 0;">
        <h3 style="margin: 0 0 15px 0; color: #22543d; font-size: 18px; font-weight: 600;">
          ✅ Keep Your Account
        </h3>
        <p style="margin: 0 0 15px 0; color: #276749; font-size: 15px; line-height: 1.6;">
          Simply log in to your account to prevent deletion:
        </p>
        <div style="text-align: center; margin-top: 20px;">
          <a href="https://fieldnav.app/" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
            Log In Now
          </a>
        </div>
      </div>

      <!-- Alternative Actions -->
      <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 15px 0; color: #2d3748; font-size: 16px; font-weight: 600;">
          Want to keep your data but stop using the service?
        </h3>
        <ul style="margin: 0; padding-left: 20px; color: #4a5568; font-size: 14px; line-height: 1.8;">
          <li>Log in and export your data: <strong>Settings → Export All Data</strong></li>
          <li>Download in JSON or CSV format</li>
          <li>You have full control over your data</li>
        </ul>
      </div>

      <!-- What Will Be Deleted -->
      <div style="margin: 30px 0; padding: 20px; background-color: #fffaf0; border-left: 4px solid #ed8936; border-radius: 4px;">
        <h4 style="margin: 0 0 10px 0; color: #7c2d12; font-size: 15px; font-weight: 600;">
          What will be deleted:
        </h4>
        <ul style="margin: 0; padding-left: 20px; color: #744210; font-size: 14px; line-height: 1.6;">
          <li>Your account and login credentials</li>
          <li>All addresses, completions, and arrangements</li>
          <li>Route planning data and history</li>
          <li>All synced data across devices</li>
          <li>Backup data (after 30 days)</li>
        </ul>
      </div>

      <!-- Why Are We Doing This -->
      <div style="margin: 30px 0; padding: 20px; background-color: #edf2f7; border-radius: 8px;">
        <h4 style="margin: 0 0 10px 0; color: #2d3748; font-size: 15px; font-weight: 600;">
          Why are we doing this?
        </h4>
        <p style="margin: 0; color: #4a5568; font-size: 14px; line-height: 1.6;">
          Under GDPR (General Data Protection Regulation), we must minimize data storage and only keep data as long as necessary. By deleting inactive accounts, we protect your privacy and comply with data protection laws.
        </p>
      </div>

      <!-- Questions -->
      <p style="color: #718096; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
        Questions or concerns? Reply to this email or contact support.
      </p>

      <p style="color: #2d3748; font-size: 15px; margin: 30px 0 0 0;">
        Thanks,<br>
        <strong>Navigator Web Team</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0 0 10px 0; color: #718096; font-size: 13px;">
        This is an automated message. Please do not reply to this email.
      </p>
      <p style="margin: 0 0 15px 0; color: #a0aec0; font-size: 12px;">
        Navigator Web | Professional Enforcement Tools
      </p>
      <div style="margin-top: 15px;">
        <a href="https://fieldnav.app/PRIVACY.md" style="color: #667eea; text-decoration: none; font-size: 12px; margin: 0 10px;">Privacy Policy</a>
        <a href="https://fieldnav.app/TERMS_OF_USE.md" style="color: #667eea; text-decoration: none; font-size: 12px; margin: 0 10px;">Terms of Use</a>
      </div>
    </div>

  </div>
</body>
</html>
  `.trim();
}
