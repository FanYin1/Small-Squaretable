/**
 * Notification Cleanup Job unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── hoisted mocks ── */
const mocks = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
  return { mockDelete, mockDeleteWhere };
});

vi.mock('@db/index', () => ({
  db: {
    delete: mocks.mockDelete,
  },
}));

vi.mock('@db/schema/social', () => ({
  notifications: {
    isRead: 'isRead',
    createdAt: 'createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  lt: vi.fn((...args: unknown[]) => ({ op: 'lt', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
}));

vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { runNotificationCleanup } from './notification-cleanup.job';

describe('runNotificationCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call db.delete twice (read 30d + all 90d)', async () => {
    await runNotificationCleanup();

    // Two delete calls: one for read >30d, one for all >90d
    expect(mocks.mockDelete).toHaveBeenCalledTimes(2);
    expect(mocks.mockDeleteWhere).toHaveBeenCalledTimes(2);
  });
});
