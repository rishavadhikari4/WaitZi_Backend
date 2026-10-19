// src/services/email/email.service.ts
// ponytail: one platform SMTP transport; Stage 6 adds per-organization SMTP
// configs and a notifications outbox with retries.
import nodemailer, { type Transporter } from 'nodemailer';

import config from '../../config/config.js';
import { passwordResetEmail } from '../../utils/email/templates/auth.templates.js';
import { logger } from '../../utils/logger.js';

class EmailService {
  private transporter: Transporter | undefined;

  private transport(): Transporter {
    if (!this.transporter) {
      if (!config.smtp.host) throw new Error('SMTP_HOST is not set');
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        family: 4, // force IPv4 — avoids ENETUNREACH on hosts without IPv6
        auth: { user: config.smtp.user, pass: config.smtp.password },
      } as nodemailer.TransportOptions);
    }
    return this.transporter;
  }

  async send(to: string, subject: string, html: string) {
    try {
      return await this.transport().sendMail({
        from: config.smtp.from,
        to,
        subject,
        html,
        text: html.replace(/<[^>]*>/g, ''),
      });
    } catch (error) {
      logger.error(`Email send failed: ${(error as Error).message}`, { to, subject });
      throw error;
    }
  }

  sendPasswordReset(email: string, resetUrl: string, userName?: string) {
    const { subject, html } = passwordResetEmail(email, resetUrl, userName);
    return this.send(email, subject, html);
  }
}

export default new EmailService();
