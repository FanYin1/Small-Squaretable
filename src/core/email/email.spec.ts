import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderTemplate } from './templates';

// Mock nodemailer before importing sendEmail
vi.mock('nodemailer', () => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  return {
    default: {
      createTransport: vi.fn().mockReturnValue({ sendMail: sendMailMock }),
    },
  };
});

// Mock config so we don't need real env vars
vi.mock('../config', () => ({
  config: {
    smtpHost: 'smtp.test.com',
    smtpPort: 587,
    smtpUser: 'user',
    smtpPass: 'pass',
    smtpFrom: 'Test <noreply@test.com>',
    appUrl: 'https://app.test.com',
  },
}));

describe('Email Templates', () => {
  describe('email-verification', () => {
    it('should return correct subject', () => {
      const result = renderTemplate('email-verification', {
        link: 'https://app.test.com/verify?token=abc',
        name: 'Alice',
      });
      expect(result.subject).toBe('Verify your email');
    });

    it('should include the verification link in HTML', () => {
      const link = 'https://app.test.com/verify?token=abc123';
      const result = renderTemplate('email-verification', {
        link,
        name: 'Alice',
      });
      expect(result.html).toContain(link);
      expect(result.html).toContain('Alice');
    });
  });

  describe('password-reset', () => {
    it('should return correct subject', () => {
      const result = renderTemplate('password-reset', {
        link: 'https://app.test.com/reset?token=xyz',
        name: 'Bob',
      });
      expect(result.subject).toBe('Reset your password');
    });

    it('should include the reset link and name in HTML', () => {
      const link = 'https://app.test.com/reset?token=xyz789';
      const result = renderTemplate('password-reset', {
        link,
        name: 'Bob',
      });
      expect(result.html).toContain(link);
      expect(result.html).toContain('Bob');
    });
  });

  describe('welcome', () => {
    it('should return correct subject', () => {
      const result = renderTemplate('welcome', { name: 'Charlie' });
      expect(result.subject).toBe('Welcome to Small Squaretable');
    });

    it('should include the name in HTML', () => {
      const result = renderTemplate('welcome', { name: 'Charlie' });
      expect(result.html).toContain('Charlie');
    });
  });

  describe('unknown template', () => {
    it('should throw for unknown template name', () => {
      expect(() => renderTemplate('nonexistent', {})).toThrow(
        'Unknown email template: nonexistent',
      );
    });
  });
});

describe('sendEmail', () => {
  let nodemailer: typeof import('nodemailer');

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset transport singleton so each test gets a fresh one
    const { resetEmailTransport } = await import('./transport');
    resetEmailTransport();
    nodemailer = await import('nodemailer');
  });

  it('should call transport.sendMail with correct arguments', async () => {
    const { sendEmail } = await import('./index');

    await sendEmail('user@example.com', 'welcome', { name: 'Dana' });

    const transport = nodemailer.default.createTransport();
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Test <noreply@test.com>',
        to: 'user@example.com',
        subject: 'Welcome to Small Squaretable',
        html: expect.stringContaining('Dana'),
      }),
    );
  });

  it('should call transport.sendMail for email-verification template', async () => {
    const { sendEmail } = await import('./index');

    await sendEmail('alice@example.com', 'email-verification', {
      link: 'https://app.test.com/verify?token=t1',
      name: 'Alice',
    });

    const transport = nodemailer.default.createTransport();
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        subject: 'Verify your email',
        html: expect.stringContaining('https://app.test.com/verify?token=t1'),
      }),
    );
  });
});
