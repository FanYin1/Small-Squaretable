/**
 * 搜索的 NSFW 可见性（P2-6）：平台开关 + 观看者偏好
 *
 * 既有的 search-nsfw-exclusion.spec.ts 覆盖「偏好关/未传」时的硬排除；
 * 这里补「开关开 + 偏好开 -> 不排除」「开关关 + 偏好开 -> 仍排除」，
 * 以及客户端的 isNsfw 参数不能绕过。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import { config } from '../../core/config';

const whereMock = () => vi.mocked((db as unknown as { where: ReturnType<typeof vi.fn> }).where);

function collectColumns(node: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (!node || depth > 12) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectColumns(n, out, depth + 1));
    return out;
  }
  if (typeof node !== 'object') return out;
  const n = node as { constructor?: { name?: string }; name?: unknown; queryChunks?: unknown };
  if (n.constructor?.name?.startsWith('Pg') && typeof n.name === 'string') out.add(n.name);
  if (Array.isArray(n.queryChunks)) collectColumns(n.queryChunks, out, depth + 1);
  return out;
}

const filtersOnNsfw = () => whereMock().mock.calls.some((call) => collectColumns(call[0]).has('is_nsfw'));

const baseOptions = {
  query: 'wizard',
  sort: 'relevance' as const,
  filter: 'public' as const,
  page: 1,
  limit: 20,
};

describe('searchCharacters NSFW 可见性', () => {
  const original = config.nsfwEnabled;

  beforeEach(() => {
    vi.clearAllMocks();
    config.nsfwEnabled = true;
  });

  afterEach(() => {
    config.nsfwEnabled = original;
  });

  it('开关开 + 偏好开：不排除 NSFW', async () => {
    await searchService.searchCharacters({ ...baseOptions, userId: 'u1', showNsfw: true });
    expect(filtersOnNsfw()).toBe(false);
  });

  it('开关开 + 偏好开：通配符浏览同样不排除', async () => {
    await searchService.searchCharacters({ ...baseOptions, query: '*', userId: 'u1', showNsfw: true });
    expect(filtersOnNsfw()).toBe(false);
  });

  it('开关开 + 偏好关：排除 NSFW', async () => {
    await searchService.searchCharacters({ ...baseOptions, userId: 'u1', showNsfw: false });
    expect(filtersOnNsfw()).toBe(true);
  });

  it('开关开 + 未登录（showNsfw 缺省）：排除 NSFW', async () => {
    await searchService.searchCharacters({ ...baseOptions });
    expect(filtersOnNsfw()).toBe(true);
  });

  it('开关关 + 偏好开：仍排除 NSFW', async () => {
    config.nsfwEnabled = false;
    await searchService.searchCharacters({ ...baseOptions, userId: 'u1', showNsfw: true });
    expect(filtersOnNsfw()).toBe(true);
  });

  // 偏好关的用户在请求里带 isNsfw=true 不能换来 NSFW 结果
  it('客户端传 isNsfw=true 不能绕过偏好', async () => {
    await searchService.searchCharacters({ ...baseOptions, userId: 'u1', showNsfw: false, isNsfw: true });
    expect(filtersOnNsfw()).toBe(true);
  });

  it('filter=all 下偏好关同样排除（全局搜索走这里）', async () => {
    await searchService.searchCharacters({ ...baseOptions, filter: 'all', userId: 'u1', showNsfw: false });
    expect(filtersOnNsfw()).toBe(true);
  });

  it('filter=all 下偏好开不排除', async () => {
    await searchService.searchCharacters({ ...baseOptions, filter: 'all', userId: 'u1', showNsfw: true });
    expect(filtersOnNsfw()).toBe(false);
  });

  // 作者搜自己的角色不受限（与改动前一致）
  it('作者自见：filter=my 不排除，即使偏好关', async () => {
    await searchService.searchCharacters({ ...baseOptions, filter: 'my', userId: 'u1', showNsfw: false });
    expect(filtersOnNsfw()).toBe(false);
  });
});
