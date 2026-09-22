/**
 * 发布 NSFW 角色必须在边界上被拒绝
 *
 * PUBLIC_VISIBLE() 无条件排除 isNsfw=true，而 updateModerationStatus 不碰
 * isNsfw——也就是说标了 NSFW 的角色即使审核通过也永远不可见，而且没有任何
 * 路径能改变这一点。
 *
 * 此前作者可以打开编辑器里的 NSFW 开关、点发布、拿到 200、看到「待审核」
 * 徽标，审核员还能点通过，但角色永久隐形。这和 613f1c9 引入的 pending
 * 回归是同一类缺陷：可达的界面路径产出永久不可见的内容且不给解释。
 *
 * 所以不是「发布后静默过滤」，而是发布时就明确失败。平台不允许色情内容，
 * isNsfw 是违规待处置标记而不是分级标记，没有「让用户自己选择」这一档。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CharacterService } from './character.service';
import { BadRequestError } from '../../core/errors';

const characterId = 'char-1';
const userId = 'user-1';
const tenantId = 'tenant-1';

function createRepoSpy(character: Record<string, unknown>) {
  return {
    findById: vi.fn().mockResolvedValue(character),
    update: vi.fn().mockImplementation((_id, _tenant, data) => ({ ...character, ...data })),
  };
}

function makeService(repo: ReturnType<typeof createRepoSpy>) {
  const service = new CharacterService();
  // @ts-expect-error 私有依赖注入，仅测试用
  service.characterRepo = repo;
  return service;
}

const base = {
  id: characterId,
  creatorId: userId,
  tenantId,
  isPublic: false,
  moderationStatus: 'draft',
  isNsfw: false,
};

describe('publish 与 isNsfw', () => {
  beforeEach(() => vi.clearAllMocks());

  it('拒绝发布标记为 NSFW 的角色，而不是发完让它隐形', async () => {
    const repo = createRepoSpy({ ...base, isNsfw: true });
    const service = makeService(repo);

    await expect(service.publish(characterId, userId, tenantId)).rejects.toThrow(BadRequestError);
  });

  it('被拒绝时不写库——不留下一个 isPublic=true 却永不可见的角色', async () => {
    const repo = createRepoSpy({ ...base, isNsfw: true });
    const service = makeService(repo);

    await expect(service.publish(characterId, userId, tenantId)).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });

  // 错误信息会直接展示给作者，必须说清为什么，否则作者只会反复重试
  it('错误信息解释原因，而不是一句泛泛的失败', async () => {
    const repo = createRepoSpy({ ...base, isNsfw: true });
    const service = makeService(repo);

    await expect(service.publish(characterId, userId, tenantId)).rejects.toThrow(/NSFW/i);
  });

  it('非 NSFW 角色照常发布进入待审', async () => {
    const repo = createRepoSpy({ ...base, isNsfw: false });
    const service = makeService(repo);

    await service.publish(characterId, userId, tenantId);

    expect(repo.update).toHaveBeenCalledWith(characterId, tenantId, {
      isPublic: true,
      moderationStatus: 'pending',
      violationCategory: null,
      moderationNote: null,
    });
  });

  // 老数据里 isNsfw 可能是 null：不该因为字段缺失就拦住正常发布
  it('isNsfw 为 null 时不拦截', async () => {
    const repo = createRepoSpy({ ...base, isNsfw: null });
    const service = makeService(repo);

    await service.publish(characterId, userId, tenantId);

    expect(repo.update).toHaveBeenCalled();
  });

  // 权限检查必须在 NSFW 检查之前：否则非作者能通过错误信息探测到
  // 别人私有角色的 NSFW 标记
  it('非作者拿到的是权限错误，不是 NSFW 错误', async () => {
    const repo = createRepoSpy({ ...base, isNsfw: true, creatorId: 'someone-else' });
    const service = makeService(repo);

    await expect(service.publish(characterId, userId, tenantId)).rejects.toThrow(
      /Only creator/i,
    );
  });

  // 下架不受影响：已经标记的角色作者仍然要能撤回发布状态
  it('下架 NSFW 角色不被拦截', async () => {
    const repo = createRepoSpy({ ...base, isNsfw: true, isPublic: true, moderationStatus: 'pending' });
    const service = makeService(repo);

    await service.unpublish(characterId, userId, tenantId);

    expect(repo.update).toHaveBeenCalledWith(characterId, tenantId, {
      isPublic: false,
      moderationStatus: 'draft',
    });
  });
});
