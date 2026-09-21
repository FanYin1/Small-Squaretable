/**
 * 公开发现入口必须排除 NSFW 角色
 *
 * 平台不允许色情内容，isNsfw 因此是「违规待处置」标记而不是分级标记：
 * 被标记的角色不应该出现在任何公开发现入口里，不存在「用户选择查看」
 * 这个选项。
 *
 * 此前 characters.isNsfw 在整个 src/db/ 下从未进入任何 SQL where 条件
 * （CharacterFilters 里声明了 isNsfw 字段，但没有一处读它），所以
 * marketplace、列表、推荐对所有访客——包括未登录用户——都返回 NSFW 角色。
 *
 * 这组测试断言的是 SQL 条件本身，而不是返回值：返回值由 mock 决定，
 * 只有检查下发的 where 才能证明过滤真的存在。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterRepository } from './character.repository';

/**
 * 记录每次 .where() 收到的条件，用于断言 SQL 形状。
 *
 * Drizzle 的条件对象不便直接比较，这里把它序列化成字符串再找
 * is_nsfw 列名——列名来自 schema，不是测试里写死的字面量。
 */
function createDbSpy(rows: unknown[] = []) {
  const whereCalls: unknown[] = [];

  const chain: Record<string, unknown> = {};
  const returnsChain = (name: string) => {
    chain[name] = vi.fn((...args: unknown[]) => {
      if (name === 'where') whereCalls.push(args[0]);
      return chain;
    });
  };
  ['select', 'from', 'where', 'orderBy', 'limit', 'offset'].forEach(returnsChain);

  // 链式调用最终被 await：thenable 让 await chain 得到 rows
  chain.then = (resolve: (v: unknown) => unknown) => resolve(rows);

  return { db: chain as never, whereCalls };
}

/**
 * 从 Drizzle 的 SQL 条件树里收集涉及的列名。
 *
 * 不能用 JSON.stringify：列对象持有指回 table 的引用，序列化会抛
 * "Converting circular structure to JSON"。递归 queryChunks 取列的
 * name 更可靠，而且列名来自 schema 而非测试里的字面量。
 */
function collectColumns(node: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (!node || depth > 12) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectColumns(n, out, depth + 1));
    return out;
  }
  if (typeof node !== 'object') return out;

  const n = node as { constructor?: { name?: string }; name?: unknown; queryChunks?: unknown };
  if (n.constructor?.name?.startsWith('Pg') && typeof n.name === 'string') {
    out.add(n.name);
  }
  if (Array.isArray(n.queryChunks)) collectColumns(n.queryChunks, out, depth + 1);
  return out;
}

function whereMentionsNsfw(whereCalls: unknown[]): boolean {
  return whereCalls.some((c) => collectColumns(c).has('is_nsfw'));
}

describe('character discovery excludes NSFW', () => {
  let whereCalls: unknown[];
  let repo: CharacterRepository;

  beforeEach(() => {
    const spy = createDbSpy([]);
    whereCalls = spy.whereCalls;
    repo = new CharacterRepository(spy.db);
  });

  // marketplace 主列表：character.service.getPublicCharacters 走这里
  it('findPublic filters on is_nsfw', async () => {
    await repo.findPublic();

    expect(whereMentionsNsfw(whereCalls)).toBe(true);
  });

  // 列表总数必须和列表本身用同一套条件，否则分页会出现空尾页
  it('countPublic filters on is_nsfw', async () => {
    await repo.countPublic();

    expect(whereMentionsNsfw(whereCalls)).toBe(true);
  });

  it('findPublicWithCursor filters on is_nsfw', async () => {
    await repo.findPublicWithCursor({ limit: 20 });

    expect(whereMentionsNsfw(whereCalls)).toBe(true);
  });

  // 推荐链路：recommendation.service 两处都走这里
  it('findPublicByTags filters on is_nsfw', async () => {
    await repo.findPublicByTags(['fantasy'], 10);

    expect(whereMentionsNsfw(whereCalls)).toBe(true);
  });

  it('findPublicWithRatings filters on is_nsfw', async () => {
    await repo.findPublicWithRatings();

    expect(whereMentionsNsfw(whereCalls)).toBe(true);
  });

  // 分页第二页同样要带过滤，不能只在第一页生效
  it('keeps the filter when a cursor is supplied', async () => {
    await repo.findPublicWithCursor({ cursor: '100_abc', limit: 20 });

    expect(whereMentionsNsfw(whereCalls)).toBe(true);
  });

  // 作者查看自己的角色不是公开发现入口，不该被过滤掉——
  // 否则创作者会看不到自己被标记的角色，也就无法修正它
  it('does not filter the creator’s own tenant listing', async () => {
    await repo.findByTenantId('tenant-1');

    expect(whereMentionsNsfw(whereCalls)).toBe(false);
  });

  // 按 id 直取同样不过滤：详情页要能显示「此角色违规」而不是 404，
  // 审核后台也依赖这条路径
  it('does not filter findById', async () => {
    await repo.findById('char-1');

    expect(whereMentionsNsfw(whereCalls)).toBe(false);
  });
});
