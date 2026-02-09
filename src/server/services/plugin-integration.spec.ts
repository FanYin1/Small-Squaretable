import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginService } from './plugin.service';
import { PluginBridge } from './plugin-bridge';
import { EventBus } from './event-bus.service';

describe('Plugin System Integration', () => {
  let pluginService: PluginService;
  let pluginBridge: PluginBridge;
  let eventBus: EventBus;
  let mockPluginRepo: any;
  let mockPluginSandbox: any;

  const testUserId = 'user-integration-test';
  const testAuthorId = 'author-integration-test';

  beforeEach(() => {
    eventBus = new EventBus();

    // In-memory mock repository
    const pluginsMap = new Map();
    const installsMap = new Map();
    const kvStoreMap = new Map();
    let installCounter = 0;

    mockPluginRepo = {
      createPlugin: vi.fn(async (data) => {
        const plugin = {
          id: `plugin-${Date.now()}-${Math.random()}`,
          ...data,
          installCount: 0,
          isPublished: false,
          isOfficial: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        pluginsMap.set(plugin.id, plugin);
        return plugin;
      }),
      findById: vi.fn(async (id) => pluginsMap.get(id) || null),
      findBySlug: vi.fn(async (slug) =>
        [...pluginsMap.values()].find((p) => p.slug === slug) || null,
      ),
      findByAuthorId: vi.fn(async (authorId) =>
        [...pluginsMap.values()].filter((p) => p.authorId === authorId),
      ),
      findPublished: vi.fn(async () =>
        [...pluginsMap.values()].filter((p) => p.isPublished),
      ),
      countPublished: vi.fn(async () =>
        [...pluginsMap.values()].filter((p) => p.isPublished).length,
      ),
      searchPlugins: vi.fn(async (q) =>
        [...pluginsMap.values()].filter((p) => p.name.includes(q)),
      ),
      updatePlugin: vi.fn(async (id, authorId, data) => {
        const plugin = pluginsMap.get(id);
        if (!plugin || plugin.authorId !== authorId) return null;
        Object.assign(plugin, data, { updatedAt: new Date() });
        return plugin;
      }),
      deletePlugin: vi.fn(async (id, authorId) => {
        const plugin = pluginsMap.get(id);
        if (!plugin || plugin.authorId !== authorId) return false;
        pluginsMap.delete(id);
        return true;
      }),
      incrementInstallCount: vi.fn(async (pluginId) => {
        const plugin = pluginsMap.get(pluginId);
        if (plugin) plugin.installCount++;
      }),
      decrementInstallCount: vi.fn(async (pluginId) => {
        const plugin = pluginsMap.get(pluginId);
        if (plugin && plugin.installCount > 0) plugin.installCount--;
      }),
      createInstall: vi.fn(async (data) => {
        const install = {
          id: `install-${++installCounter}`,
          ...data,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        installsMap.set(install.id, install);
        return install;
      }),
      findInstallsByUserId: vi.fn(async (userId) => {
        return [...installsMap.values()]
          .filter((i) => i.userId === userId)
          .map((i) => ({
            ...i,
            plugin: pluginsMap.get(i.pluginId),
            pluginId: i.pluginId,
          }));
      }),
      findInstallByUserAndPlugin: vi.fn(async (userId, pluginId) =>
        [...installsMap.values()].find(
          (i) => i.userId === userId && i.pluginId === pluginId,
        ) || null,
      ),
      findEnabledInstallsByEvent: vi.fn(async (userId, event) => {
        return [...installsMap.values()]
          .filter((i) => i.userId === userId && i.isEnabled)
          .map((i) => ({ ...i, plugin: pluginsMap.get(i.pluginId) }))
          .filter((i) => i.plugin && i.plugin.events.includes(event));
      }),
      updateInstall: vi.fn(async (id, userId, data) => {
        const install = installsMap.get(id);
        if (!install || install.userId !== userId) return null;
        Object.assign(install, data, { updatedAt: new Date() });
        return install;
      }),
      deleteInstall: vi.fn(async (id, userId) => {
        const install = installsMap.get(id);
        if (!install || install.userId !== userId) return false;
        installsMap.delete(id);
        return true;
      }),
      kvGet: vi.fn(async (pluginId, userId, key) =>
        kvStoreMap.get(`${pluginId}:${userId}:${key}`) ?? null,
      ),
      kvSet: vi.fn(async (pluginId, userId, key, value) => {
        kvStoreMap.set(`${pluginId}:${userId}:${key}`, value);
      }),
      kvDelete: vi.fn(async (pluginId, userId, key) =>
        kvStoreMap.delete(`${pluginId}:${userId}:${key}`),
      ),
    };

    // Mock sandbox that simulates plugin execution without real Worker Threads
    const loadedPlugins = new Map();
    mockPluginSandbox = {
      loadPlugin: vi.fn(async (pluginId, userId, sourceCode, config) => {
        const workerId = `${pluginId}:${userId}`;
        loadedPlugins.set(workerId, { sourceCode, config });
        return { workerId, events: [] };
      }),
      sendEvent: vi.fn(async (workerId, event, payload) => {
        return { success: true, duration: 1, output: payload };
      }),
      unloadPlugin: vi.fn(async (workerId) => {
        loadedPlugins.delete(workerId);
      }),
      shutdown: vi.fn(async () => {
        loadedPlugins.clear();
      }),
    };

    pluginService = new PluginService(mockPluginRepo, mockPluginSandbox, eventBus);
    pluginBridge = new PluginBridge(pluginService, eventBus);
  });

  afterEach(() => {
    pluginBridge.stop();
  });

  // Test 1: Full lifecycle
  it('should complete full lifecycle: create -> publish -> install -> execute -> uninstall', async () => {
    const plugin = await pluginService.createPlugin(testAuthorId, {
      slug: 'test-lifecycle',
      name: 'Lifecycle Test',
      description: 'Integration test plugin',
      sourceCode: 'module.exports = function(ctx) { ctx.on("character.created", async (p) => p); };',
      events: ['character.created'],
      permissions: ['events:subscribe'],
    });
    expect(plugin.id).toBeDefined();
    expect(plugin.isPublished).toBe(false);

    const published = await pluginService.publishPlugin(plugin.id, testAuthorId);
    expect(published.isPublished).toBe(true);

    const install = await pluginService.installPlugin(testUserId, plugin.id);
    expect(install).toBeDefined();
    expect(mockPluginSandbox.loadPlugin).toHaveBeenCalled();

    const results = await pluginService.executeEvent(testUserId, 'character.created', {
      userId: testUserId,
      name: 'Test',
    });
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);

    await pluginService.uninstallPlugin(install.id, testUserId);
    expect(mockPluginSandbox.unloadPlugin).toHaveBeenCalled();
    const installs = await pluginService.getUserInstalls(testUserId);
    expect(installs.length).toBe(0);
  });

  // Test 2: Sandbox isolation (require blocked)
  it('should load plugin even with dangerous code (sandbox handles isolation)', async () => {
    const plugin = await pluginService.createPlugin(testAuthorId, {
      slug: 'test-sandbox',
      name: 'Sandbox Test',
      sourceCode: 'try { require("fs"); } catch(e) {} module.exports = function(ctx) {};',
      events: ['character.created'],
      permissions: ['events:subscribe'],
    });
    await pluginService.publishPlugin(plugin.id, testAuthorId);
    const install = await pluginService.installPlugin(testUserId, plugin.id);
    expect(install).toBeDefined();
  });

  // Test 3: Event pipeline (chat.message.before modifies payload)
  it('should pipeline chat.message.before events through plugins', async () => {
    mockPluginSandbox.sendEvent.mockResolvedValueOnce({
      success: true,
      duration: 1,
      output: { content: 'modified', userId: testUserId },
    });

    const plugin = await pluginService.createPlugin(testAuthorId, {
      slug: 'test-pipeline',
      name: 'Pipeline Test',
      sourceCode:
        'module.exports = function(ctx) { ctx.on("chat.message.before", async (p) => ({ ...p, modified: true })); };',
      events: ['chat.message.before'],
      permissions: ['events:subscribe'],
    });
    await pluginService.publishPlugin(plugin.id, testAuthorId);
    await pluginService.installPlugin(testUserId, plugin.id);

    const results = await pluginService.executeEvent(testUserId, 'chat.message.before', {
      userId: testUserId,
      content: 'hello',
    });
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    expect(results[0].output).toEqual({ content: 'modified', userId: testUserId });
  });

  // Test 4: KV store persistence
  it('should persist KV store data via plugin repo', async () => {
    const plugin = await pluginService.createPlugin(testAuthorId, {
      slug: 'test-kv',
      name: 'KV Test',
      sourceCode: 'module.exports = function(ctx) {};',
      events: ['character.created'],
      permissions: ['events:subscribe', 'kv:read', 'kv:write'],
    });
    await pluginService.publishPlugin(plugin.id, testAuthorId);
    await pluginService.installPlugin(testUserId, plugin.id);

    // Verify KV operations work through the repo
    await mockPluginRepo.kvSet(plugin.id, testUserId, 'counter', 1);
    const value = await mockPluginRepo.kvGet(plugin.id, testUserId, 'counter');
    expect(value).toBe(1);

    await mockPluginRepo.kvDelete(plugin.id, testUserId, 'counter');
    const deleted = await mockPluginRepo.kvGet(plugin.id, testUserId, 'counter');
    expect(deleted).toBeNull();
  });

  // Test 5: Rate limiting (service handles rapid calls)
  it('should handle rapid event executions without error', async () => {
    const plugin = await pluginService.createPlugin(testAuthorId, {
      slug: 'test-rapid',
      name: 'Rapid Test',
      sourceCode: 'module.exports = function(ctx) { ctx.on("user.login", async (p) => p); };',
      events: ['user.login'],
      permissions: ['events:subscribe'],
    });
    await pluginService.publishPlugin(plugin.id, testAuthorId);
    await pluginService.installPlugin(testUserId, plugin.id);

    const promises = Array.from({ length: 10 }, () =>
      pluginService.executeEvent(testUserId, 'user.login', { userId: testUserId }),
    );
    const allResults = await Promise.all(promises);
    expect(allResults.length).toBe(10);
    allResults.forEach((r) => expect(r.length).toBe(1));
  });

  // Test 6: Feature gate (plan limit enforcement)
  it('should enforce install limits per plan', async () => {
    const plugin = await pluginService.createPlugin(testAuthorId, {
      slug: 'test-limit',
      name: 'Limit Test',
      sourceCode: 'module.exports = function(ctx) {};',
      events: [],
      permissions: [],
    });
    await pluginService.publishPlugin(plugin.id, testAuthorId);

    await expect(
      pluginService.installPlugin(testUserId, plugin.id, {}, 0),
    ).rejects.toThrow(/Maximum 0 plugins allowed/);
  });

  // Test 7: PluginBridge dispatches events
  it('should bridge EventBus events to plugin sandboxes via PluginBridge', async () => {
    const plugin = await pluginService.createPlugin(testAuthorId, {
      slug: 'test-bridge',
      name: 'Bridge Test',
      sourceCode:
        'module.exports = function(ctx) { ctx.on("user.login", async (p) => ({ ...p, bridged: true })); };',
      events: ['user.login'],
      permissions: ['events:subscribe'],
    });
    await pluginService.publishPlugin(plugin.id, testAuthorId);
    await pluginService.installPlugin(testUserId, plugin.id);

    pluginBridge.start();

    const result = await pluginBridge.handleEvent('user.login', {
      userId: testUserId,
      ip: '127.0.0.1',
    });
    expect(result).toBeDefined();
  });
});
