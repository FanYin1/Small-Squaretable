/**
 * Notification Digest Job unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── hoisted mocks ── */
const mocks = vi.hoisted(() => {
  const mockPrefsWhere = vi.fn();
  const mockPrefsFrom = vi.fn().mockReturnValue({ where: mockPrefsWhere });
  const mockPrefsSelect = vi.fn().mockReturnValue({ from: mockPrefsFrom });

  const mockNotifsOrderBy = vi.fn();
  const mockNotifsWhere = vi.fn().mockReturnValue({ orderBy: mockNotifsOrderBy });
  const mockNotifsFrom = vi.fn().mockReturnValue({ where: mockNotifsWhere });
  const mockNotifsSelect = vi.fn().mockReturnValue({ from: mockNotifsFrom });

  const mockUserLimit = vi.fn();
  const mockUserWhere = vi.fn().mockReturnValue({ limit: mockUserLimit });
  const mockUserFrom = vi.fn().mockReturnValue({ where: mockUserWhere });
  const mockUserSelect = vi.fn().mockReturnValue({ from: mockUserFrom });

  const sendDigestEmail = vi.fn().mockResolvedValue(undefined);

  return {
    mockPrefsSelect, mockPrefsFrom, mockPrefsWhere,
    mockNotifsSelect, mockNotifsFrom, mockNotifsWhere, mockNotifsOrderBy,
    mockUserSelect, mockUserFrom, mockUserWhere, mockUserLimit,
    sendDigestEmail,
  };
});

/* ── db mock ── */
let selectCallCount = 0;
vi.mock('@db/index', () => ({
  db: {
    select: vi.fn((...args: unknown[]) => {
      const call = selectCallCount++;
      // 1st select → notification preferences
      if (call === 0) return mocks.mockPrefsSelect(...args);
      // 2nd select → notifications for user
      if (call % 2 === 1) return mocks.mockNotifsSelect(...args);
      // 3rd select → user lookup
      return mocks.mockUserSelect(...args);
    }),
  },
}));

vi.mock('@db/schema/social', () => ({
  notifications: {
    userId: 'userId',
    type: 'type',
    message: 'message',
    createdAt: 'createdAt',
  },
}));

vi.mock('@db/schema/notification-preferences', () => ({
  notificationPreferences: {
    userId: 'userId',
    notificationType: 'notificationType',
    email: 'email',
    emailFrequency: 'emailFrequency',
  },
}));

vi.mock('@db/schema/users', () => ({
  users: {
    id: 'id',
    email: 'email',
    displayName: 'displayName',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  gte: vi.fn((...args: unknown[]) => ({ op: 'gte', args })),
}));

vi.mock('../services/notification-email.service', () => ({
  notificationEmailService: {
    sendDigestEmail: mocks.sendDigestEmail,
  },
}));

vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { runNotificationDigest } from './notification-digest.job';

describe('runNotificationDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
  });

  it('should send digest emails to users with matching preferences', async () => {
    // Preferences: user-1 wants daily digest for 'follow' and 'comment'
    mocks.mockPrefsWhere.mockResolvedValueOnce([
      { userId: 'user-1', notificationType: 'follow' },
      { userId: 'user-1', notificationType: 'comment' },
    ]);

    // Notifications for user-1
    const now = new Date('2026-02-25T12:00:00Z');
    mocks.mockNotifsOrderBy.mockResolvedValueOnce([
      { type: 'follow', message: 'Bob followed you', createdAt: now },
      { type: 'comment', message: 'Alice commented', createdAt: now },
      { type: 'favorite', message: 'Charlie favorited', createdAt: now },
    ]);

    // User lookup
    mocks.mockUserLimit.mockResolvedValueOnce([
      { email: 'user1@example.com', displayName: 'User One' },
    ]);

    await runNotificationDigest('daily');

    expect(mocks.sendDigestEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendDigestEmail).toHaveBeenCalledWith(
      'user1@example.com',
      'User One',
      [
        { type: 'follow', message: 'Bob followed you', createdAt: now.toISOString() },
        { type: 'comment', message: 'Alice commented', createdAt: now.toISOString() },
      ],
    );
  });

  it('should skip users with no matching notifications', async () => {
    mocks.mockPrefsWhere.mockResolvedValueOnce([
      { userId: 'user-2', notificationType: 'follow' },
    ]);

    // No notifications in the period
    mocks.mockNotifsOrderBy.mockResolvedValueOnce([]);

    await runNotificationDigest('weekly');

    expect(mocks.sendDigestEmail).not.toHaveBeenCalled();
  });

  it('should skip users without an email address', async () => {
    mocks.mockPrefsWhere.mockResolvedValueOnce([
      { userId: 'user-3', notificationType: 'follow' },
    ]);

    const now = new Date('2026-02-25T12:00:00Z');
    mocks.mockNotifsOrderBy.mockResolvedValueOnce([
      { type: 'follow', message: 'Someone followed you', createdAt: now },
    ]);

    // User has no email
    mocks.mockUserLimit.mockResolvedValueOnce([]);

    await runNotificationDigest('daily');

    expect(mocks.sendDigestEmail).not.toHaveBeenCalled();
  });

  it('should use "User" as fallback when displayName is null', async () => {
    mocks.mockPrefsWhere.mockResolvedValueOnce([
      { userId: 'user-4', notificationType: 'comment' },
    ]);

    const now = new Date('2026-02-25T12:00:00Z');
    mocks.mockNotifsOrderBy.mockResolvedValueOnce([
      { type: 'comment', message: 'New comment', createdAt: now },
    ]);

    mocks.mockUserLimit.mockResolvedValueOnce([
      { email: 'user4@example.com', displayName: null },
    ]);

    await runNotificationDigest('daily');

    expect(mocks.sendDigestEmail).toHaveBeenCalledWith(
      'user4@example.com',
      'User',
      [{ type: 'comment', message: 'New comment', createdAt: now.toISOString() }],
    );
  });
});
