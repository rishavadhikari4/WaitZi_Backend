// src/utils/email/templates/auth.templates.ts
const BRAND = '#EA580C';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function passwordResetEmail(email: string, resetUrl: string, userName?: string) {
  const name = escapeHtml(userName || 'there');
  const url = escapeHtml(resetUrl);
  return {
    subject: 'Reset your WaitZi password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1c1917;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: ${BRAND}; margin: 0;">WaitZi</h1>
          <p style="color: #78716c; margin: 5px 0;">Restaurant Management System</p>
        </div>
        <h2 style="border-bottom: 2px solid ${BRAND}; padding-bottom: 10px;">Password reset request</h2>
        <p style="font-size: 16px; line-height: 1.5;">Hello ${name},</p>
        <p style="font-size: 16px; line-height: 1.5;">We received a request to reset the password for your WaitZi account (${escapeHtml(email)}).</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${url}" style="display: inline-block; padding: 15px 30px; background-color: ${BRAND}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">Reset password</a>
        </div>
        <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #9a3412; font-size: 14px;"><strong>Security notice:</strong> this link expires in 15 minutes.</p>
        </div>
        <p style="font-size: 16px; line-height: 1.5;">If you didn't request this, ignore this email; your password stays unchanged.</p>
        <p style="font-size: 16px; line-height: 1.5;">Or paste this link into your browser:</p>
        <p style="background-color: #f5f5f4; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px; color: #57534e;">${url}</p>
        <hr style="border: none; border-top: 1px solid #e7e5e4; margin: 30px 0;">
        <p style="text-align: center; color: #a8a29e; font-size: 11px;">This is an automated email. Please do not reply.</p>
      </div>`,
  };
}
