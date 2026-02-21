class EmailTemplates {
  static passwordResetEmail(email, resetUrl, userName) {
    const subject = "Reset Your WaitZi Password";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4f46e5; margin: 0;">WaitZi</h1>
          <p style="color: #666; margin: 5px 0;">Restaurant Management System</p>
        </div>
        
        <h2 style="color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">Password Reset Request</h2>
        
        <p style="font-size: 16px; color: #333; line-height: 1.5;">Hello ${userName || 'there'},</p>
        
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          We received a request to reset your password for your WaitZi account (${email}).
        </p>
        
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          Click the button below to reset your password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="display: inline-block; 
                    padding: 15px 30px; 
                    background-color: #4f46e5; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-size: 16px; 
                    font-weight: bold;
                    box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
            Reset Password
          </a>
        </div>
        
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>Security Notice:</strong> This link will expire in 15 minutes for security reasons.
          </p>
        </div>
        
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
        </p>
        
        <p style="font-size: 16px; color: #333; line-height: 1.5;">
          Or copy and paste this link into your browser:
        </p>
        
        <p style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px; color: #666;">
          ${resetUrl}
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <div style="text-align: center;">
          <p style="color: #666; font-size: 12px; margin: 5px 0;">
            WaitZi Restaurant Management System
          </p>
          <p style="color: #999; font-size: 11px; margin: 5px 0;">
            This is an automated email. Please do not reply to this email.
          </p>
        </div>
      </div>
    `;
    return { subject, html };
  }
}

export default EmailTemplates;