import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Transactional email. Uses SMTP when SMTP_HOST is configured —
 * works with Zoho Mail (smtp.zoho.com / smtp.zoho.in), Gmail
 * (smtp.gmail.com + App Password), or any SMTP relay.
 * Port 465 => implicit TLS (secure: true); 587/25 => STARTTLS.
 * When SMTP is not configured, messages are logged so flows remain
 * testable in dev (dev tokens are also returned by the API).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter() {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    const port = Number(process.env.SMTP_PORT || 587);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
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
    try {
      await transporter.sendMail({
        from,
        to,
        replyTo: process.env.SMTP_USER || undefined,
        subject,
        text,
        html: html ?? text,
      });
      return { delivered: true as const };
    } catch (err: any) {
      this.logger.error(
        `SMTP send failed to=${to} host=${process.env.SMTP_HOST}:${process.env.SMTP_PORT} — ${err?.message || err}`,
      );
      return { delivered: false as const, error: String(err?.message || err) };
    }
  }

  /** Branded 6-digit OTP email (HTML + plain text). */
  async sendOtp(to: string, code: string) {
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#007F5F,#00A878);padding:24px 28px">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:1px">LOOPLY</span>
        </div>
        <div style="padding:28px">
          <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Verify your email</h2>
          <p style="margin:0 0 20px;font-size:14px;color:#6b7280">Enter this code in the LOOPLY signup form to verify your email address. It expires in 10 minutes.</p>
          <div style="text-align:center;margin:24px 0">
            <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:8px;color:#007F5F;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px 24px">${code}</span>
          </div>
          <p style="margin:0;font-size:12px;color:#9ca3af">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      </div>`;
    const text = `Your LOOPLY verification code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`;
    return this.send(to, 'Your LOOPLY verification code', text, html);
  }

  appUrl(path: string) {
    const base = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}${path}`;
  }
}
