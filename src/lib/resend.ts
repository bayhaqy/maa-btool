/**
 * Resend Email Integration
 *
 * Wraps the Resend SDK with graceful degradation — if `RESEND_API_KEY` is
 * missing, every function logs a warning and returns a structured failure
 * result rather than throwing, so callers (API routes) can continue to
 * function even when email delivery is not configured.
 */

import { Resend } from 'resend';

/** Result returned by all email helper functions. */
export interface EmailResult {
  success: boolean;
  /** Resend message id (only set on success). */
  messageId?: string;
  /** Human-readable error description (only set on failure). */
  error?: string;
}

/** Generic email payload accepted by `sendEmail`. */
export interface EmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Optional reply-to address. */
  replyTo?: string;
}

/**
 * Get a configured Resend client.
 *
 * Returns `null` when `RESEND_API_KEY` is missing or empty.
 */
export function getEmailClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  try {
    return new Resend(apiKey);
  } catch (err) {
    console.warn('[resend] Failed to construct Resend client:', err);
    return null;
  }
}

/**
 * Resolve the "from" address from env (`RESEND_FROM_EMAIL`) with a sane
 * fallback. Never throws.
 */
function getFromEmail(): string {
  return (
    process.env.RESEND_FROM_EMAIL ||
    'MAA BTOOL <onboarding@resend.dev>'
  );
}

const NOT_CONFIGURED_RESULT: EmailResult = {
  success: false,
  error: 'Email service not configured',
};

/**
 * Send a generic email using the configured Resend account.
 *
 * When Resend is not configured, logs a warning and returns
 * `{ success: false, error: 'Email service not configured' }`.
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const client = getEmailClient();
  if (!client) {
    console.warn(
      '[resend] RESEND_API_KEY missing — skipping email to',
      payload.to,
    );
    return NOT_CONFIGURED_RESULT;
  }

  try {
    const { data, error } = await client.emails.send({
      from: getFromEmail(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
    });

    if (error) {
      console.warn('[resend] Send error:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[resend] Send exception:', message);
    return { success: false, error: message };
  }
}

/**
 * Send a welcome email to a newly registered user.
 *
 * @param email - Recipient email address.
 * @param username - The username to greet in the template.
 */
export async function sendWelcomeEmail(
  email: string,
  username: string,
): Promise<EmailResult> {
  const subject = 'Welcome to MAA BTOOL';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h1 style="color: #059669;">Welcome to MAA BTOOL, ${escapeHtml(username)}!</h1>
      <p>Your account has been created successfully.</p>
      <p>MAA BTOOL is the enterprise Master Data Management platform for MAP Group. You can now sign in and start managing master data across all 7 modules.</p>
      <p>If you did not create this account, please contact your administrator.</p>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">MAA BTOOL &middot; MAP Group</p>
    </div>
  `;
  const text = `Welcome to MAA BTOOL, ${username}!\n\nYour account has been created successfully. You can now sign in and start managing master data across all 7 modules.\n\nIf you did not create this account, please contact your administrator.\n\nMAA BTOOL - MAP Group`;
  return sendEmail({ to: email, subject, html, text });
}

/**
 * Send a record-approval notification email.
 *
 * @param email - Recipient email address (typically the requester).
 * @param recordInfo - Object describing the approved/rejected record.
 */
export async function sendApprovalNotification(
  email: string,
  recordInfo: {
    moduleName: string;
    recordTitle: string;
    status: string;
    reviewer?: string;
    comment?: string;
  },
): Promise<EmailResult> {
  const subject = `[MAA BTOOL] ${recordInfo.moduleName} approval update: ${recordInfo.recordTitle}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #059669;">Approval Update</h2>
      <p>Your record has been reviewed:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Module</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(recordInfo.moduleName)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Record</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(recordInfo.recordTitle)}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">New Status</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(recordInfo.status)}</td></tr>
        ${recordInfo.reviewer ? `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Reviewer</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(recordInfo.reviewer)}</td></tr>` : ''}
      </table>
      ${recordInfo.comment ? `<p><strong>Comment:</strong> ${escapeHtml(recordInfo.comment)}</p>` : ''}
      <p>Please sign in to MAA BTOOL for full details.</p>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">MAA BTOOL &middot; MAP Group</p>
    </div>
  `;
  const text = `Approval Update\n\nModule: ${recordInfo.moduleName}\nRecord: ${recordInfo.recordTitle}\nNew Status: ${recordInfo.status}${recordInfo.reviewer ? `\nReviewer: ${recordInfo.reviewer}` : ''}${recordInfo.comment ? `\nComment: ${recordInfo.comment}` : ''}\n\nPlease sign in to MAA BTOOL for full details.`;
  return sendEmail({ to: email, subject, html, text });
}

/**
 * Send a password-reset email containing a one-time reset link.
 *
 * @param email - Recipient email address.
 * @param resetLink - The full URL the user should visit to reset their password.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
): Promise<EmailResult> {
  const subject = '[MAA BTOOL] Password reset request';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #059669;">Password Reset</h2>
      <p>We received a request to reset your MAA BTOOL password.</p>
      <p>
        <a href="${escapeHtml(resetLink)}" style="display: inline-block; padding: 12px 24px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 4px;">Reset Password</a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">Or copy this link into your browser: <br />${escapeHtml(resetLink)}</p>
      <p style="font-size: 13px; color: #6b7280;">This link will expire in 30 minutes. If you did not request a password reset, you can safely ignore this email.</p>
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">MAA BTOOL &middot; MAP Group</p>
    </div>
  `;
  const text = `Password Reset\n\nWe received a request to reset your MAA BTOOL password.\n\nReset link: ${resetLink}\n\nThis link will expire in 30 minutes. If you did not request a password reset, you can safely ignore this email.`;
  return sendEmail({ to: email, subject, html, text });
}

/** Escape HTML special characters to prevent injection in email templates. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
