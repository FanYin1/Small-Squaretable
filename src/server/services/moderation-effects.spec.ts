/**
 * 审核处置必须真正改变业务状态
 *
 * 此前 takeAction / resolveReport 只往 moderation_actions 插一行日志，
 * 而那张表除了测试 mock 没有任何生产读取方。管理员在后台点「隐藏」，
 * 接口返回 200 Content hidden，角色在 marketplace 里照常可见；点
 * 「封禁用户」同样不动 users.isActive，被封的人继续正常登录。
 *
 * 这组测试断言的是副作用落到了 characters / users 上，而不是日志写没写。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModerationService } from './moderation.service';

function createMocks() {
  return {
    reportRepo: {
      create: vi.fn(),
      findById: vi.fn(),
      findPending: vi.fn(),
      resolve: vi.fn(),
    },
    moderationRepo: {
      create: vi.fn(),
      findByTarget: vi.fn(),
    },
    characterRepo: {
      updateModerationStatus: vi.fn().mockResolvedValue({ id: 'char-1' }),
    },
    userRepo: {
      update: vi.fn().mockResolvedValue({ id: 'user-1' }),
    },
  };
}

describe('moderation actions change business state', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: ModerationService;

  beforeEach(() => {
    mocks = createMocks();
    service = new ModerationService(
      mocks.reportRepo as never,
      mocks.moderationRepo as never,
      mocks.characterRepo as never,
      mocks.userRepo as never,
    );
  });

  describe('hide', () => {
    it('sets the character moderation status to hidden', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'hide', '色情内容');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ moderationStatus: 'hidden', moderatedBy: 'mod-1' }),
      );
    });

    it('records the violation category when supplied', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'hide', '色情内容', 'pornography');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ violationCategory: 'pornography' }),
      );
    });

    // 作者需要知道改什么才能重新提交
    it('passes the reason through as a note for the author', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'hide', '色情内容');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ moderationNote: '色情内容' }),
      );
    });

    it('still writes the audit log', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'hide');

      expect(mocks.moderationRepo.create).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('sets the character moderation status to approved', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'approve');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ moderationStatus: 'approved' }),
      );
    });

    // 通过时要清掉上一次驳回留下的分类，否则角色带着旧违规标记上架
    it('clears any previous violation category', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'approve');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ violationCategory: null }),
      );
    });
  });

  describe('reject', () => {
    it('sets the character moderation status to rejected', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'reject', '暴力内容', 'violence');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ moderationStatus: 'rejected', violationCategory: 'violence' }),
      );
    });
  });

  describe('suspend', () => {
    // authMiddleware 和 auth.service 都已经校验 isActive，接上即生效
    it('deactivates the user', async () => {
      await service.takeAction('mod-1', 'user', 'user-1', 'suspend', '反复上传违规内容');

      expect(mocks.userRepo.update).toHaveBeenCalledWith('user-1', { isActive: false });
    });

    it('reactivates the user on unsuspend', async () => {
      await service.takeAction('mod-1', 'user', 'user-1', 'unsuspend');

      expect(mocks.userRepo.update).toHaveBeenCalledWith('user-1', { isActive: true });
    });

    // 封禁针对用户，不该顺手改角色状态
    it('does not touch character state', async () => {
      await service.takeAction('mod-1', 'user', 'user-1', 'suspend');

      expect(mocks.characterRepo.updateModerationStatus).not.toHaveBeenCalled();
    });
  });

  describe('target type mismatch', () => {
    // hide 一个 comment 时不该把 comment id 当角色 id 去改 characters
    it('does not update characters when the target is a comment', async () => {
      await service.takeAction('mod-1', 'comment', 'comment-1', 'hide');

      expect(mocks.characterRepo.updateModerationStatus).not.toHaveBeenCalled();
    });

    it('does not suspend when the target is a character', async () => {
      await service.takeAction('mod-1', 'character', 'char-1', 'suspend');

      expect(mocks.userRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('resolveReport', () => {
    beforeEach(() => {
      mocks.reportRepo.findById.mockResolvedValue({
        id: 'report-1',
        status: 'pending',
        targetType: 'character',
        targetId: 'char-1',
        category: 'pornography',
      });
    });

    // 后台点「reject」走的是这条路径，必须同样改状态而不只是记日志
    it('applies the action to the character', async () => {
      await service.resolveReport('report-1', 'mod-1', 'resolved', 'reject');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ moderationStatus: 'rejected' }),
      );
    });

    // 举报分类是审核员判断的输入，处置时应当沿用
    it('carries the report category onto the character', async () => {
      await service.resolveReport('report-1', 'mod-1', 'resolved', 'hide');

      expect(mocks.characterRepo.updateModerationStatus).toHaveBeenCalledWith(
        'char-1',
        expect.objectContaining({ violationCategory: 'pornography' }),
      );
    });

    // 驳回举报（dismissed）意味着内容没问题，不该动内容状态
    it('does not change content state when the report is dismissed', async () => {
      await service.resolveReport('report-1', 'mod-1', 'dismissed');

      expect(mocks.characterRepo.updateModerationStatus).not.toHaveBeenCalled();
    });
  });
});
