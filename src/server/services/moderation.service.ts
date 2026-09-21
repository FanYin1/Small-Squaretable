/**
 * Moderation Service
 *
 * Handles report submission, resolution, and moderation actions.
 */

import type { ReportRepository } from '../../db/repositories/report.repository';
import type { ModerationRepository } from '../../db/repositories/moderation.repository';
import type { CharacterRepository } from '../../db/repositories/character.repository';
import type { UserRepository } from '../../db/repositories/user.repository';
import type { Report } from '../../db/schema/reports';
import type { ModerationStatus, ViolationCategory } from '../../db/schema/moderation-enums';
import type { PaginatedResponse } from '../../types/api';
import { NotFoundError, BadRequestError } from '../../core/errors';

const VALID_TARGET_TYPES = ['character', 'comment', 'user'];
const VALID_ACTIONS = ['approve', 'reject', 'hide', 'suspend', 'unsuspend'];

/**
 * 处置动作 → 角色审核状态。
 *
 * 只有出现在这张表里的动作才会改角色状态；suspend/unsuspend 针对用户，
 * 不在此列。
 */
const CHARACTER_STATUS_BY_ACTION: Record<string, ModerationStatus> = {
  approve: 'approved',
  reject: 'rejected',
  hide: 'hidden',
};

export class ModerationService {
  constructor(
    private reportRepo: ReportRepository,
    private moderationRepo: ModerationRepository,
    private characterRepo: CharacterRepository,
    private userRepo: UserRepository,
  ) {}

  /**
   * 把处置动作落到业务状态上。
   *
   * 此前审核只写 moderation_actions 日志，而那张表没有任何生产读取方，
   * 所以「隐藏」「封禁」这些动作对系统行为毫无影响。
   */
  private async applyAction(
    moderatorId: string,
    targetType: string,
    targetId: string,
    action: string,
    reason?: string | null,
    category?: ViolationCategory | null,
  ): Promise<void> {
    if (targetType === 'character') {
      const status = CHARACTER_STATUS_BY_ACTION[action];
      if (!status) return;

      await this.characterRepo.updateModerationStatus(targetId, {
        moderationStatus: status,
        // 通过时清掉上一次驳回留下的分类，否则角色带着旧违规标记上架
        violationCategory: status === 'approved' ? null : (category ?? null),
        moderationNote: status === 'approved' ? null : (reason ?? null),
        moderatedBy: moderatorId,
      });
      return;
    }

    if (targetType === 'user') {
      if (action === 'suspend') {
        // authMiddleware 和 auth.service 都已校验 isActive，置为 false 即刻生效
        await this.userRepo.update(targetId, { isActive: false });
      } else if (action === 'unsuspend') {
        await this.userRepo.update(targetId, { isActive: true });
      }
    }

    // comment 目前没有独立的可见性字段，只留审计日志
  }

  /**
   * Submit a report (user-facing)
   */
  async submitReport(
    reporterId: string,
    targetType: string,
    targetId: string,
    reason: string,
    category: ViolationCategory = 'other',
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
      category,
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

    // 动作合法性先于状态写入校验，避免报告已被标记 resolved 却没有处置
    if (action && !VALID_ACTIONS.includes(action)) {
      throw new BadRequestError(`Invalid action: ${action}`);
    }

    await this.reportRepo.resolve(reportId, moderatorId, status);

    if (action) {
      await this.moderationRepo.create({
        moderatorId,
        targetType: report.targetType,
        targetId: report.targetId,
        action,
        reason: `Resolved report ${reportId}`,
      });

      // dismissed 表示举报不成立，内容没问题，不动内容状态
      if (status === 'resolved') {
        await this.applyAction(
          moderatorId,
          report.targetType,
          report.targetId,
          action,
          `举报处置 ${reportId}`,
          // 举报分类是审核员判断的输入，处置时沿用
          report.category ?? null,
        );
      }
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
    category?: ViolationCategory,
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

    await this.applyAction(moderatorId, targetType, targetId, action, reason, category);
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { characterRepository } = require('../../db/repositories/character.repository');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { userRepository } = require('../../db/repositories/user.repository');
    _instance = new ModerationService(
      reportRepository,
      moderationRepository,
      characterRepository,
      userRepository,
    );
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
