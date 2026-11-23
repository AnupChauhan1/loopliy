import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Transactional email. Uses SMTP when SMTP_HOST is configured;
 * otherwise logs the message so flows remain testable in dev.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter() {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS }
        : undefined,
    });
    return this.transporter;
  }

  async send(to: string, subject: string, text: string, html?: string) {
    const transporter = this.getTransporter();
    const from = process.env.SMTP_FROM || 'LOOPLY <no-reply@looply.app>';
    if (!transporter) {
      this.logger.log(`[mail:dev] To: ${to} | Subject: ${subject}\n${text}`);
      return { delivered: false as const };
    }
    await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true as const };
  }

  appUrl(path: string) {
    const base = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}${path}`;
  }
}
