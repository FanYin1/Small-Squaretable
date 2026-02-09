/**
 * PluginRepository Unit Tests
 *
 * Uses mocked database since no real DB connection is available.
 * Follows the same pattern as apiKey.repository.spec.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Database } from '../index';
import { PluginRepository } from './plugin.repository';

// -- Helpers --

const now = new Date('2026-02-09T00:00:00Z');

const mockPluginRecord = {
  id: 'plugin-uuid-1',
  slug: 'my-plugin',
  name: 'My Plugin',
  description: 'A test plugin',
  version: '1.0.0',
  authorId: 'author-a',
  entrypoint: 'index.js',
  events: ['chat.message.before', 'chat.message.after'],
  permissions: ['events:subscribe', 'kv:read'],
  configSchema: {},
  sourceCode: 'export default {}',
  isPublished: true,
  isOfficial: false,
  installCount: 10,
  iconUrl: null,
  readme: null,
  createdAt: now,
  updatedAt: now,
};

const mockInstallRecord = {
  id: 'install-uuid-1',
  userId: 'user-a',
  pluginId: 'plugin-uuid-1',
  isEnabled: true,
  config: {},
  createdAt: now,
  updatedAt: now,
};

const mockKvRecord = {
  id: 'kv-uuid-1',
  pluginId: 'plugin-uuid-1',
  userId: 'user-a',
  key: 'settings',
  value: { theme: 'dark' },
  createdAt: now,
  updatedAt: now,
};

/**
 * Build a chainable query-builder mock.
 * Each method returns `this` so calls like
 *   db.select().from().where().orderBy().limit().offset()
 * resolve correctly.
 */
function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;

  chain.select = vi.fn().mockReturnValue(self());
  chain.from = vi.fn().mockReturnValue(self());
  chain.where = vi.fn().mockReturnValue(self());
  chain.orderBy = vi.fn().mockReturnValue(self());
  chain.limit = vi.fn().mockReturnValue(self());
  chain.offset = vi.fn().mockReturnValue(self());
  chain.insert = vi.fn().mockReturnValue(self());
  chain.values = vi.fn().mockReturnValue(self());
  chain.returning = vi.fn().mockResolvedValue(resolvedValue);
  chain.delete = vi.fn().mockReturnValue(self());
  chain.update = vi.fn().mockReturnValue(self());
  chain.set = vi.fn().mockReturnValue(self());
  chain.innerJoin = vi.fn().mockReturnValue(self());
  chain.leftJoin = vi.fn().mockReturnValue(self());
  chain.onConflictDoUpdate = vi.fn().mockReturnValue(self());

  // Make the chain itself thenable so `await chain` resolves to resolvedValue
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

