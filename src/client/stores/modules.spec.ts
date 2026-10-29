import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useModulesStore } from './modules';

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const fetchMock = vi.fn();

describe('useModulesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats every module as closed before the config is loaded', () => {
    const store = useModulesStore();
    expect(store.loaded).toBe(false);
    expect(store.isEnabled('analytics')).toBe(false);
    expect(store.isEnabled('social_follow')).toBe(false);
  });

  it('treats routes without a module as always enabled', () => {
    const store = useModulesStore();
    expect(store.isEnabled(undefined)).toBe(true);
  });

  it('applies flags returned by the backend', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { analytics: true, plugins: false, social_follow: true } }),
    });
    const store = useModulesStore();
    await store.ensureLoaded();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/config/modules', expect.anything());
    expect(store.loaded).toBe(true);
    expect(store.isEnabled('analytics')).toBe(true);
    expect(store.isEnabled('social_follow')).toBe(true);
    expect(store.isEnabled('plugins')).toBe(false);
    // 响应里没有的模块保持关闭
    expect(store.isEnabled('recommendations')).toBe(false);
  });

  it('only requests once, even for concurrent callers', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { analytics: true } }) });
    const store = useModulesStore();
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()]);
    await store.ensureLoaded();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const store = useModulesStore();
    await store.ensureLoaded();

    expect(store.loaded).toBe(true);
    expect(store.isEnabled('analytics')).toBe(false);
  });

  it('fails closed on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const store = useModulesStore();
    await store.ensureLoaded();

    expect(store.isEnabled('plugins')).toBe(false);
  });
});
