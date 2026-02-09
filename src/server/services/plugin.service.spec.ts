/**
 * PluginService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginService } from './plugin.service';
import { ValidationError, NotFoundError } from '../../core/errors';

// ── Mock factories ──

function createMockPluginRepo() {
  return {
    createPlugin: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByAuthorId: vi.fn(),
    findPublished: vi.fn(),
    searchPlugins: vi.fn(),
    countPublished: vi.fn(),
    updatePlugin: vi.fn(),
    deletePlugin: vi.fn(),
    incrementInstallCount: vi.fn(),
    decrementInstallCount: vi.fn(),
    createInstall: vi.fn(),
    findInstallsByUserId: vi.fn(),
    findInstallByUserAndPlugin: vi.fn(),
    findEnabledInstallsByEvent: vi.fn(),
    updateInstall: vi.fn(),
    deleteInstall: vi.fn(),
  };
}

function createMockSandbox() {
  return {
    loadPlugin: vi.fn().mockResolvedValue({ workerId: 'p1:u1', events: [] }),
    sendEvent: vi.fn(),
    unloadPlugin: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEventBus() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

type MockRepo = ReturnType<typeof createMockPluginRepo>;
type MockSandbox = ReturnType<typeof createMockSandbox>;
type MockEventBus = ReturnType<typeof createMockEventBus>;

// ── Helpers ──

const NOW = new Date('2026-02-09T12:00:00Z');

function fakePlugin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plugin-1',
    slug: 'my-plugin',
    name: 'My Plugin',
    description: 'A test plugin',
    version: '1.0.0',
    authorId: 'author-1',
    entrypoint: 'index.js',
    events: ['chat.message.before'],
    permissions: ['events:subscribe'],
    configSchema: {},
    sourceCode: 'module.exports = {}',
    isPublished: true,
    isOfficial: false,
    installCount: 5,
    iconUrl: null,
    readme: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function fakeInstall(overrides: Record<string, unknown> = {}) {
  return {
    id: 'install-1',
    userId: 'user-1',
    pluginId: 'plugin-1',
    isEnabled: true,
    config: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('PluginService', () => {
  let repo: MockRepo;
  let sandbox: MockSandbox;
  let eventBus: MockEventBus;
  let service: PluginService;

  beforeEach(() => {
    repo = createMockPluginRepo();
    sandbox = createMockSandbox();
    eventBus = createMockEventBus();
    service = new PluginService(repo as any, sandbox as any, eventBus as any);
  });

  // ── 1. createPlugin — creates and returns plugin ──
  describe('createPlugin', () => {
    it('should create and return a PluginInfo', async () => {
      repo.findBySlug.mockResolvedValue(null);
      repo.createPlugin.mockResolvedValue(fakePlugin());

      const result = await service.createPlugin('author-1', {
        slug: 'my-plugin',
        name: 'My Plugin',
        sourceCode: 'module.exports = {}',
      } as any);

      expect(repo.findBySlug).toHaveBeenCalledWith('my-plugin');
      expect(repo.createPlugin).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-plugin', authorId: 'author-1' }),
      );
      expect(result.id).toBe('plugin-1');
      expect(result.slug).toBe('my-plugin');
      expect(result.name).toBe('My Plugin');
      expect(result.createdAt).toBe(NOW.toISOString());
    });

    // ── 2. createPlugin — rejects duplicate slug ──
    it('should throw ValidationError for duplicate slug', async () => {
      repo.findBySlug.mockResolvedValue(fakePlugin());

      await expect(
        service.createPlugin('author-1', { slug: 'my-plugin', name: 'Dup', sourceCode: 'x' } as any),
      ).rejects.toThrow(ValidationError);

      expect(repo.createPlugin).not.toHaveBeenCalled();
    });
  });

  // ── 3. updatePlugin — updates fields, returns updated ──
  describe('updatePlugin', () => {
    it('should update and return PluginInfo', async () => {
      const updated = fakePlugin({ name: 'Updated Name' });
      repo.updatePlugin.mockResolvedValue(updated);

      const result = await service.updatePlugin('plugin-1', 'author-1', { name: 'Updated Name' });

      expect(repo.updatePlugin).toHaveBeenCalledWith('plugin-1', 'author-1', { name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
      expect(result.id).toBe('plugin-1');
    });

    it('should throw NotFoundError when plugin not found', async () => {
      repo.updatePlugin.mockResolvedValue(null);

      await expect(
        service.updatePlugin('missing', 'author-1', { name: 'Nope' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── 4. deletePlugin — deletes by id+authorId ──
  describe('deletePlugin', () => {
    it('should delete successfully', async () => {
      repo.deletePlugin.mockResolvedValue(true);

      await expect(service.deletePlugin('plugin-1', 'author-1')).resolves.toBeUndefined();
      expect(repo.deletePlugin).toHaveBeenCalledWith('plugin-1', 'author-1');
    });

    it('should throw NotFoundError when plugin not found', async () => {
      repo.deletePlugin.mockResolvedValue(false);

      await expect(service.deletePlugin('missing', 'author-1')).rejects.toThrow(NotFoundError);
    });
  });

  // ── 5. publishPlugin — sets isPublished=true ──
  describe('publishPlugin', () => {
    it('should call updatePlugin with isPublished: true', async () => {
      repo.updatePlugin.mockResolvedValue(fakePlugin({ isPublished: true }));

      const result = await service.publishPlugin('plugin-1', 'author-1');

      expect(repo.updatePlugin).toHaveBeenCalledWith('plugin-1', 'author-1', { isPublished: true });
      expect(result.isPublished).toBe(true);
    });
  });

  // ── 6. listPublished — returns paginated published plugins ──
  describe('listPublished', () => {
    it('should return paginated items and total', async () => {
      const plugins = [fakePlugin(), fakePlugin({ id: 'plugin-2', slug: 'p2' })];
      repo.findPublished.mockResolvedValue(plugins);
      repo.countPublished.mockResolvedValue(42);

      const result = await service.listPublished({ page: 2, limit: 10, sort: 'popular' });

      expect(repo.findPublished).toHaveBeenCalledWith({ limit: 10, offset: 10, sort: 'popular' });
      expect(repo.countPublished).toHaveBeenCalled();
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(42);
    });
  });

  // ── 7. searchPlugins — delegates to repo search ──
  describe('searchPlugins', () => {
    it('should delegate to repo and return PluginInfo[]', async () => {
      const plugins = [fakePlugin()];
      repo.searchPlugins.mockResolvedValue(plugins);

      const result = await service.searchPlugins('test', 20, 0);

      expect(repo.searchPlugins).toHaveBeenCalledWith('test', 20, 0);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('plugin-1');
    });
  });

  // ── 8. getPlugin — returns plugin by id, throws NotFoundError if missing ──
  describe('getPlugin', () => {
    it('should return PluginInfo for existing plugin', async () => {
      repo.findById.mockResolvedValue(fakePlugin());

      const result = await service.getPlugin('plugin-1');

      expect(repo.findById).toHaveBeenCalledWith('plugin-1');
      expect(result.id).toBe('plugin-1');
      expect(result.name).toBe('My Plugin');
    });

    it('should throw NotFoundError for missing plugin', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.getPlugin('missing')).rejects.toThrow(NotFoundError);
    });
  });

  // ── 9. installPlugin — creates install, increments count, loads sandbox ──
  describe('installPlugin', () => {
    it('should create install, increment count, and load sandbox', async () => {
      repo.findInstallsByUserId.mockResolvedValue([]);
      repo.findInstallByUserAndPlugin.mockResolvedValue(null);
      repo.findById.mockResolvedValue(fakePlugin());
      repo.createInstall.mockResolvedValue(fakeInstall());
      repo.incrementInstallCount.mockResolvedValue(undefined);

      const result = await service.installPlugin('user-1', 'plugin-1', { key: 'val' });

      expect(repo.findInstallsByUserId).toHaveBeenCalledWith('user-1');
      expect(repo.findInstallByUserAndPlugin).toHaveBeenCalledWith('user-1', 'plugin-1');
      expect(repo.findById).toHaveBeenCalledWith('plugin-1');
      expect(repo.createInstall).toHaveBeenCalledWith({
        userId: 'user-1',
        pluginId: 'plugin-1',
        config: { key: 'val' },
      });
      expect(repo.incrementInstallCount).toHaveBeenCalledWith('plugin-1');
      expect(sandbox.loadPlugin).toHaveBeenCalledWith(
        'plugin-1', 'user-1', 'module.exports = {}', { key: 'val' },
      );
      expect(result.id).toBe('install-1');
    });

    // ── 10. installPlugin — rejects when user has max installs ──
    it('should throw ValidationError when max installs reached', async () => {
      const existingInstalls = Array.from({ length: 5 }, (_, i) =>
        fakeInstall({ id: `install-${i}` }),
      );
      repo.findInstallsByUserId.mockResolvedValue(existingInstalls);

      await expect(
        service.installPlugin('user-1', 'plugin-1', {}, 5),
      ).rejects.toThrow(ValidationError);

      expect(repo.createInstall).not.toHaveBeenCalled();
    });

    // ── 11. installPlugin — rejects already installed ──
    it('should throw ValidationError when plugin already installed', async () => {
      repo.findInstallsByUserId.mockResolvedValue([]);
      repo.findInstallByUserAndPlugin.mockResolvedValue(fakeInstall());

      await expect(
        service.installPlugin('user-1', 'plugin-1'),
      ).rejects.toThrow(ValidationError);

      expect(repo.createInstall).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when plugin not found or not published', async () => {
      repo.findInstallsByUserId.mockResolvedValue([]);
      repo.findInstallByUserAndPlugin.mockResolvedValue(null);
      repo.findById.mockResolvedValue(fakePlugin({ isPublished: false }));

      await expect(
        service.installPlugin('user-1', 'plugin-1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should succeed even if sandbox.loadPlugin fails', async () => {
      repo.findInstallsByUserId.mockResolvedValue([]);
      repo.findInstallByUserAndPlugin.mockResolvedValue(null);
      repo.findById.mockResolvedValue(fakePlugin());
      repo.createInstall.mockResolvedValue(fakeInstall());
      repo.incrementInstallCount.mockResolvedValue(undefined);
      sandbox.loadPlugin.mockRejectedValue(new Error('Worker crashed'));

      const result = await service.installPlugin('user-1', 'plugin-1');

      expect(result.id).toBe('install-1');
    });
  });

  // ── 12. uninstallPlugin — deletes install, decrements count, unloads sandbox ──
  describe('uninstallPlugin', () => {
    it('should unload sandbox, delete install, and decrement count', async () => {
      repo.findInstallsByUserId.mockResolvedValue([fakeInstall()]);
      repo.deleteInstall.mockResolvedValue(true);
      repo.decrementInstallCount.mockResolvedValue(undefined);

      await service.uninstallPlugin('install-1', 'user-1');

      expect(sandbox.unloadPlugin).toHaveBeenCalledWith('plugin-1:user-1');
      expect(repo.deleteInstall).toHaveBeenCalledWith('install-1', 'user-1');
      expect(repo.decrementInstallCount).toHaveBeenCalledWith('plugin-1');
    });

    it('should throw NotFoundError when install not found', async () => {
      repo.findInstallsByUserId.mockResolvedValue([]);

      await expect(
        service.uninstallPlugin('missing', 'user-1'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── 13. enablePlugin / disablePlugin — toggles isEnabled ──
  describe('enablePlugin / disablePlugin', () => {
    it('enablePlugin should call updateInstall with isEnabled: true', async () => {
      repo.updateInstall.mockResolvedValue(fakeInstall({ isEnabled: true }));

      const result = await service.enablePlugin('install-1', 'user-1');

      expect(repo.updateInstall).toHaveBeenCalledWith('install-1', 'user-1', { isEnabled: true });
      expect(result.isEnabled).toBe(true);
    });

    it('disablePlugin should call updateInstall with isEnabled: false', async () => {
      repo.updateInstall.mockResolvedValue(fakeInstall({ isEnabled: false }));

      const result = await service.disablePlugin('install-1', 'user-1');

      expect(repo.updateInstall).toHaveBeenCalledWith('install-1', 'user-1', { isEnabled: false });
      expect(result.isEnabled).toBe(false);
    });

    it('should throw NotFoundError when install not found', async () => {
      repo.updateInstall.mockResolvedValue(null);

      await expect(service.enablePlugin('missing', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  // ── 14-16. executeEvent ──
  describe('executeEvent', () => {
    // ── 14. finds enabled installs, sends event to each sandbox ──
    it('should send event to each enabled install sandbox', async () => {
      const installs = [
        fakeInstall({ id: 'i1', pluginId: 'p1' }),
        fakeInstall({ id: 'i2', pluginId: 'p2' }),
      ];
      repo.findEnabledInstallsByEvent.mockResolvedValue(installs);
      sandbox.sendEvent
        .mockResolvedValueOnce({ success: true, duration: 10, output: 'r1' })
        .mockResolvedValueOnce({ success: true, duration: 5, output: 'r2' });

      const results = await service.executeEvent('user-1', 'character.created', { id: 'c1' });

      expect(repo.findEnabledInstallsByEvent).toHaveBeenCalledWith('user-1', 'character.created');
      expect(sandbox.sendEvent).toHaveBeenCalledTimes(2);
      expect(sandbox.sendEvent).toHaveBeenCalledWith('p1:user-1', 'character.created', { id: 'c1' });
      expect(sandbox.sendEvent).toHaveBeenCalledWith('p2:user-1', 'character.created', { id: 'c1' });
      expect(results).toHaveLength(2);
      expect(results[0].output).toBe('r1');
      expect(results[1].output).toBe('r2');
    });

    // ── 15. returns empty array when no plugins subscribed ──
    it('should return empty array when no plugins subscribed', async () => {
      repo.findEnabledInstallsByEvent.mockResolvedValue([]);

      const results = await service.executeEvent('user-1', 'user.login', {});

      expect(results).toEqual([]);
      expect(sandbox.sendEvent).not.toHaveBeenCalled();
    });

    // ── 16. pipeline: chat.message.before passes output as next input ──
    it('should pipeline chat.message.before output as next input', async () => {
      const installs = [
        fakeInstall({ id: 'i1', pluginId: 'p1' }),
        fakeInstall({ id: 'i2', pluginId: 'p2' }),
        fakeInstall({ id: 'i3', pluginId: 'p3' }),
      ];
      repo.findEnabledInstallsByEvent.mockResolvedValue(installs);
      sandbox.sendEvent
        .mockResolvedValueOnce({ success: true, duration: 5, output: { text: 'modified-1' } })
        .mockResolvedValueOnce({ success: true, duration: 3, output: { text: 'modified-2' } })
        .mockResolvedValueOnce({ success: true, duration: 2, output: { text: 'modified-3' } });

      const results = await service.executeEvent('user-1', 'chat.message.before', { text: 'original' });

      // First plugin gets original payload
      expect(sandbox.sendEvent).toHaveBeenNthCalledWith(
        1, 'p1:user-1', 'chat.message.before', { text: 'original' },
      );
      // Second plugin gets output of first
      expect(sandbox.sendEvent).toHaveBeenNthCalledWith(
        2, 'p2:user-1', 'chat.message.before', { text: 'modified-1' },
      );
      // Third plugin gets output of second
      expect(sandbox.sendEvent).toHaveBeenNthCalledWith(
        3, 'p3:user-1', 'chat.message.before', { text: 'modified-2' },
      );
      expect(results).toHaveLength(3);
    });
  });
});
