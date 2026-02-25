/**
 * NotificationEmailService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  return { sendMailMock };
});

vi.mock('@core/email/transport', () => ({
  getEmailTransport: vi.fn().mockReturnValue({ sendMail: mocks.sendMailMock }),
}));

vi.mock('@core/config', () => ({
  config: {
    smtpFrom: 'Test <noreply@test.com>',
    nodeEnv: 'test',
  },
}));

vi.mock('./logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { NotificationEmailService } from './notification-email.service';

describe('NotificationEmailService', () => {
  let service: NotificationEmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationEmailService();
  });

  describe('sendImmediateNotification', () => {
    it('should call transport.sendMail with correct params', async () => {
      await service.sendImmediateNotification({
        recipientEmail: 'alice@example.com',
        recipientName: 'Alice',
        type: 'follow',
        message: 'Bob started following you',
      });

      expect(mocks.sendMailMock).toHaveBeenCalledTimes(1);
      expect(mocks.sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test <noreply@test.com>',
          to: 'alice@example.com',
          subject: 'New notification: Bob started following you',
          html: expect.stringContaining('Alice'),
        }),
      );
      expect(mocks.sendMailMock.mock.calls[0][0].html).toContain('Bob started following you');
    });

    it('should not throw when sendMail fails', async () => {
      mocks.sendMailMock.mockRejectedValueOnce(new Error('SMTP down'));

      await expect(
        service.sendImmediateNotification({
          recipientEmail: 'alice@example.com',
          recipientName: 'Alice',
          type: 'follow',
          message: 'Bob started following you',
        }),
      ).resolves.toBeUndefined();
    });

    it('should include targetUrl link when provided', async () => {
      await service.sendImmediateNotification({
        recipientEmail: 'alice@example.com',
        recipientName: 'Alice',
        type: 'comment',
        message: 'New comment on your character',
        targetUrl: 'https://app.test.com/characters/123',
      });

      const html = mocks.sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('https://app.test.com/characters/123');
      expect(html).toContain('View details');
    });

    it('should truncate long messages in subject to 50 chars', async () => {
      const longMessage = 'A'.repeat(100);
      await service.sendImmediateNotification({
        recipientEmail: 'alice@example.com',
        recipientName: 'Alice',
        type: 'system',
        message: longMessage,
      });

      const subject = mocks.sendMailMock.mock.calls[0][0].subject;
      expect(subject).toBe(`New notification: ${'A'.repeat(50)}`);
    });
  });

  describe('sendDigestEmail', () => {
    it('should build HTML with notification count in subject', async () => {
      const notifications = [
        { type: 'follow', message: 'Bob followed you', createdAt: '2026-02-20T10:00:00Z' },
        { type: 'comment', message: 'Alice commented', createdAt: '2026-02-20T11:00:00Z' },
        { type: 'favorite', message: 'Charlie favorited', createdAt: '2026-02-20T12:00:00Z' },
      ];

      await service.sendDigestEmail('user@example.com', 'Dana', notifications);

      expect(mocks.sendMailMock).toHaveBeenCalledTimes(1);
      expect(mocks.sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Test <noreply@test.com>',
          to: 'user@example.com',
          subject: 'You have 3 new notifications',
          html: expect.stringContaining('Dana'),
        }),
      );

      const html = mocks.sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('Bob followed you');
      expect(html).toContain('Alice commented');
      expect(html).toContain('Charlie favorited');
    });

    it('should not throw when sendMail fails', async () => {
      mocks.sendMailMock.mockRejectedValueOnce(new Error('SMTP down'));

      await expect(
        service.sendDigestEmail('user@example.com', 'Dana', [
          { type: 'follow', message: 'Test', createdAt: '2026-02-20T10:00:00Z' },
        ]),
      ).resolves.toBeUndefined();
    });
  });
});
