/**
 * NSFW 偏好服务（backlog P2-6）
 *
 * 读：所有发现入口通过 resolveShowNsfw 取得「这个观看者此刻能不能看到 NSFW」。
 *     结论永远在服务端从数据库得出，客户端传来的 showNsfw / isNsfw 一律不采信。
 * 写：打开偏好要求平台开关开启且用户已确认年龄（users.age_confirmed_at 非空）。
 */

import { userRepository } from '../../db/repositories/user.repository';
import { canViewNsfw, isNsfwAllowed } from '../../db/repositories/nsfw-visibility';
import { AppError, NotFoundError } from '../../core/errors';
import { auditService } from './audit.service';
import { ageConfirmationFields } from '../utils/age-confirmation';

/** 未确认年龄的用户尝试打开偏好。前端据此引导确认年龄，不要把它当成普通 403。 */
export const AGE_CONFIRMATION_REQUIRED = 'AGE_CONFIRMATION_REQUIRED';
/** 平台关闭了 NSFW，打开偏好没有意义。 */
export const NSFW_DISABLED = 'NSFW_DISABLED';

export interface NsfwPreferenceState {
  /** 平台开关；false 时前端应隐藏整张偏好卡片 */
  nsfwEnabled: boolean;
  /** 用户存下来的偏好（不含平台开关的影响） */
  showNsfw: boolean;
  /** 是否已确认年龄；false 时无法打开偏好 */
  ageConfirmed: boolean;
}

export class NsfwPreferenceService {
  constructor(private userRepo = userRepository) {}

  /**
   * 存量用户在设置页补确认年满 18 岁（注册时已确认的用户没有这个入口）。
   *
   * - 幂等：已确认的用户直接返回当前状态，不覆盖原有时间 / IP，也不重复写审计
   * - 与平台开关无关：年龄声明本身不依赖 NSFW 是否对外开放
   * - actorIp 来自请求头而不是请求体，客户端不能自己填
   */
  async confirmAge(userId: string, actorIp?: string): Promise<NsfwPreferenceState> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (user.ageConfirmedAt) {
      return {
        nsfwEnabled: isNsfwAllowed(),
        showNsfw: user.showNsfw === true,
        ageConfirmed: true,
      };
    }

    const updated = await this.userRepo.update(userId, ageConfirmationFields(actorIp));
    if (!updated) {
      throw new NotFoundError('User');
    }

    auditService.log({
      tenantId: user.tenantId,
      actorId: user.id,
      actorIp,
      action: 'age_confirm',
      metadata: { source: 'settings' },
    });

    return {
      nsfwEnabled: isNsfwAllowed(),
      showNsfw: updated.showNsfw === true,
      ageConfirmed: !!updated.ageConfirmedAt,
    };
  }

  async getPreference(userId: string): Promise<NsfwPreferenceState> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }
    return {
      nsfwEnabled: isNsfwAllowed(),
      showNsfw: user.showNsfw === true,
      ageConfirmed: !!user.ageConfirmedAt,
    };
  }

  async setShowNsfw(userId: string, showNsfw: boolean): Promise<NsfwPreferenceState> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // 关闭永远允许：用户随时能收回，即使平台开关已关或年龄状态异常
    if (showNsfw) {
      if (!isNsfwAllowed()) {
        throw new AppError('NSFW content is disabled on this platform', 403, NSFW_DISABLED);
      }
      if (!user.ageConfirmedAt) {
        throw new AppError(
          'You must confirm that you are 18 or older before enabling NSFW content',
          403,
          AGE_CONFIRMATION_REQUIRED,
        );
      }
    }

    const updated = await this.userRepo.update(userId, { showNsfw });
    if (!updated) {
      throw new NotFoundError('User');
    }

    return {
      nsfwEnabled: isNsfwAllowed(),
      showNsfw: updated.showNsfw === true,
      ageConfirmed: !!updated.ageConfirmedAt,
    };
  }

  /**
   * 该观看者此刻能否看到 NSFW 内容。
   *
   * - 平台开关关闭：直接 false，不查库（开关关闭时行为与改动前一致，也无额外查询）
   * - 未登录：false
   * - 偏好为真但没有年龄确认：false。写入入口已经校验过，这里是第二道防线，
   *   防止直接改库或将来的其它写入路径绕过
   */
  async resolveShowNsfw(userId: string | null | undefined): Promise<boolean> {
    if (!userId || !isNsfwAllowed()) return false;
    const user = await this.userRepo.findById(userId);
    if (!user) return false;
    return canViewNsfw(user.showNsfw === true && !!user.ageConfirmedAt);
  }
}

export const nsfwPreferenceService = new NsfwPreferenceService();

/** 路由层常用的快捷方式。 */
export function resolveShowNsfw(userId: string | null | undefined): Promise<boolean> {
  return nsfwPreferenceService.resolveShowNsfw(userId);
}
