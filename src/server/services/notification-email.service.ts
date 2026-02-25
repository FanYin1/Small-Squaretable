/**
 * Notification Email Service
 *
 * Sends immediate notification emails and digest emails
 * using the core email transport (Nodemailer).
 */

import { getEmailTransport } from '@core/email/transport';
import { config } from '@core/config';
import { logger } from './logger.service';

const emailLogger = logger.child({ module: 'notification-email' });

export interface NotificationEmailData {
  recipientEmail: string;
  recipientName: string;
  type: string;
  message: string;
  actorName?: string;
  targetUrl?: string;
}

export class NotificationEmailService {
  async sendImmediateNotification(data: NotificationEmailData): Promise<void> {
    try {
      const transport = getEmailTransport();
      await transport.sendMail({
        from: config.smtpFrom,
        to: data.recipientEmail,
        subject: `New notification: ${data.message.substring(0, 50)}`,
        html: this.buildNotificationHtml(data),
      });
      emailLogger.info('Sent immediate notification email', {
        to: data.recipientEmail,
        type: data.type,
      });
    } catch (error) {
      emailLogger.error('Failed to send notification email', error, {
        to: data.recipientEmail,
      });
    }
  }

  async sendDigestEmail(
    recipientEmail: string,
    recipientName: string,
    notifications: Array<{ type: string; message: string; createdAt: string }>,
  ): Promise<void> {
    try {
      const transport = getEmailTransport();
      await transport.sendMail({
        from: config.smtpFrom,
        to: recipientEmail,
        subject: `You have ${notifications.length} new notifications`,
        html: this.buildDigestHtml(recipientName, notifications),
      });
      emailLogger.info('Sent digest email', {
        to: recipientEmail,
        count: notifications.length,
      });
    } catch (error) {
      emailLogger.error('Failed to send digest email', error, {
        to: recipientEmail,
      });
    }
  }

  private buildNotificationHtml(data: NotificationEmailData): string {
    return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #409eff;">Small Squaretable</h2>
      <p>Hi ${data.recipientName},</p>
      <div style="padding: 16px; background: #f5f7fa; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; font-size: 15px;">${data.message}</p>
      </div>
      ${data.targetUrl ? `<a href="${data.targetUrl}" style="color: #409eff;">View details</a>` : ''}
      <hr style="border: none; border-top: 1px solid #ebeef5; margin: 24px 0;" />
      <p style="color: #909399; font-size: 12px;">You can manage your notification preferences in Settings.</p>
    </div>`;
  }

  private buildDigestHtml(
    name: string,
    notifications: Array<{ type: string; message: string; createdAt: string }>,
  ): string {
    const items = notifications
      .map(
        (n) =>
          `<li style="padding: 8px 0; border-bottom: 1px solid #ebeef5;">${n.message} <span style="color: #909399; font-size: 12px;">${new Date(n.createdAt).toLocaleDateString()}</span></li>`,
      )
      .join('');
    return `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #409eff;">Small Squaretable</h2>
      <p>Hi ${name}, here's your notification digest:</p>
      <ul style="list-style: none; padding: 0;">${items}</ul>
      <hr style="border: none; border-top: 1px solid #ebeef5; margin: 24px 0;" />
      <p style="color: #909399; font-size: 12px;">You can manage your notification preferences in Settings.</p>
    </div>`;
  }
}

export const notificationEmailService = new NotificationEmailService();
