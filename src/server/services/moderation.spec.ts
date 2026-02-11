/**
 * ModerationService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModerationService } from './moderation.service';
import { NotFoundError, BadRequestError } from '../../core/errors';

function createMockReportRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findPending: vi.fn(),
    resolve: vi.fn(),
  };
}

function createMockModerationRepo() {
  return {
    create: vi.fn(),
    findByTarget: vi.fn(),
  };
}

type MockReportRepo = ReturnType<typeof createMockReportRepo>;
type MockModerationRepo = ReturnType<typeof createMockModerationRepo>;

describe('ModerationService', () => {
  let reportRepo: MockReportRepo;
  let moderationRepo: MockModerationRepo;
  let service: ModerationService;

  beforeEach(() => {
    reportRepo = createMockReportRepo();
    moderationRepo = createMockModerationRepo();
    service = new ModerationService(reportRepo as any, moderationRepo as any);
  });

  // --- submitReport ---
  describe('submitReport', () => {
    it('should create a report with valid data', async () => {
      const fakeReport = {
        id: 'r-1',
        reporterId: 'user-1',
        targetType: 'character',
        targetId: 'char-1',
        reason: 'Inappropriate content',
        status: 'pending',
      };
      reportRepo.create.mockResolvedValue(fakeReport);

      const result = await service.submitReport('user-1', 'character', 'char-1', 'Inappropriate content');

      expect(reportRepo.create).toHaveBeenCalledWith({
        reporterId: 'user-1',
        targetType: 'character',
        targetId: 'char-1',
        reason: 'Inappropriate content',
      });
      expect(result).toEqual(fakeReport);
    });

    it('should trim the reason', async () => {
      reportRepo.create.mockResolvedValue({ id: 'r-1' });

      await service.submitReport('user-1', 'user', 'user-2', '  spam  ');

      expect(reportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'spam' }),
      );
    });

    it('should throw BadRequestError for invalid target type', async () => {
      await expect(
        service.submitReport('user-1', 'invalid', 'id-1', 'reason'),
      ).rejects.toThrow(BadRequestError);
      expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError for empty reason', async () => {
      await expect(
        service.submitReport('user-1', 'character', 'char-1', '   '),
      ).rejects.toThrow(BadRequestError);
      expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('should accept comment as target type', async () => {
      reportRepo.create.mockResolvedValue({ id: 'r-2' });

      await service.submitReport('user-1', 'comment', 'comment-1', 'Offensive');

      expect(reportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'comment' }),
      );
    });
  });

  // --- resolveReport ---
  describe('resolveReport', () => {
    const pendingReport = {
      id: 'r-1',
      reporterId: 'user-1',
      targetType: 'character',
      targetId: 'char-1',
      reason: 'Bad content',
      status: 'pending',
    };

    it('should resolve a pending report', async () => {
      reportRepo.findById.mockResolvedValue(pendingReport);
      reportRepo.resolve.mockResolvedValue(undefined);

      await service.resolveReport('r-1', 'mod-1', 'resolved');

      expect(reportRepo.findById).toHaveBeenCalledWith('r-1');
      expect(reportRepo.resolve).toHaveBeenCalledWith('r-1', 'mod-1', 'resolved');
    });

    it('should dismiss a pending report', async () => {
      reportRepo.findById.mockResolvedValue(pendingReport);
      reportRepo.resolve.mockResolvedValue(undefined);

      await service.resolveReport('r-1', 'mod-1', 'dismissed');

      expect(reportRepo.resolve).toHaveBeenCalledWith('r-1', 'mod-1', 'dismissed');
    });

    it('should log a moderation action when action is provided', async () => {
      reportRepo.findById.mockResolvedValue(pendingReport);
      reportRepo.resolve.mockResolvedValue(undefined);
      moderationRepo.create.mockResolvedValue({ id: 'ma-1' });

      await service.resolveReport('r-1', 'mod-1', 'resolved', 'hide');

      expect(moderationRepo.create).toHaveBeenCalledWith({
        moderatorId: 'mod-1',
        targetType: 'character',
        targetId: 'char-1',
        action: 'hide',
        reason: 'Resolved report r-1',
      });
    });

    it('should throw NotFoundError when report does not exist', async () => {
      reportRepo.findById.mockResolvedValue(null);

      await expect(
        service.resolveReport('r-999', 'mod-1', 'resolved'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError when report is already resolved', async () => {
      reportRepo.findById.mockResolvedValue({ ...pendingReport, status: 'resolved' });

      await expect(
        service.resolveReport('r-1', 'mod-1', 'resolved'),
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError for invalid action', async () => {
      reportRepo.findById.mockResolvedValue(pendingReport);
      reportRepo.resolve.mockResolvedValue(undefined);

      await expect(
        service.resolveReport('r-1', 'mod-1', 'resolved', 'invalid_action'),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // --- takeAction ---
  describe('takeAction', () => {
    it('should create a moderation action', async () => {
      moderationRepo.create.mockResolvedValue({ id: 'ma-1' });

      await service.takeAction('mod-1', 'user', 'user-2', 'suspend', 'Repeated violations');

      expect(moderationRepo.create).toHaveBeenCalledWith({
        moderatorId: 'mod-1',
        targetType: 'user',
        targetId: 'user-2',
        action: 'suspend',
        reason: 'Repeated violations',
      });
    });

    it('should allow null reason', async () => {
      moderationRepo.create.mockResolvedValue({ id: 'ma-2' });

      await service.takeAction('mod-1', 'character', 'char-1', 'hide');

      expect(moderationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: null }),
      );
    });

    it('should throw BadRequestError for invalid target type', async () => {
      await expect(
        service.takeAction('mod-1', 'invalid', 'id-1', 'hide'),
      ).rejects.toThrow(BadRequestError);
      expect(moderationRepo.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError for invalid action', async () => {
      await expect(
        service.takeAction('mod-1', 'user', 'user-2', 'destroy'),
      ).rejects.toThrow(BadRequestError);
      expect(moderationRepo.create).not.toHaveBeenCalled();
    });

    it('should accept all valid actions', async () => {
      moderationRepo.create.mockResolvedValue({ id: 'ma-x' });

      for (const action of ['approve', 'reject', 'hide', 'suspend', 'unsuspend']) {
        await service.takeAction('mod-1', 'character', 'char-1', action);
      }

      expect(moderationRepo.create).toHaveBeenCalledTimes(5);
    });
  });

  // --- getPendingReports ---
  describe('getPendingReports', () => {
    it('should delegate to reportRepo.findPending with defaults', async () => {
      const fakePaginated = {
        items: [{ id: 'r-1' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      };
      reportRepo.findPending.mockResolvedValue(fakePaginated);

      const result = await service.getPendingReports();

      expect(reportRepo.findPending).toHaveBeenCalledWith(1, 20);
      expect(result).toEqual(fakePaginated);
    });

    it('should pass custom page and limit', async () => {
      reportRepo.findPending.mockResolvedValue({ items: [], pagination: {} });

      await service.getPendingReports(3, 10);

      expect(reportRepo.findPending).toHaveBeenCalledWith(3, 10);
    });
  });
});