describe('PluginRepository', () => {
  let repository: PluginRepository;
  let mockDb: Record<string, unknown>;

  beforeEach(() => {
    mockDb = {};
    repository = new PluginRepository(mockDb as unknown as Database);
  });

  // =====================
  // Plugin CRUD
  // =====================

  describe('createPlugin', () => {
    it('should insert plugin and return record', async () => {
      const chain = createChainMock([mockPluginRecord]);
      mockDb.insert = chain.insert;

      const input = {
        slug: 'my-plugin',
        name: 'My Plugin',
        description: 'A test plugin',
        authorId: 'author-a',
        sourceCode: 'export default {}',
        events: ['chat.message.before', 'chat.message.after'],
        permissions: ['events:subscribe', 'kv:read'],
      };

      const result = await repository.createPlugin(input);

      expect(chain.insert).toHaveBeenCalled();
      expect(chain.values).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(mockPluginRecord);
    });
  });

  describe('findBySlug', () => {
    it('should return plugin by slug', async () => {
      const chain = createChainMock([mockPluginRecord]);
      mockDb.select = chain.select;

      const result = await repository.findBySlug('my-plugin');

      expect(result).toEqual(mockPluginRecord);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent slug', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.findBySlug('nonexistent-slug');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return plugin by id', async () => {
      const chain = createChainMock([mockPluginRecord]);
      mockDb.select = chain.select;

      const result = await repository.findById('plugin-uuid-1');

      expect(result).toEqual(mockPluginRecord);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent id', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByAuthorId', () => {
    it('should return plugins by author', async () => {
      const pluginsList = [
        { ...mockPluginRecord, id: 'p-1' },
        { ...mockPluginRecord, id: 'p-2' },
      ];
      const chain = createChainMock(pluginsList);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(pluginsList));
      mockDb.select = chain.select;

      const result = await repository.findByAuthorId('author-a');

      expect(result).toEqual(pluginsList);
      expect(result).toHaveLength(2);
      expect(chain.where).toHaveBeenCalled();
    });
  });

  describe('findPublished', () => {
    it('should return paginated published plugins sorted by popular', async () => {
      const pluginsList = [mockPluginRecord];
      const chain = createChainMock(pluginsList);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(pluginsList));
      mockDb.select = chain.select;

      const result = await repository.findPublished({ limit: 20, offset: 0, sort: 'popular' });

      expect(result).toEqual(pluginsList);
      expect(chain.where).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });

    it('should return paginated published plugins sorted by newest', async () => {
      const pluginsList = [mockPluginRecord];
      const chain = createChainMock(pluginsList);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(pluginsList));
      mockDb.select = chain.select;

      const result = await repository.findPublished({ limit: 10, offset: 5, sort: 'newest' });

      expect(result).toEqual(pluginsList);
      expect(chain.orderBy).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(chain.offset).toHaveBeenCalledWith(5);
    });

    it('should return paginated published plugins sorted by name', async () => {
      const pluginsList = [mockPluginRecord];
      const chain = createChainMock(pluginsList);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(pluginsList));
      mockDb.select = chain.select;

      const result = await repository.findPublished({ limit: 20, offset: 0, sort: 'name' });

      expect(result).toEqual(pluginsList);
      expect(chain.orderBy).toHaveBeenCalled();
    });
  });

  describe('searchPlugins', () => {
    it('should search plugins by name/description with ILIKE', async () => {
      const pluginsList = [mockPluginRecord];
      const chain = createChainMock(pluginsList);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(pluginsList));
      mockDb.select = chain.select;

      const result = await repository.searchPlugins('test', 20, 0);

      expect(result).toEqual(pluginsList);
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(20);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });

    it('should return empty array for no matches', async () => {
      const chain = createChainMock([]);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
      mockDb.select = chain.select;

      const result = await repository.searchPlugins('nonexistent', 20, 0);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('countPublished', () => {
    it('should return count of published plugins', async () => {
      const chain = createChainMock([{ count: 42 }]);
      mockDb.select = chain.select;

      const result = await repository.countPublished();

      expect(result).toBe(42);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });
  });

  describe('updatePlugin', () => {
    it('should update plugin with ownership check', async () => {
      const updatedRecord = {
        ...mockPluginRecord,
        name: 'Updated Plugin',
        updatedAt: new Date('2026-02-09T01:00:00Z'),
      };
      const chain = createChainMock([updatedRecord]);
      mockDb.update = chain.update;

      const result = await repository.updatePlugin('plugin-uuid-1', 'author-a', {
        name: 'Updated Plugin',
      } as any);

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(updatedRecord);
    });

    it('should return null when ownership check fails', async () => {
      const chain = createChainMock([]);
      mockDb.update = chain.update;

      const result = await repository.updatePlugin('plugin-uuid-1', 'wrong-author', {
        name: 'Updated Plugin',
      } as any);

      expect(result).toBeNull();
    });
  });

  describe('deletePlugin', () => {
    it('should delete plugin with ownership check and return true', async () => {
      const chain = createChainMock([{ id: 'plugin-uuid-1' }]);
      mockDb.delete = chain.delete;

      const result = await repository.deletePlugin('plugin-uuid-1', 'author-a');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when ownership check fails', async () => {
      const chain = createChainMock([]);
      mockDb.delete = chain.delete;

      const result = await repository.deletePlugin('plugin-uuid-1', 'wrong-author');

      expect(result).toBe(false);
    });
  });

  describe('incrementInstallCount', () => {
    it('should increment install_count', async () => {
      const chain = createChainMock();
      mockDb.update = chain.update;

      await repository.incrementInstallCount('plugin-uuid-1');

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });
  });

  describe('decrementInstallCount', () => {
    it('should decrement install_count with min 0', async () => {
      const chain = createChainMock();
      mockDb.update = chain.update;

      await repository.decrementInstallCount('plugin-uuid-1');

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });
  });

  // =====================
  // Install CRUD
  // =====================

  describe('createInstall', () => {
    it('should insert install and return record', async () => {
      const chain = createChainMock([mockInstallRecord]);
      mockDb.insert = chain.insert;

      const input = {
        userId: 'user-a',
        pluginId: 'plugin-uuid-1',
        config: {},
      };

      const result = await repository.createInstall(input);

      expect(chain.insert).toHaveBeenCalled();
      expect(chain.values).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(mockInstallRecord);
    });
  });

  describe('findInstallsByUserId', () => {
    it('should return installs with plugin data', async () => {
      const installsWithPlugin = [
        {
          ...mockInstallRecord,
          plugin: mockPluginRecord,
        },
      ];
      const chain = createChainMock(installsWithPlugin);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(installsWithPlugin));
      mockDb.select = chain.select;

      const result = await repository.findInstallsByUserId('user-a');

      expect(result).toEqual(installsWithPlugin);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.innerJoin).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });
  });

  describe('findInstallByUserAndPlugin', () => {
    it('should return install for user and plugin', async () => {
      const chain = createChainMock([mockInstallRecord]);
      mockDb.select = chain.select;

      const result = await repository.findInstallByUserAndPlugin('user-a', 'plugin-uuid-1');

      expect(result).toEqual(mockInstallRecord);
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null when not found', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.findInstallByUserAndPlugin('user-a', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findEnabledInstallsByEvent', () => {
    it('should filter by isEnabled and event', async () => {
      const installsWithPlugin = [
        {
          ...mockInstallRecord,
          plugin: mockPluginRecord,
        },
      ];
      const chain = createChainMock(installsWithPlugin);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(installsWithPlugin));
      mockDb.select = chain.select;

      const result = await repository.findEnabledInstallsByEvent('user-a', 'chat.message.before');

      expect(result).toEqual(installsWithPlugin);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.innerJoin).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });

    it('should return empty array when no enabled installs match', async () => {
      const chain = createChainMock([]);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
      mockDb.select = chain.select;

      const result = await repository.findEnabledInstallsByEvent('user-a', 'user.login');

      expect(result).toEqual([]);
    });
  });

  describe('updateInstall', () => {
    it('should update install with ownership check', async () => {
      const updatedInstall = {
        ...mockInstallRecord,
        isEnabled: false,
        updatedAt: new Date('2026-02-09T01:00:00Z'),
      };
      const chain = createChainMock([updatedInstall]);
      mockDb.update = chain.update;

      const result = await repository.updateInstall('install-uuid-1', 'user-a', {
        isEnabled: false,
      } as any);

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(updatedInstall);
    });

    it('should return null when ownership check fails', async () => {
      const chain = createChainMock([]);
      mockDb.update = chain.update;

      const result = await repository.updateInstall('install-uuid-1', 'wrong-user', {
        isEnabled: false,
      } as any);

      expect(result).toBeNull();
    });
  });

  describe('deleteInstall', () => {
    it('should delete install with ownership check and return true', async () => {
      const chain = createChainMock([{ id: 'install-uuid-1' }]);
      mockDb.delete = chain.delete;

      const result = await repository.deleteInstall('install-uuid-1', 'user-a');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when ownership check fails', async () => {
      const chain = createChainMock([]);
      mockDb.delete = chain.delete;

      const result = await repository.deleteInstall('install-uuid-1', 'wrong-user');

      expect(result).toBe(false);
    });
  });

  // =====================
  // KV Store
  // =====================

  describe('kvGet', () => {
    it('should return value by composite key', async () => {
      const chain = createChainMock([mockKvRecord]);
      mockDb.select = chain.select;

      const result = await repository.kvGet('plugin-uuid-1', 'user-a', 'settings');

      expect(result).toEqual({ theme: 'dark' });
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null when key not found', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.kvGet('plugin-uuid-1', 'user-a', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('kvSet', () => {
    it('should upsert value using onConflictDoUpdate', async () => {
      const chain = createChainMock();
      mockDb.insert = chain.insert;

      await repository.kvSet('plugin-uuid-1', 'user-a', 'settings', { theme: 'light' });

      expect(chain.insert).toHaveBeenCalled();
      expect(chain.values).toHaveBeenCalled();
      expect(chain.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe('kvDelete', () => {
    it('should delete by composite key and return true', async () => {
      const chain = createChainMock([{ id: 'kv-uuid-1' }]);
      mockDb.delete = chain.delete;

      const result = await repository.kvDelete('plugin-uuid-1', 'user-a', 'settings');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when key not found', async () => {
      const chain = createChainMock([]);
      mockDb.delete = chain.delete;

      const result = await repository.kvDelete('plugin-uuid-1', 'user-a', 'nonexistent');

      expect(result).toBe(false);
    });
  });
});
