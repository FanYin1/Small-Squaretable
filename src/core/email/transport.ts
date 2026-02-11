import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config';

let transporter: Transporter | null = null;

export function getEmailTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? {
        user: config.smtpUser,
        pass: config.smtpPass,
      } : undefined,
    });
  }
  return transporter;
}

/** Reset the cached transporter (useful for testing). */
export function resetEmailTransport(): void {
  transporter = null;
}
