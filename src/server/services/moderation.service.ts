/**
 * Moderation Service
 *
 * Handles report submission, resolution, and moderation actions.
 */

import type { ReportRepository } from '../../db/repositories/report.repository';
import type { ModerationRepository } from '../../db/repositories/moderation.repository';
import type { Report } from '../../db/schema/reports';
import type { PaginatedResponse } from '../../types/api';
import { NotFoundError, BadRequestError } from '../../core/errors';

const VALID_TARGET_TYPES = ['character', 'comment', 'user'];
const VALID_ACTIONS = ['approve', 'reject', 'hide', 'suspend', 'unsuspend'];

export class ModerationService {
  constructor(
    private reportRepo: ReportRepository,
    private moderationRepo: ModerationRepository,
  ) {}

  /**
   * Submit a report (user-facing)
   */
  async submitReport(
    reporterId: string,
    targetType: string,
    targetId: string,
    reason: string,
  ): Promise<Report> {
    if (!VALID_TARGET_TYPES.includes(targetType)) {
      throw new BadRequestError(`Invalid target type: ${targetType}`);
    }
    if (!reason.trim()) {
      throw new BadRequestError('Reason is required');
    }

    return this.reportRepo.create({
      reporterId,
      targetType,
      targetId,
      reason: reason.trim(),
    });
  }

  /**
   * Resolve a report (moderator/admin)
   */
  async resolveReport(
    reportId: string,
    moderatorId: string,
    status: 'resolved' | 'dismissed',
    action?: string,
  ): Promise<void> {
    const report = await this.reportRepo.findById(reportId);
    if (!report) {
      throw new NotFoundError('Report');
    }
    if (report.status !== 'pending') {
      throw new BadRequestError('Report is already resolved');
    }

    await this.reportRepo.resolve(reportId, moderatorId, status);

    // If an action is specified alongside resolution, log it
    if (action) {
      if (!VALID_ACTIONS.includes(action)) {
        throw new BadRequestError(`Invalid action: ${action}`);
      }
      await this.moderationRepo.create({
        moderatorId,
        targetType: report.targetType,
        targetId: report.targetId,
        action,
        reason: `Resolved report ${reportId}`,
      });
    }
  }

  /**
   * Take a standalone moderation action (hide content, suspend user, etc.)
   */
  async takeAction(
    moderatorId: string,
    targetType: string,
    targetId: string,
    action: string,
    reason?: string,
  ): Promise<void> {
    if (!VALID_TARGET_TYPES.includes(targetType)) {
      throw new BadRequestError(`Invalid target type: ${targetType}`);
    }
    if (!VALID_ACTIONS.includes(action)) {
      throw new BadRequestError(`Invalid action: ${action}`);
    }

    await this.moderationRepo.create({
      moderatorId,
      targetType,
      targetId,
      action,
      reason: reason ?? null,
    });
  }

  /**
   * Get pending reports (moderator/admin)
   */
  async getPendingReports(page: number = 1, limit: number = 20): Promise<PaginatedResponse<Report>> {
    return this.reportRepo.findPending(page, limit);
  }
}

// Singleton — lazy-initialized to avoid circular imports
let _instance: ModerationService | null = null;

export function getModerationService(): ModerationService {
  if (!_instance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { reportRepository } = require('../../db/repositories/report.repository');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { moderationRepository } = require('../../db/repositories/moderation.repository');
    _instance = new ModerationService(reportRepository, moderationRepository);
  }
  return _instance;
}

export const moderationService = {
  get instance() {
    return getModerationService();
  },
  submitReport: (...args: Parameters<ModerationService['submitReport']>) =>
    getModerationService().submitReport(...args),
  resolveReport: (...args: Parameters<ModerationService['resolveReport']>) =>
    getModerationService().resolveReport(...args),
  takeAction: (...args: Parameters<ModerationService['takeAction']>) =>
    getModerationService().takeAction(...args),
  getPendingReports: (...args: Parameters<ModerationService['getPendingReports']>) =>
    getModerationService().getPendingReports(...args),
};
