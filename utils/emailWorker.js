import nodemailer from "nodemailer";
import EmailTemplates from "./emailTemplates.js";

class EmailWorker {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /* -------------------- Init Transport -------------------- */
  async initialize() {
    if (this.initialized) return;

    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await this.transporter.verify();
    this.initialized = true;
    console.log("✅ Email service initialized");
  }

  /* -------------------- Core Sender -------------------- */
  async sendEmail(to, subject, html) {
    try {
      await this.initialize();

      return this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'WaitZi Restaurant <noreply@waitzi.com>',
        to,
        subject,
        html,
        text: html.replace(/<[^>]*>/g, ""),
      });
    } catch (error) {
      console.error("Email send failed:", error, {
        recipient: to,
        subject,
        emailType: "generic",
      });
      throw error;
    }
  }

  /* ---------- Password Reset ---------- */
  async sendPasswordResetEmail(email, resetUrl, userName = "") {
    try {
      const { subject, html } = EmailTemplates.passwordResetEmail(
        email,
        resetUrl,
        userName
      );

      return this.sendEmail(email, subject, html);
    } catch (error) {
      console.error("Password reset email send failed", error, {
        recipient: email,
        emailType: "passwordReset",
      });
      throw error;
    }
  }
}

export default new EmailWorker();