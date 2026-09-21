/**
 * 搜索必须只返回审核通过的角色
 *
 * 搜索层自己拼 where 条件，不走仓储层的 PUBLIC_VISIBLE，所以仓储层加了
 * moderation_status 过滤之后搜索仍是一条绕过路径：被管理员下架的角色
 * 在 marketplace 列表里消失了，搜一下名字照样能搜出来。
 *
 * 断言绑定值而不只是列名出现——只看列名无法区分「只要 approved」和
 * 「排除 approved」。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db', () => {
  const chain: Record<string, unknown> = {};
  ['select', 'from', 'where', 'orderBy', 'limit', 'offset', 'groupBy'].forEach((name) => {
    chain[name] = vi.fn(() => chain);
  });
  chain.then = (resolve: (v: unknown) => unknown) => resolve([]);
  return { db: chain };
});

vi.mock('./logger.service', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

import { db } from '../../db';
import { searchService } from './search.service';

function whereCalls(): unknown[][] {
  return vi.mocked((db as unknown as { where: ReturnType<typeof vi.fn> }).where).mock.calls;
}

/** 在条件树里找出与 moderation_status 相邻的绑定值 */
function findStatusValue(node: unknown, depth = 0): string | undefined {
  if (!node || depth > 12 || typeof node !== 'object') return undefined;

  const n = node as { queryChunks?: unknown[] };
  if (Array.isArray(n.queryChunks)) {
    const chunks = n.queryChunks;
    const mentionsStatus = chunks.some((c) => {
      const col = c as { constructor?: { name?: string }; name?: unknown };
      return col?.constructor?.name?.startsWith('Pg') && col.name === 'moderation_status';
    });
    if (mentionsStatus) {
      for (const c of chunks) {
        const param = c as { value?: unknown };
        if (typeof param?.value === 'string') return param.value;
      }
    }
    for (const c of chunks) {
      const found = findStatusValue(c, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function requiresApproved(): boolean {
  return whereCalls().some((call) => findStatusValue(call[0]) === 'approved');
}

describe('search requires approved moderation status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters to approved characters by default', async () => {
    await searchService.searchCharacters({ query: 'dragon' });

    expect(requiresApproved()).toBe(true);
  });

  it('filters to approved characters for wildcard queries', async () => {
    await searchService.searchCharacters({ query: '*' });

    expect(requiresApproved()).toBe(true);
  });

  it('filters to approved characters for empty queries', async () => {
    await searchService.searchCharacters({ query: '' });

    expect(requiresApproved()).toBe(true);
  });

  it('filters to approved characters for the public filter', async () => {
    await searchService.searchCharacters({ query: 'dragon', filter: 'public' });

    expect(requiresApproved()).toBe(true);
  });

  // 'all' 混合了公开角色和调用方自己的角色。自己的那部分不该被审核状态挡住，
  // 但公开的那部分必须挡住——所以这里应该是「approved OR 自己创建的」，
  // 而不是无条件放行。
  it('still restricts the public half of the all filter', async () => {
    await searchService.searchCharacters({ query: 'dragon', filter: 'all', userId: 'user-1' });

    expect(requiresApproved()).toBe(true);
  });

  // 作者要能搜到自己被驳回/下架的角色才能修正
  it('does not restrict own-scope search', async () => {
    await searchService.searchCharacters({ query: 'dragon', filter: 'my', userId: 'user-1' });

    expect(requiresApproved()).toBe(false);
  });
});
