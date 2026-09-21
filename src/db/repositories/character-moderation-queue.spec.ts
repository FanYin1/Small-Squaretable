/**
 * 待审队列查询必须真的按审核状态过滤，且跨租户
 *
 * 没有这个查询，'pending' 只是「另一种隐形」：作者发布后角色不在公开入口
 * （要求 approved），也不在任何审核员能看到的列表里，于是永远卡住。
 *
 * 跨租户是有意的，和 updateModerationStatus 同理——平台审核员要能看到任何
 * 租户提交的内容，越权防护由路由层的 requireRole('moderator') 负责。
 * 因此这里额外断言条件树里不出现 tenant_id：一旦有人「顺手补上」租户隔离，
 * 审核员就只能看到自己租户的队列，绝大多数待审内容会静默消失。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterRepository } from './character.repository';

function createDbSpy(rows: unknown[] = [], count = 0) {
  const whereCalls: unknown[] = [];
  let selectCall = 0;

  const makeChain = (resolved: unknown) => {
    const chain: Record<string, unknown> = {};
    ['select', 'from', 'where', 'orderBy', 'limit', 'offset'].forEach((name) => {
      chain[name] = vi.fn((...args: unknown[]) => {
        if (name === 'where') whereCalls.push(args[0]);
        return chain;
      });
    });
    chain.then = (resolve: (v: unknown) => unknown) => resolve(resolved);
    return chain;
  };

  const db = {
    select: vi.fn(() => {
      selectCall += 1;
      // 第一次取列表，第二次取总数
      return selectCall === 1 ? makeChain(rows) : makeChain([{ count }]);
    }),
  };

  return { db: db as never, whereCalls };
}

/** 递归找条件树里提到的列名。不能 JSON.stringify：列对象循环引用会抛错。 */
function collectColumnNames(node: unknown, acc = new Set<string>(), depth = 0): Set<string> {
  if (!node || depth > 12 || typeof node !== 'object') return acc;

  const n = node as { queryChunks?: unknown[]; constructor?: { name?: string }; name?: unknown };
  if (n.constructor?.name?.startsWith('Pg') && typeof n.name === 'string') {
    acc.add(n.name);
  }
  if (Array.isArray(n.queryChunks)) {
    for (const c of n.queryChunks) collectColumnNames(c, acc, depth + 1);
  }
  return acc;
}

/** 找出与 moderation_status 相邻的绑定值——只看列名分不清 pending 和 approved。 */
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

describe('CharacterRepository.findByModerationStatus', () => {
  let spy: ReturnType<typeof createDbSpy>;
  let repo: CharacterRepository;

  beforeEach(() => {
    spy = createDbSpy([{ id: 'char-1' }], 1);
    repo = new CharacterRepository(spy.db);
  });

  it('按传入的状态过滤，而不是写死某个状态', async () => {
    await repo.findByModerationStatus('pending', 1, 20);
    expect(findStatusValue(spy.whereCalls[0])).toBe('pending');
  });

  it('同一个方法也能取被驳回的队列', async () => {
    await repo.findByModerationStatus('rejected', 1, 20);
    expect(findStatusValue(spy.whereCalls[0])).toBe('rejected');
  });

  it('不加租户条件——审核员要看到所有租户的待审内容', async () => {
    await repo.findByModerationStatus('pending', 1, 20);
    const columns = collectColumnNames(spy.whereCalls[0]);
    expect(columns.has('moderation_status')).toBe(true);
    expect(columns.has('tenant_id')).toBe(false);
  });

  it('总数查询用的是同一个状态条件', async () => {
    await repo.findByModerationStatus('pending', 1, 20);
    // 两次 where：列表和 count，都必须带状态
    expect(spy.whereCalls).toHaveLength(2);
    expect(findStatusValue(spy.whereCalls[1])).toBe('pending');
  });

  it('返回分页信息，让后台知道还有多少待审', async () => {
    spy = createDbSpy([{ id: 'char-1' }], 42);
    repo = new CharacterRepository(spy.db);

    const result = await repo.findByModerationStatus('pending', 2, 20);

    expect(result.items).toHaveLength(1);
    expect(result.pagination.total).toBe(42);
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.totalPages).toBe(3);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
  });
});
