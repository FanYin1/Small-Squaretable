import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePluginStore } from './plugin';
import type { PluginInfo, PluginInstallInfo } from '@/types/plugin';

vi.mock('../services/plugin.api', () => ({
  pluginApi: {
    getInstalls: vi.fn(),
    getMarketplace: vi.fn(),
    installPlugin: vi.fn(),
    uninstallPlugin: vi.fn(),
    updateInstallConfig: vi.fn(),
    enablePlugin: vi.fn(),
    disablePlugin: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { pluginApi } from '../services/plugin.api';

const mockPlugin = (overrides: Partial<PluginInfo> = {}): PluginInfo => ({
  id: 'p1',
  slug: 'test-plugin',
  name: 'Test Plugin',
  description: 'A test plugin',
  version: '1.0.0',
  authorId: 'author1',
  events: ['chat.message.after'],
  permissions: ['kv:read'],
  configSchema: {},
  isPublished: true,
  isOfficial: false,
  installCount: 10,
  iconUrl: null,
  readme: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const mockInstall = (overrides: Partial<PluginInstallInfo> = {}): PluginInstallInfo => ({
  id: 'inst1',
  pluginId: 'p1',
  plugin: mockPlugin(),
  isEnabled: true,
  config: {},
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});
describe('usePluginStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. Initial state
  it('has correct initial state', () => {
    const store = usePluginStore();
    expect(store.installedPlugins).toEqual([]);
    expect(store.marketplacePlugins).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.marketplaceLoading).toBe(false);
    expect(store.searchQuery).toBe('');
    expect(store.currentSort).toBe('popular');
    expect(store.pagination).toEqual({
      page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false,
    });
    expect(store.error).toBeNull();
  });

  // 2. enabledPlugins getter
  it('enabledPlugins filters by isEnabled', () => {
    const store = usePluginStore();
    store.installedPlugins = [
      mockInstall({ id: 'a', isEnabled: true }),
      mockInstall({ id: 'b', isEnabled: false }),
      mockInstall({ id: 'c', isEnabled: true }),
    ];
    expect(store.enabledPlugins).toHaveLength(2);
    expect(store.enabledPlugins.map((p) => p.id)).toEqual(['a', 'c']);
  });

  // 3. installedPluginIds getter
  it('installedPluginIds returns Set of pluginIds', () => {
    const store = usePluginStore();
    store.installedPlugins = [
      mockInstall({ id: 'a', pluginId: 'p1' }),
      mockInstall({ id: 'b', pluginId: 'p2' }),
    ];
    expect(store.installedPluginIds).toEqual(new Set(['p1', 'p2']));
  });

  // 4. fetchInstalled success
  it('fetchInstalled sets installedPlugins on success', async () => {
    const installs = [mockInstall(), mockInstall({ id: 'inst2', pluginId: 'p2' })];
    vi.mocked(pluginApi.getInstalls).mockResolvedValue(installs);
    const store = usePluginStore();
    await store.fetchInstalled();
    expect(store.installedPlugins).toEqual(installs);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  // 5. fetchInstalled error
  it('fetchInstalled sets error on failure', async () => {
    vi.mocked(pluginApi.getInstalls).mockRejectedValue(new Error('Network error'));
    const store = usePluginStore();
    await store.fetchInstalled();
    expect(store.error).toBe('Network error');
    expect(store.loading).toBe(false);
  });
  // 6. fetchMarketplace success
  it('fetchMarketplace sets items and pagination on success', async () => {
    const data = {
      items: [mockPlugin()],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    };
    vi.mocked(pluginApi.getMarketplace).mockResolvedValue(data);
    const store = usePluginStore();
    await store.fetchMarketplace(1);
    expect(store.marketplacePlugins).toEqual(data.items);
    expect(store.pagination).toEqual(data.pagination);
    expect(store.marketplaceLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  // 7. fetchMarketplace error
  it('fetchMarketplace sets error on failure', async () => {
    vi.mocked(pluginApi.getMarketplace).mockRejectedValue(new Error('Server error'));
    const store = usePluginStore();
    await store.fetchMarketplace();
    expect(store.error).toBe('Server error');
    expect(store.marketplaceLoading).toBe(false);
  });

  // 8. searchPlugins
  it('searchPlugins sets query and calls fetchMarketplace', async () => {
    const data = {
      items: [mockPlugin()],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    };
    vi.mocked(pluginApi.getMarketplace).mockResolvedValue(data);
    const store = usePluginStore();
    await store.searchPlugins('hello');
    expect(store.searchQuery).toBe('hello');
    expect(pluginApi.getMarketplace).toHaveBeenCalledWith({
      search: 'hello',
      page: 1,
      limit: 20,
      sort: 'popular',
    });
  });

  // 9. installPlugin success
  it('installPlugin pushes to installed and increments marketplace count', async () => {
    const install = mockInstall({ id: 'new-inst', pluginId: 'p1' });
    vi.mocked(pluginApi.installPlugin).mockResolvedValue(install);
    const store = usePluginStore();
    store.marketplacePlugins = [mockPlugin({ id: 'p1', installCount: 5 })];
    const result = await store.installPlugin('p1', { key: 'val' });
    expect(result).toBe(true);
    expect(store.installedPlugins).toHaveLength(1);
    expect(store.installedPlugins[0].id).toBe('new-inst');
    expect(store.marketplacePlugins[0].installCount).toBe(6);
  });

  // 10. installPlugin error
  it('installPlugin returns false on error', async () => {
    vi.mocked(pluginApi.installPlugin).mockRejectedValue(new Error('Quota exceeded'));
    const store = usePluginStore();
    const result = await store.installPlugin('p1');
    expect(result).toBe(false);
    expect(store.error).toBe('Quota exceeded');
  });
  // 11. uninstallPlugin success
  it('uninstallPlugin removes from installed and decrements marketplace count', async () => {
    vi.mocked(pluginApi.uninstallPlugin).mockResolvedValue(undefined as never);
    const store = usePluginStore();
    store.installedPlugins = [mockInstall({ id: 'inst1', pluginId: 'p1' })];
    store.marketplacePlugins = [mockPlugin({ id: 'p1', installCount: 5 })];
    const result = await store.uninstallPlugin('inst1');
    expect(result).toBe(true);
    expect(store.installedPlugins).toHaveLength(0);
    expect(store.marketplacePlugins[0].installCount).toBe(4);
  });

  // 12. uninstallPlugin error
  it('uninstallPlugin returns false on error', async () => {
    vi.mocked(pluginApi.uninstallPlugin).mockRejectedValue(new Error('Not found'));
    const store = usePluginStore();
    const result = await store.uninstallPlugin('inst1');
    expect(result).toBe(false);
    expect(store.error).toBe('Not found');
  });

  // 13. updateConfig success
  it('updateConfig updates installed plugin in-place', async () => {
    const updated = mockInstall({ id: 'inst1', config: { theme: 'dark' } });
    vi.mocked(pluginApi.updateInstallConfig).mockResolvedValue(updated);
    const store = usePluginStore();
    store.installedPlugins = [mockInstall({ id: 'inst1', config: {} })];
    const result = await store.updateConfig('inst1', { config: { theme: 'dark' } });
    expect(result).toBe(true);
    expect(store.installedPlugins[0].config).toEqual({ theme: 'dark' });
  });

  // 14. updateConfig error
  it('updateConfig returns false on error', async () => {
    vi.mocked(pluginApi.updateInstallConfig).mockRejectedValue(new Error('Invalid config'));
    const store = usePluginStore();
    const result = await store.updateConfig('inst1', { config: {} });
    expect(result).toBe(false);
    expect(store.error).toBe('Invalid config');
  });

  // 15. toggleEnabled — enable path
  it('toggleEnabled calls enablePlugin when enabled=true', async () => {
    const updated = mockInstall({ id: 'inst1', isEnabled: true });
    vi.mocked(pluginApi.enablePlugin).mockResolvedValue(updated);
    const store = usePluginStore();
    store.installedPlugins = [mockInstall({ id: 'inst1', isEnabled: false })];
    const result = await store.toggleEnabled('inst1', true);
    expect(result).toBe(true);
    expect(pluginApi.enablePlugin).toHaveBeenCalledWith('inst1');
    expect(pluginApi.disablePlugin).not.toHaveBeenCalled();
    expect(store.installedPlugins[0].isEnabled).toBe(true);
  });

  // 16. toggleEnabled — disable path
  it('toggleEnabled calls disablePlugin when enabled=false', async () => {
    const updated = mockInstall({ id: 'inst1', isEnabled: false });
    vi.mocked(pluginApi.disablePlugin).mockResolvedValue(updated);
    const store = usePluginStore();
    store.installedPlugins = [mockInstall({ id: 'inst1', isEnabled: true })];
    const result = await store.toggleEnabled('inst1', false);
    expect(result).toBe(true);
    expect(pluginApi.disablePlugin).toHaveBeenCalledWith('inst1');
    expect(pluginApi.enablePlugin).not.toHaveBeenCalled();
    expect(store.installedPlugins[0].isEnabled).toBe(false);
  });

  // 17. toggleEnabled error
  it('toggleEnabled returns false on error', async () => {
    vi.mocked(pluginApi.enablePlugin).mockRejectedValue(new Error('Forbidden'));
    const store = usePluginStore();
    store.installedPlugins = [mockInstall({ id: 'inst1' })];
    const result = await store.toggleEnabled('inst1', true);
    expect(result).toBe(false);
    expect(store.error).toBe('Forbidden');
  });
});
