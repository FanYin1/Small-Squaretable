/**
 * 发布必须进入待审核状态，而不是直接停在 draft
 *
 * 背景（这是一个由 613f1c9 引入的回归）：那个提交给公开发现入口
 * （PUBLIC_VISIBLE / publiclyVisible）加上了 moderation_status = 'approved'
 * 的条件，但 publish() 只写 isPublic: true，moderation_status 留在默认值
 * 'draft'。结果是新发布的角色在 marketplace 和搜索里都看不见，而且没有任何
 * 路径能让它变成 approved——唯一的写入方 updateModerationStatus 只能由管理员
 * 处置举报时触发，而后台当时只有举报列表、没有待审队列。
 *
 * 所以这里断言的是 update() 实际下发的字段，不是返回值：返回值由 mock 决定，
 * 证明不了服务真的写了状态。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterService } from './character.service';

function createRepoSpy(character: Record<string, unknown>) {
  return {
    findById: vi.fn().mockResolvedValue(character),
    update: vi.fn(async (_id: string, _tenantId: string, data: Record<string, unknown>) => ({
      ...character,
      ...data,
    })),
  };
}

const OWNER = 'user-1';
const TENANT = 'tenant-1';
const CHAR = 'char-1';

const baseCharacter = {
  id: CHAR,
  tenantId: TENANT,
  creatorId: OWNER,
  isPublic: false,
  moderationStatus: 'draft',
};

describe('CharacterService 发布状态机', () => {
  let repo: ReturnType<typeof createRepoSpy>;
  let service: CharacterService;

  beforeEach(() => {
    repo = createRepoSpy(baseCharacter);
    service = new CharacterService(repo as never);
  });

  describe('publish', () => {
    it('把角色标成 pending 而不是留在 draft', async () => {
      await service.publish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data.moderationStatus).toBe('pending');
    });

    it('同时置 isPublic——待审核也是作者表达过发布意图的状态', async () => {
      await service.publish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data.isPublic).toBe(true);
    });

    it('不会自己给自己盖 approved 章', async () => {
      await service.publish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data.moderationStatus).not.toBe('approved');
    });

    it('清掉上一轮的驳回理由——重新提交不该继续显示旧结论', async () => {
      repo = createRepoSpy({
        ...baseCharacter,
        moderationStatus: 'rejected',
        violationCategory: 'violence',
        moderationNote: '过度暴力描写',
      });
      service = new CharacterService(repo as never);

      await service.publish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data.violationCategory).toBeNull();
      expect(data.moderationNote).toBeNull();
    });

    // 下面两条断言「不写这个字段」而不是「写回原值」：不下发即保持库里的值，
    // 这样也顺带证明了服务没有在这条路径上碰审核状态。
    it('已经 approved 的角色重新发布不会被打回待审', async () => {
      repo = createRepoSpy({ ...baseCharacter, moderationStatus: 'approved' });
      service = new CharacterService(repo as never);

      await service.publish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data).not.toHaveProperty('moderationStatus');
    });

    it('被管理员 hidden 的角色重新发布也不能靠自己复活', async () => {
      repo = createRepoSpy({ ...baseCharacter, moderationStatus: 'hidden' });
      service = new CharacterService(repo as never);

      await service.publish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data).not.toHaveProperty('moderationStatus');
      // 驳回理由也不能被清掉——那是处置记录的一部分
      expect(data).not.toHaveProperty('moderationNote');
    });
  });

  describe('unpublish', () => {
    it('下架时把待审状态退回 draft——不该继续占着审核队列', async () => {
      repo = createRepoSpy({ ...baseCharacter, isPublic: true, moderationStatus: 'pending' });
      service = new CharacterService(repo as never);

      await service.unpublish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data.isPublic).toBe(false);
      expect(data.moderationStatus).toBe('draft');
    });

    it('作者下架不能洗掉管理员的 hidden 处置', async () => {
      repo = createRepoSpy({ ...baseCharacter, isPublic: true, moderationStatus: 'hidden' });
      service = new CharacterService(repo as never);

      await service.unpublish(CHAR, OWNER, TENANT);

      const [, , data] = repo.update.mock.calls[0];
      expect(data.isPublic).toBe(false);
      expect(data).not.toHaveProperty('moderationStatus');
    });
  });
});
