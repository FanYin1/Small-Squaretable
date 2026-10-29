import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('element-plus', () => ({ ElMessage: { warning: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn();

async function loadRouter(flags: Record<string, boolean>) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: flags }) });
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  // resetModules 后 router 与 store 会重新加载，必须在之后再建 pinia
  const pinia = await import('pinia');
  pinia.setActivePinia(pinia.createPinia());
  const { default: router } = await import('./index');
  return router;
}

describe('router module guard (P2-1)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('waits for restored identity before entering the story library', async () => {
    const router = await loadRouter({});
    const { useUserStore } = await import('@client/stores/user');
    const { authApi } = await import('@client/services');
    const user = { id: 'reader', tenantId: 'tenant', email: 'reader@example.test', name: 'Reader', createdAt: '2026-10-23' };
    let finishProfile!: (response: { user: typeof user }) => void;
    const profile = vi.spyOn(authApi, 'getMe').mockReturnValue(new Promise(resolve => { finishProfile = resolve; }));
    const store = useUserStore();
    store.setToken(`header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`);

    const navigation = router.push('/chat');
    await vi.waitFor(() => expect(profile).toHaveBeenCalledOnce());
    expect(router.currentRoute.value.name).not.toBe('Chat');
    expect(store.user).toBeNull();

    finishProfile({ user });
    await navigation;
    expect(store.user).toEqual(user);
    expect(router.currentRoute.value.name).toBe('Chat');
  });

  it('renders NotFound with the original URL for a closed module route', async () => {
    const router = await loadRouter({ plugins: false });
    await router.push('/plugins');

    expect(router.currentRoute.value.name).toBe('NotFound');
    expect(router.currentRoute.value.path).toBe('/plugins');
  });

  it('lets an open module route through to the next guard', async () => {
    const router = await loadRouter({ plugins: true });
    await router.push('/plugins');

    // 模块已开启：不会被当作 404（未登录时由认证守卫接管）
    expect(router.currentRoute.value.name).not.toBe('NotFound');
  });

  it('closes every route that declares a closed module', async () => {
    const router = await loadRouter({});
    const gated = router
      .getRoutes()
      .filter((r) => r.meta.module && r.path.startsWith('/'));

    expect(gated.length).toBeGreaterThan(0);
    for (const record of gated) {
      if (record.path.includes(':')) continue;
      await router.push(record.path);
      expect(router.currentRoute.value.name, record.path).toBe('NotFound');
    }
  });
});
