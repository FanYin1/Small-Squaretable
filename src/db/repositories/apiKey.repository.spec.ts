/**
 * ApiKeyRepository Unit Tests
 *
 * Uses mocked database since no real DB connection is available.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Database } from '../index';
import { ApiKeyRepository } from './apiKey.repository';

// -- Helpers --

const now = new Date('2026-02-09T00:00:00Z');

const mockApiKeyRecord = {
  id: 'key-uuid-1',
  userId: 'user-a',
  name: 'My API Key',
  keyHash: 'abc123hash',
  keyHint: 'sk-...xyz',
  scopes: ['chat:read', 'chat:write'],
  rateLimitPerMinute: 60,
  isActive: true,
  lastUsedAt: null,
  requestCount: 0,
  expiresAt: null,
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

  // Make the chain itself thenable so `await chain` resolves to resolvedValue
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

describe('ApiKeyRepository', () => {
  let repository: ApiKeyRepository;
  let mockDb: Record<string, unknown>;

  beforeEach(() => {
    mockDb = {};
    repository = new ApiKeyRepository(mockDb as unknown as Database);
  });

  // -- createApiKey() --

  describe('createApiKey', () => {
    it('should insert key and return record', async () => {
      const chain = createChainMock([mockApiKeyRecord]);
      mockDb.insert = chain.insert;

      const input = {
        userId: 'user-a',
        name: 'My API Key',
        keyHash: 'abc123hash',
        keyHint: 'sk-...xyz',
        scopes: ['chat:read', 'chat:write'],
      };

      const result = await repository.createApiKey(input);

      expect(chain.insert).toHaveBeenCalled();
      expect(chain.values).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(mockApiKeyRecord);
    });
  });

  // -- findByKeyHash() --

  describe('findByKeyHash', () => {
    it('should return key by hash', async () => {
      const chain = createChainMock([mockApiKeyRecord]);
      mockDb.select = chain.select;

      const result = await repository.findByKeyHash('abc123hash');

      expect(result).toEqual(mockApiKeyRecord);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent hash', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.findByKeyHash('nonexistent-hash');

      expect(result).toBeNull();
    });
  });

  // -- findByUserId() --

  describe('findByUserId', () => {
    it('should return paginated list for user', async () => {
      const keys = [
        { ...mockApiKeyRecord, id: 'key-1' },
        { ...mockApiKeyRecord, id: 'key-2' },
      ];
      const chain = createChainMock(keys);
      // Make the chain thenable so `await` resolves to the keys array
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(keys));
      mockDb.select = chain.select;

      const result = await repository.findByUserId('user-a', 10, 0);

      expect(result).toEqual(keys);
      expect(result).toHaveLength(2);
      expect(chain.where).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });

    it('should exclude other users keys', async () => {
      const chain = createChainMock([]);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
      mockDb.select = chain.select;

      const result = await repository.findByUserId('user-b', 10, 0);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  // -- findById() --

  describe('findById', () => {
    it('should return key by id and userId', async () => {
      const chain = createChainMock([mockApiKeyRecord]);
      mockDb.select = chain.select;

      const result = await repository.findById('key-uuid-1', 'user-a');

      expect(result).toEqual(mockApiKeyRecord);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent id', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.findById('nonexistent-id', 'user-a');

      expect(result).toBeNull();
    });
  });

  // -- updateApiKey() --

  describe('updateApiKey', () => {
    it('should update name, scopes, isActive', async () => {
      const updatedRecord = {
        ...mockApiKeyRecord,
        name: 'Updated Key',
        scopes: ['chat:read'],
        isActive: false,
        updatedAt: new Date('2026-02-09T01:00:00Z'),
      };
      const chain = createChainMock([updatedRecord]);
      mockDb.update = chain.update;

      const result = await repository.updateApiKey('key-uuid-1', 'user-a', {
        name: 'Updated Key',
        scopes: ['chat:read'],
        isActive: false,
      });

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(updatedRecord);
    });

    it('should return null for non-existent id', async () => {
      const chain = createChainMock([]);
      mockDb.update = chain.update;

      const result = await repository.updateApiKey('nonexistent-id', 'user-a', {
        name: 'Updated Key',
      });

      expect(result).toBeNull();
    });
  });

  // -- deleteApiKey() --

  describe('deleteApiKey', () => {
    it('should delete key and return true', async () => {
      const chain = createChainMock([{ id: 'key-uuid-1' }]);
      mockDb.delete = chain.delete;

      const result = await repository.deleteApiKey('key-uuid-1', 'user-a');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false for non-existent id', async () => {
      const chain = createChainMock([]);
      mockDb.delete = chain.delete;

      const result = await repository.deleteApiKey('nonexistent-id', 'user-a');

      expect(result).toBe(false);
    });
  });

  // -- incrementRequestCount() --

  describe('incrementRequestCount', () => {
    it('should increment count and update lastUsedAt', async () => {
      const chain = createChainMock();
      mockDb.update = chain.update;

      await repository.incrementRequestCount('abc123hash');

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });
  });

  // -- countByUserId() --

  describe('countByUserId', () => {
    it('should return total key count for user', async () => {
      const chain = createChainMock([{ count: 5 }]);
      mockDb.select = chain.select;

      const result = await repository.countByUserId('user-a');

      expect(result).toBe(5);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });
  });
});
