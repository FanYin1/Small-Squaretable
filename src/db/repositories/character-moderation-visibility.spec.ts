/**
 * 公开发现入口必须只返回审核通过的角色
 *
 * 此前 moderationService.takeAction('hide') 只往 moderation_actions 插一行
 * 日志，不改 characters 的任何字段，而 moderation_actions 除了测试 mock 没有
 * 任何生产读取方。结果是管理员在后台点「隐藏」，接口返回 200 Content hidden，
 * 角色在 marketplace 里照常可见——UI 承诺了一个后端没做的事。
 *
 * 断言的是下发的 SQL 条件而不是返回值：返回值由 mock 决定，证明不了过滤存在。
 * 同时断言绑定值，因为只看列名无法区分「只要 approved」和「排除 approved」。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterRepository } from './character.repository';

function createDbSpy(rows: unknown[] = []) {
  const whereCalls: unknown[] = [];

  const chain: Record<string, unknown> = {};
  ['select', 'from', 'where', 'orderBy', 'limit', 'offset'].forEach((name) => {
    chain[name] = vi.fn((...args: unknown[]) => {
      if (name === 'where') whereCalls.push(args[0]);
      return chain;
    });
  });
  chain.then = (resolve: (v: unknown) => unknown) => resolve(rows);

  return { db: chain as never, whereCalls };
}

/**
 * 在条件树里找出与 moderation_status 相邻的绑定值。
 *
 * 不能用 JSON.stringify：列对象持有指回 table 的引用，会抛
 * "Converting circular structure to JSON"。递归 queryChunks 更可靠。
 */
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

function requiresApproved(whereCalls: unknown[]): boolean {
  return whereCalls.some((c) => findStatusValue(c) === 'approved');
}

describe('character discovery requires approved moderation status', () => {
  let whereCalls: unknown[];
  let repo: CharacterRepository;

  beforeEach(() => {
    const spy = createDbSpy([]);
    whereCalls = spy.whereCalls;
    repo = new CharacterRepository(spy.db);
  });

  it('findPublic only returns approved characters', async () => {
    await repo.findPublic();

    expect(requiresApproved(whereCalls)).toBe(true);
  });

  // 总数必须和列表用同一套条件，否则下架一个角色就会留下空尾页
  it('countPublic only counts approved characters', async () => {
    await repo.countPublic();

    expect(requiresApproved(whereCalls)).toBe(true);
  });

  it('findPublicWithCursor only returns approved characters', async () => {
    await repo.findPublicWithCursor({ limit: 20 });

    expect(requiresApproved(whereCalls)).toBe(true);
  });

  it('findPublicByTags only returns approved characters', async () => {
    await repo.findPublicByTags(['fantasy'], 10);

    expect(requiresApproved(whereCalls)).toBe(true);
  });

  it('findPublicWithRatings only returns approved characters', async () => {
    await repo.findPublicWithRatings();

    expect(requiresApproved(whereCalls)).toBe(true);
  });

  // 第二页同样要带条件，不能只在第一页生效
  it('keeps the status filter when a cursor is supplied', async () => {
    await repo.findPublicWithCursor({ cursor: '100_abc', limit: 20 });

    expect(requiresApproved(whereCalls)).toBe(true);
  });

  // 作者要能看到自己被驳回/下架的角色，否则无法按审核意见修正
  it('does not filter the creator’s own tenant listing', async () => {
    await repo.findByTenantId('tenant-1');

    expect(requiresApproved(whereCalls)).toBe(false);
  });

  // 详情页要能显示「此角色已下架」而不是 404，审核后台也依赖这条路径
  it('does not filter findById', async () => {
    await repo.findById('char-1');

    expect(requiresApproved(whereCalls)).toBe(false);
  });
});
