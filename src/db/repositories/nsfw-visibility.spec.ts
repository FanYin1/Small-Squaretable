/**
 * NSFW 可见性（P2-6）：平台开关 + 用户偏好两层控制
 *
 * 一张 NSFW 卡对观看者可见，当且仅当「平台开关开启」且「观看者偏好开启」。
 * 这里断言的是下发给数据库的 where 条件本身（返回值由 mock 决定，不能证明过滤存在）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from '../../core/config';
import { CharacterRepository } from './character.repository';
import {
  canViewNsfw,
  canViewCharacterNsfw,
  isNsfwAllowed,
  nsfwVisibilityCondition,
  nsfwVisibilityConditionForViewer,
} from './nsfw-visibility';

const originalSwitch = config.nsfwEnabled;

function setSwitch(value: boolean) {
  config.nsfwEnabled = value;
}

afterEach(() => {
  config.nsfwEnabled = originalSwitch;
});

describe('canViewNsfw', () => {
  it('开关开 + 偏好开 -> 可见', () => {
    setSwitch(true);
    expect(canViewNsfw(true)).toBe(true);
  });

  it('开关开 + 偏好关 -> 不可见', () => {
    setSwitch(true);
    expect(canViewNsfw(false)).toBe(false);
  });

  it('开关开 + 未登录（偏好缺省）-> 不可见', () => {
    setSwitch(true);
    expect(canViewNsfw(undefined)).toBe(false);
    expect(canViewNsfw(null)).toBe(false);
  });

  it('开关关 + 偏好开 -> 不可见', () => {
    setSwitch(false);
    expect(canViewNsfw(true)).toBe(false);
  });

  it('isNsfwAllowed 在调用时读取开关，而不是模块加载时', () => {
    setSwitch(false);
    expect(isNsfwAllowed()).toBe(false);
    setSwitch(true);
    expect(isNsfwAllowed()).toBe(true);
  });
});

describe('canViewCharacterNsfw（按 id 直取）', () => {
  beforeEach(() => setSwitch(true));

  const nsfwCard = { isNsfw: true, creatorId: 'author' };

  it('非 NSFW 的卡对任何人可见', () => {
    expect(canViewCharacterNsfw({ isNsfw: false, creatorId: 'author' }, {})).toBe(true);
    expect(canViewCharacterNsfw({ isNsfw: null, creatorId: 'author' }, {})).toBe(true);
  });

  it('偏好关的非作者看不到 NSFW 卡', () => {
    expect(canViewCharacterNsfw(nsfwCard, { id: 'other', prefersNsfw: false })).toBe(false);
  });

  it('未登录看不到 NSFW 卡', () => {
    expect(canViewCharacterNsfw(nsfwCard, {})).toBe(false);
  });

  it('偏好开的用户看得到', () => {
    expect(canViewCharacterNsfw(nsfwCard, { id: 'other', prefersNsfw: true })).toBe(true);
  });

  it('作者始终看得到自己的卡，即使偏好关', () => {
    expect(canViewCharacterNsfw(nsfwCard, { id: 'author', prefersNsfw: false })).toBe(true);
  });

  it('作者的豁免在开关关闭时同样成立（与改动前一致：作者能打开自己的卡去修正）', () => {
    setSwitch(false);
    expect(canViewCharacterNsfw(nsfwCard, { id: 'author', prefersNsfw: false })).toBe(true);
  });

  it('开关关 + 偏好开的非作者看不到', () => {
    setSwitch(false);
    expect(canViewCharacterNsfw(nsfwCard, { id: 'other', prefersNsfw: true })).toBe(false);
  });
});

describe('条件构造器', () => {
  it('可见时不加条件', () => {
    setSwitch(true);
    expect(nsfwVisibilityCondition(true)).toBeUndefined();
    expect(nsfwVisibilityConditionForViewer(true, 'u1')).toBeUndefined();
  });

  it('不可见时加 is_nsfw 条件', () => {
    setSwitch(true);
    expect(nsfwVisibilityCondition(false)).toBeDefined();
    expect(nsfwVisibilityCondition(undefined)).toBeDefined();
  });

  it('开关关闭时，偏好开也要加条件', () => {
    setSwitch(false);
    expect(nsfwVisibilityCondition(true)).toBeDefined();
  });

  it('ForViewer 变体对未登录与已登录都返回条件', () => {
    setSwitch(true);
    expect(nsfwVisibilityConditionForViewer(false, undefined)).toBeDefined();
    expect(nsfwVisibilityConditionForViewer(false, 'u1')).toBeDefined();
  });
});

// ── 仓储层：公开列表 ──

function createDbSpy() {
  const whereCalls: unknown[] = [];
  const chain: Record<string, unknown> = {};
  ['select', 'from', 'where', 'orderBy', 'limit', 'offset'].forEach((name) => {
    chain[name] = vi.fn((...args: unknown[]) => {
      if (name === 'where') whereCalls.push(args[0]);
      return chain;
    });
  });
  chain.then = (resolve: (v: unknown) => unknown) => resolve([]);
  return { db: chain as never, whereCalls };
}

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

const mentionsNsfw = (calls: unknown[]) => calls.some((c) => collectColumns(c).has('is_nsfw'));

type Call = (repo: CharacterRepository, viewer?: { showNsfw?: boolean }) => Promise<unknown>;

const entries: Array<[string, Call]> = [
  ['findPublic', (r, v) => r.findPublic(undefined, v)],
  ['countPublic', (r, v) => r.countPublic(v)],
  ['findPublicWithCursor', (r, v) => r.findPublicWithCursor({ limit: 20 }, v)],
  ['findPublicByTags', (r, v) => r.findPublicByTags(['fantasy'], 10, v)],
  ['findPublicWithRatings', (r, v) => r.findPublicWithRatings(undefined, v)],
];

describe.each(entries)('仓储 %s 的 NSFW 可见性', (_name, call) => {
  let whereCalls: unknown[];
  let repo: CharacterRepository;

  beforeEach(() => {
    const spy = createDbSpy();
    whereCalls = spy.whereCalls;
    repo = new CharacterRepository(spy.db);
  });

  it('开关开 + 偏好开：不排除 NSFW', async () => {
    setSwitch(true);
    await call(repo, { showNsfw: true });
    expect(mentionsNsfw(whereCalls)).toBe(false);
  });

  it('开关开 + 偏好关：排除 NSFW', async () => {
    setSwitch(true);
    await call(repo, { showNsfw: false });
    expect(mentionsNsfw(whereCalls)).toBe(true);
  });

  it('开关开 + 未传 viewer（未登录/推荐等内部调用）：排除 NSFW', async () => {
    setSwitch(true);
    await call(repo);
    expect(mentionsNsfw(whereCalls)).toBe(true);
  });

  it('开关关 + 偏好开：仍排除 NSFW', async () => {
    setSwitch(false);
    await call(repo, { showNsfw: true });
    expect(mentionsNsfw(whereCalls)).toBe(true);
  });
});
