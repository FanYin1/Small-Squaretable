/**
 * 搜索必须排除 NSFW 角色
 *
 * 平台不允许色情内容，所以这不是「用户可选的偏好」而是硬性排除。
 *
 * 此前的逻辑是 `if (isNsfw !== undefined) conditions.push(eq(isNsfw, isNsfw))`——
 * 调用方不传就完全不过滤。而客户端 useCharacterSearch 传的是
 * `showNsfw.value || undefined`，showNsfw 默认 false，`false || undefined`
 * 得到 undefined，于是过滤条件被整个跳过：默认搜索返回 NSFW 角色。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db', () => {
  const chain: Record<string, unknown> = {};
  ['select', 'from', 'where', 'orderBy', 'limit', 'offset', 'groupBy'].forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.then = (resolve: (v: unknown) => unknown) => resolve([]);
  return { db: chain };
});

vi.mock('../services/logger.service', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

import { searchService } from './search.service';
import { db } from '../../db';

/**
 * 从 Drizzle 条件树收集列名。列对象持有指回 table 的循环引用，
 * 不能用 JSON.stringify。
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

function allWhereColumns(): Set<string> {
  const out = new Set<string>();
  vi.mocked((db as unknown as { where: ReturnType<typeof vi.fn> }).where).mock.calls.forEach(
    (call) => collectColumns(call[0], out)
  );
  return out;
}

/**
 * 只检查列名不够：`eq(isNsfw, true)` 和 `eq(isNsfw, false)` 都会让
 * is_nsfw 出现在条件里，但前者是「只返回 NSFW」——方向正好相反。
 * 所以要找到 is_nsfw 那个条件并确认它绑定的值是 false。
 */
function excludesNsfw(): boolean {
  const calls = vi.mocked((db as unknown as { where: ReturnType<typeof vi.fn> }).where).mock.calls;

  return calls.some((call) => findNsfwParamValue(call[0]) === false);
}

function findNsfwParamValue(node: unknown, depth = 0): boolean | undefined {
  if (!node || depth > 12 || typeof node !== 'object') return undefined;

  const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks)) {
    // 形如 [column, ' = ', param]：先确认这一层提到 is_nsfw，再取参数值
    const mentionsNsfw = chunks.some((c) => {
      const n = c as { constructor?: { name?: string }; name?: unknown };
      return n?.constructor?.name?.startsWith('Pg') && n.name === 'is_nsfw';
    });

    if (mentionsNsfw) {
      for (const c of chunks) {
        const param = c as { value?: unknown };
        if (param && typeof param === 'object' && 'value' in param && typeof param.value === 'boolean') {
          return param.value;
        }
      }
    }

    for (const c of chunks) {
      const found = findNsfwParamValue(c, depth + 1);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

const baseOptions = {
  query: 'wizard',
  sort: 'relevance' as const,
  page: 1,
  limit: 20,
};

describe('searchCharacters excludes NSFW', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters on is_nsfw even when the caller omits the flag', async () => {
    await searchService.searchCharacters({ ...baseOptions });

    expect(excludesNsfw()).toBe(true);
  });

  // 客户端实际传的就是这个：showNsfw.value || undefined
  it('filters on is_nsfw when the caller passes undefined explicitly', async () => {
    await searchService.searchCharacters({ ...baseOptions, isNsfw: undefined });

    expect(excludesNsfw()).toBe(true);
  });

  // 不允许色情内容意味着 isNsfw: true 不是一个可满足的请求。
  // 调用方要求看 NSFW 时仍然排除——这里不做 400，因为这个参数
  // 已经没有意义，静默收紧比报错更不容易破坏现有客户端。
  it('still excludes NSFW when the caller explicitly asks for it', async () => {
    await searchService.searchCharacters({ ...baseOptions, isNsfw: true });

    expect(excludesNsfw()).toBe(true);
  });

  it('filters on is_nsfw for wildcard browse queries', async () => {
    await searchService.searchCharacters({ ...baseOptions, query: '*' });

    expect(excludesNsfw()).toBe(true);
  });

  it('filters on is_nsfw for empty queries', async () => {
    await searchService.searchCharacters({ ...baseOptions, query: '' });

    expect(excludesNsfw()).toBe(true);
  });

  // 搜索自己的角色时不该被过滤掉，否则作者无法找到并修正被标记的角色
  it('does not exclude NSFW when scoped to the caller’s own characters', async () => {
    await searchService.searchCharacters({
      ...baseOptions,
      filter: 'my',
      userId: 'user-1',
    });

    expect(allWhereColumns().has('is_nsfw')).toBe(false);
  });

  // 独立于 NSFW 的第二个缺口：filter 未指定时此前连 isPublic 都没有条件，
  // 等于搜索全库——包括其他租户的私有角色
  it('restricts to public characters when no filter is given', async () => {
    await searchService.searchCharacters({ ...baseOptions });

    expect(allWhereColumns().has('is_public')).toBe(true);
  });
});
