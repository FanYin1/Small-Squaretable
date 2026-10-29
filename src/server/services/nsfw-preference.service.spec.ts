/**
 * NSFW 偏好服务（P2-6）
 *
 * 重点：打开偏好需要年龄确认；可见性结论只来自数据库，不信任客户端；
 * 平台开关关闭时不查库、一律不可见。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { config } from '../../core/config';
import { AppError, NotFoundError } from '../../core/errors';
import { auditService } from './audit.service';
import {
  NsfwPreferenceService,
  AGE_CONFIRMATION_REQUIRED,
  NSFW_DISABLED,
} from './nsfw-preference.service';

vi.mock('./audit.service', () => ({ auditService: { log: vi.fn() } }));

type UserRow = {
  id: string;
  tenantId?: string;
  showNsfw: boolean;
  ageConfirmedAt: Date | null;
  ageConfirmedIp?: string | null;
};

function createRepo(user: UserRow | null) {
  return {
    findById: vi.fn().mockResolvedValue(user),
    update: vi.fn().mockImplementation(async (_id: string, data: Partial<UserRow>) =>
      user ? { ...user, ...data } : null,
    ),
  };
}

function makeService(repo: ReturnType<typeof createRepo>) {
  // 仓储是构造函数注入的，这里只用到 findById / update
  return new NsfwPreferenceService(repo as never);
}

const confirmed: UserRow = {
  id: 'u1',
  tenantId: 't1',
  showNsfw: false,
  ageConfirmedAt: new Date('2026-01-01'),
};
const unconfirmed: UserRow = { id: 'u2', tenantId: 't2', showNsfw: false, ageConfirmedAt: null };

describe('NsfwPreferenceService', () => {
  const original = config.nsfwEnabled;

  beforeEach(() => {
    vi.clearAllMocks();
    config.nsfwEnabled = true;
  });

  afterEach(() => {
    config.nsfwEnabled = original;
  });

  describe('setShowNsfw', () => {
    it('已确认年龄的用户可以打开偏好', async () => {
      const repo = createRepo(confirmed);
      const result = await makeService(repo).setShowNsfw('u1', true);

      expect(repo.update).toHaveBeenCalledWith('u1', { showNsfw: true });
      expect(result).toEqual({ nsfwEnabled: true, showNsfw: true, ageConfirmed: true });
    });

    it('未确认年龄的用户不能打开偏好：403 + AGE_CONFIRMATION_REQUIRED，且不写库', async () => {
      const repo = createRepo(unconfirmed);
      const promise = makeService(repo).setShowNsfw('u2', true);

      await expect(promise).rejects.toMatchObject({
        statusCode: 403,
        code: AGE_CONFIRMATION_REQUIRED,
      });
      await expect(promise).rejects.toBeInstanceOf(AppError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('平台开关关闭时不能打开偏好：403 + NSFW_DISABLED，且不写库', async () => {
      config.nsfwEnabled = false;
      const repo = createRepo(confirmed);

      await expect(makeService(repo).setShowNsfw('u1', true)).rejects.toMatchObject({
        statusCode: 403,
        code: NSFW_DISABLED,
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('关闭偏好永远允许，即使未确认年龄或平台开关已关', async () => {
      config.nsfwEnabled = false;
      const repo = createRepo({ ...unconfirmed, showNsfw: true });

      const result = await makeService(repo).setShowNsfw('u2', false);

      expect(repo.update).toHaveBeenCalledWith('u2', { showNsfw: false });
      expect(result.showNsfw).toBe(false);
    });

    it('用户不存在 -> NotFoundError', async () => {
      await expect(makeService(createRepo(null)).setShowNsfw('ghost', true)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('confirmAge', () => {
    it('未确认：写入时间与哈希 IP，并写 age_confirm 审计', async () => {
      const repo = createRepo(unconfirmed);
      const before = Date.now();

      const result = await makeService(repo).confirmAge('u2', '203.0.113.7');

      expect(repo.update).toHaveBeenCalledTimes(1);
      const [id, patch] = repo.update.mock.calls[0];
      expect(id).toBe('u2');
      expect(patch.ageConfirmedAt).toBeInstanceOf(Date);
      expect(patch.ageConfirmedAt.getTime()).toBeGreaterThanOrEqual(before);
      // 存的是截断的 SHA-256，不是明文 IP
      expect(patch.ageConfirmedIp).toMatch(/^[0-9a-f]{16}$/);
      expect(patch.ageConfirmedIp).not.toContain('203.0.113.7');

      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith({
        tenantId: 't2',
        actorId: 'u2',
        actorIp: '203.0.113.7',
        action: 'age_confirm',
        metadata: { source: 'settings' },
      });
      expect(result).toEqual({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    });

    it('没有 IP 时 ageConfirmedIp 记 null，仍然确认成功', async () => {
      const repo = createRepo(unconfirmed);

      const result = await makeService(repo).confirmAge('u2');

      expect(repo.update.mock.calls[0][1].ageConfirmedIp).toBeNull();
      expect(result.ageConfirmed).toBe(true);
    });

    it('已确认：幂等，不覆盖原有时间 / IP，不写库，不重复写审计', async () => {
      const repo = createRepo({ ...confirmed, ageConfirmedIp: 'abcdef0123456789' });

      const result = await makeService(repo).confirmAge('u1', '198.51.100.9');

      expect(repo.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result).toEqual({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    });

    it('平台开关关闭时也允许确认（年龄声明与开关无关）', async () => {
      config.nsfwEnabled = false;
      const repo = createRepo(unconfirmed);

      const result = await makeService(repo).confirmAge('u2', '203.0.113.7');

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ nsfwEnabled: false, showNsfw: false, ageConfirmed: true });
    });

    it('确认后可以打开偏好', async () => {
      // 用一个有状态的仓储把「先确认、再打开」串起来
      let row: UserRow = { ...unconfirmed };
      const repo = {
        findById: vi.fn().mockImplementation(async () => row),
        update: vi.fn().mockImplementation(async (_id: string, data: Partial<UserRow>) => {
          row = { ...row, ...data };
          return row;
        }),
      };
      const service = makeService(repo as never);

      await expect(service.setShowNsfw('u2', true)).rejects.toMatchObject({ code: AGE_CONFIRMATION_REQUIRED });
      await service.confirmAge('u2', '203.0.113.7');
      await expect(service.setShowNsfw('u2', true)).resolves.toMatchObject({
        showNsfw: true,
        ageConfirmed: true,
      });
    });

    it('用户不存在 -> NotFoundError，且不写审计', async () => {
      await expect(makeService(createRepo(null)).confirmAge('ghost', '1.1.1.1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('getPreference', () => {
    it('新用户 / 存量用户默认偏好关，并带回年龄确认状态与平台开关', async () => {
      const state = await makeService(createRepo(unconfirmed)).getPreference('u2');
      expect(state).toEqual({ nsfwEnabled: true, showNsfw: false, ageConfirmed: false });
    });

    it('平台开关关闭时 nsfwEnabled=false（前端据此隐藏卡片）', async () => {
      config.nsfwEnabled = false;
      const state = await makeService(createRepo(confirmed)).getPreference('u1');
      expect(state.nsfwEnabled).toBe(false);
    });
  });

  describe('resolveShowNsfw', () => {
    it('开关开 + 偏好开 + 已确认年龄 -> true', async () => {
      const repo = createRepo({ ...confirmed, showNsfw: true });
      expect(await makeService(repo).resolveShowNsfw('u1')).toBe(true);
    });

    it('开关开 + 偏好关 -> false', async () => {
      expect(await makeService(createRepo(confirmed)).resolveShowNsfw('u1')).toBe(false);
    });

    it('未登录 -> false，且不查库', async () => {
      const repo = createRepo(confirmed);
      expect(await makeService(repo).resolveShowNsfw(undefined)).toBe(false);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('开关关 + 偏好开 -> false，且不查库（开关关闭时无额外查询）', async () => {
      config.nsfwEnabled = false;
      const repo = createRepo({ ...confirmed, showNsfw: true });
      expect(await makeService(repo).resolveShowNsfw('u1')).toBe(false);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    // 第二道防线：直接改库把偏好写成 true，但年龄从未确认
    it('偏好为真但未确认年龄 -> false', async () => {
      const repo = createRepo({ ...unconfirmed, showNsfw: true });
      expect(await makeService(repo).resolveShowNsfw('u2')).toBe(false);
    });

    it('用户不存在 -> false', async () => {
      expect(await makeService(createRepo(null)).resolveShowNsfw('ghost')).toBe(false);
    });
  });
});
