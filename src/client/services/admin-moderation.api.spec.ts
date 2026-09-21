/**
 * 后台待审队列 API
 *
 * 举报队列是被动的，只覆盖被投诉过的内容。发布后角色是 pending、公开入口
 * 要求 approved，所以必须有一条主动队列，否则新角色谁都看不到。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('./api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
  },
}));

const { adminApi } = await import('./admin.api');

describe('adminApi 审核队列', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ items: [], pagination: {} });
    mockPost.mockResolvedValue({});
  });

  it('默认取 pending——后台打开就该看到要干的活', async () => {
    await adminApi.getModerationQueue();
    expect(mockGet).toHaveBeenCalledWith('/admin/content/characters?status=pending');
  });

  it('可以换状态查看已驳回的内容', async () => {
    await adminApi.getModerationQueue({ status: 'rejected', page: 2, limit: 50 });
    expect(mockGet).toHaveBeenCalledWith(
      '/admin/content/characters?status=rejected&page=2&limit=50',
    );
  });

  it('通过角色走 unhide（approve）路径', async () => {
    await adminApi.approveCharacter('char-1');
    expect(mockPost).toHaveBeenCalledWith('/admin/content/unhide/character/char-1');
  });

  // 驳回走 reject 而不是 hide：hide → 'hidden'，作者无法自行撤销，
  // 而审核驳回的语义是「改完可以再提交」
  it('驳回带上分类和理由——理由会展示给作者', async () => {
    await adminApi.rejectCharacter('char-1', { category: 'violence', reason: '过度暴力描写' });
    expect(mockPost).toHaveBeenCalledWith('/admin/content/reject/character/char-1', {
      category: 'violence',
      reason: '过度暴力描写',
    });
  });

  it('不填分类也能驳回，不会把 undefined 编进请求体', async () => {
    await adminApi.rejectCharacter('char-1', { reason: '仅理由' });
    expect(mockPost).toHaveBeenCalledWith('/admin/content/reject/character/char-1', {
      reason: '仅理由',
    });
  });

  it('下架仍然是独立动作，不能和驳回混用同一条路由', async () => {
    await adminApi.hideCharacter('char-1', { reason: '上线后发现违规' });
    expect(mockPost).toHaveBeenCalledWith('/admin/content/hide/character/char-1', {
      reason: '上线后发现违规',
    });
  });
});
