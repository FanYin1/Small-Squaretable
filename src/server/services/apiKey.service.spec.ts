/**
 * ApiKeyService unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyService } from './apiKey.service';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../../core/errors';

// Mock the apiKey utility functions
vi.mock('../utils/apiKey', () => ({
  generateApiKey: vi.fn(() => 'sq_test_abcdef1234567890abcdef1234567890'),
  hashApiKey: vi.fn(() => 'hashed_key_value_64_chars_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  getKeyHint: vi.fn(() => 'sq_test_...7890'),
}));

function createMockApiKeyRepo() {
  return {
    createApiKey: vi.fn(),
    findByKeyHash: vi.fn(),
    findByUserId: vi.fn(),
    findById: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    incrementRequestCount: vi.fn(),
    countByUserId: vi.fn(),
  };
}

function createMockUserRepo() {
  return {
    findById: vi.fn(),
  };
}

type MockApiKeyRepo = ReturnType<typeof createMockApiKeyRepo>;
type MockUserRepo = ReturnType<typeof createMockUserRepo>;

// --- Helpers ---

const NOW = new Date('2026-02-09T12:00:00Z');

function fakeApiKeyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    userId: 'user-1',
    name: 'My Key',
    keyHash: 'hashed_key_value_64_chars_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    keyHint: 'sq_test_...7890',
    scopes: ['characters:read'],
    rateLimitPerMinute: 60,
    isActive: true,
    lastUsedAt: null,
    requestCount: 0,
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('ApiKeyService', () => {
  let apiKeyRepo: MockApiKeyRepo;
  let userRepo: MockUserRepo;
  let service: ApiKeyService;

  beforeEach(() => {
    apiKeyRepo = createMockApiKeyRepo();
    userRepo = createMockUserRepo();
    service = new ApiKeyService(apiKeyRepo as any, userRepo as any);
  });

  // --- Create ---
  describe('createApiKey', () => {
    it('should return ApiKeyCreatedResponse with full key', async () => {
      apiKeyRepo.countByUserId.mockResolvedValue(0);
      apiKeyRepo.createApiKey.mockResolvedValue(fakeApiKeyRecord());

      const result = await service.createApiKey('user-1', {
        name: 'My Key',
        scopes: ['characters:read'],
      });

      expect(result.key).toBe('sq_test_abcdef1234567890abcdef1234567890');
      expect(result.id).toBe('key-1');
      expect(result.name).toBe('My Key');
      expect(result.keyHint).toBe('sq_test_...7890');
      expect(result.scopes).toEqual(['characters:read']);
      expect(result.rateLimitPerMinute).toBe(60);
      expect(result.isActive).toBe(true);
      expect(result.createdAt).toBe(NOW.toISOString());
    });

    it('should store hashed key in DB, not plaintext', async () => {
      apiKeyRepo.countByUserId.mockResolvedValue(0);
      apiKeyRepo.createApiKey.mockResolvedValue(fakeApiKeyRecord());

      await service.createApiKey('user-1', {
        name: 'My Key',
        scopes: ['characters:read'],
      });

      const createArg = apiKeyRepo.createApiKey.mock.calls[0][0];
      // The stored keyHash should be the hashed value, not the raw key
      expect(createArg.keyHash).toBe('hashed_key_value_64_chars_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(createArg.keyHash).not.toBe('sq_test_abcdef1234567890abcdef1234567890');
    });

    it('should throw BadRequestError when max 10 keys reached', async () => {
      apiKeyRepo.countByUserId.mockResolvedValue(10);

      await expect(
        service.createApiKey('user-1', { name: 'Key 11', scopes: ['characters:read'] }),
      ).rejects.toThrow(BadRequestError);

      expect(apiKeyRepo.createApiKey).not.toHaveBeenCalled();
    });
  });

  // --- List ---
  describe('listApiKeys', () => {
    it('should return ApiKeyInfo[] without key field', async () => {
      const records = [fakeApiKeyRecord(), fakeApiKeyRecord({ id: 'key-2', name: 'Key 2' })];
      apiKeyRepo.findByUserId.mockResolvedValue(records);

      const result = await service.listApiKeys('user-1', 20, 0);

      expect(apiKeyRepo.findByUserId).toHaveBeenCalledWith('user-1', 20, 0);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('key-1');
      expect(result[1].id).toBe('key-2');
      // Ensure no 'key' field is present on list items
      for (const item of result) {
        expect(item).not.toHaveProperty('key');
      }
    });
  });

  // --- Get ---
  describe('getApiKey', () => {
    it('should return ApiKeyInfo for existing key', async () => {
      apiKeyRepo.findById.mockResolvedValue(fakeApiKeyRecord());

      const result = await service.getApiKey('key-1', 'user-1');

      expect(apiKeyRepo.findById).toHaveBeenCalledWith('key-1', 'user-1');
      expect(result.id).toBe('key-1');
      expect(result.name).toBe('My Key');
      expect(result).not.toHaveProperty('key');
      expect(result).not.toHaveProperty('keyHash');
    });

    it('should throw NotFoundError for non-existent key', async () => {
      apiKeyRepo.findById.mockResolvedValue(null);

      await expect(service.getApiKey('key-999', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  // --- Update ---
  describe('updateApiKey', () => {
    it('should return updated ApiKeyInfo', async () => {
      const updated = fakeApiKeyRecord({ name: 'Renamed Key' });
      apiKeyRepo.updateApiKey.mockResolvedValue(updated);

      const result = await service.updateApiKey('key-1', 'user-1', { name: 'Renamed Key' });

      expect(apiKeyRepo.updateApiKey).toHaveBeenCalledWith('key-1', 'user-1', { name: 'Renamed Key' });
      expect(result.name).toBe('Renamed Key');
      expect(result.id).toBe('key-1');
    });

    it('should throw NotFoundError for non-existent key', async () => {
      apiKeyRepo.updateApiKey.mockResolvedValue(null);

      await expect(
        service.updateApiKey('key-999', 'user-1', { name: 'Nope' }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // --- Delete ---
  describe('deleteApiKey', () => {
    it('should return void on successful delete', async () => {
      apiKeyRepo.deleteApiKey.mockResolvedValue(true);

      await expect(service.deleteApiKey('key-1', 'user-1')).resolves.toBeUndefined();
      expect(apiKeyRepo.deleteApiKey).toHaveBeenCalledWith('key-1', 'user-1');
    });

    it('should throw NotFoundError for non-existent key', async () => {
      apiKeyRepo.deleteApiKey.mockResolvedValue(false);

      await expect(service.deleteApiKey('key-999', 'user-1')).rejects.toThrow(NotFoundError);
    });
  });

  // --- Validate ---
  describe('validateApiKey', () => {
    it('should return userId, tenantId, scopes for valid active key', async () => {
      apiKeyRepo.findByKeyHash.mockResolvedValue(fakeApiKeyRecord());
      apiKeyRepo.incrementRequestCount.mockResolvedValue(undefined);
      userRepo.findById.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        isActive: true,
      });

      const result = await service.validateApiKey('sq_test_abcdef1234567890abcdef1234567890');

      expect(result.userId).toBe('user-1');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.scopes).toEqual(['characters:read']);
      expect(apiKeyRepo.incrementRequestCount).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError for invalid/inactive/expired key', async () => {
      // Case 1: key not found
      apiKeyRepo.findByKeyHash.mockResolvedValue(null);
      await expect(service.validateApiKey('sq_test_invalid')).rejects.toThrow(UnauthorizedError);

      // Case 2: key is inactive
      apiKeyRepo.findByKeyHash.mockResolvedValue(fakeApiKeyRecord({ isActive: false }));
      await expect(service.validateApiKey('sq_test_inactive')).rejects.toThrow(UnauthorizedError);

      // Case 3: key is expired
      apiKeyRepo.findByKeyHash.mockResolvedValue(
        fakeApiKeyRecord({ expiresAt: new Date('2020-01-01T00:00:00Z') }),
      );
      userRepo.findById.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1', isActive: true });
      await expect(service.validateApiKey('sq_test_expired')).rejects.toThrow(UnauthorizedError);
    });
  });


});
