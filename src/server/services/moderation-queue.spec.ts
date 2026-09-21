/**
 * 待审角色队列（service 层）
 *
 * publish() 现在把角色置为 'pending'，公开入口要求 'approved'，中间必须有人
 * 能看到这批内容。没有这个方法，'pending' 等于把角色扔进黑洞。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModerationService } from './moderation.service';
import { BadRequestError } from '../../core/errors';

function emptyPage() {
  return {
    items: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  };
}

describe('ModerationService.getCharactersByStatus', () => {
  let characterRepo: { findByModerationStatus: ReturnType<typeof vi.fn> };
  let service: ModerationService;

  beforeEach(() => {
    characterRepo = { findByModerationStatus: vi.fn().mockResolvedValue(emptyPage()) };
    service = new ModerationService({} as never, {} as never, characterRepo as never, {} as never);
  });

  it('默认取待审队列——后台打开就该看到要干的活', async () => {
    await service.getCharactersByStatus();
    expect(characterRepo.findByModerationStatus).toHaveBeenCalledWith('pending', 1, 20);
  });

  it('透传状态和分页', async () => {
    await service.getCharactersByStatus('rejected', 3, 50);
    expect(characterRepo.findByModerationStatus).toHaveBeenCalledWith('rejected', 3, 50);
  });

  it('拒绝未知状态，而不是让它变成一次全表扫描或空结果', async () => {
    await expect(service.getCharactersByStatus('bogus' as never)).rejects.toThrow(BadRequestError);
    expect(characterRepo.findByModerationStatus).not.toHaveBeenCalled();
  });

  it('返回仓储给的分页结构', async () => {
    const page = {
      items: [{ id: 'char-1' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    };
    characterRepo.findByModerationStatus.mockResolvedValue(page);

    await expect(service.getCharactersByStatus('pending')).resolves.toEqual(page);
  });
});
