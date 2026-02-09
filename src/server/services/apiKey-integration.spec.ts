/**
 * API Key Integration Tests
 *
 * Tests the full API key lifecycle through the service layer using mocked
 * repositories, verifying create/list/get/update/delete flows, key validation,
 * per-user limits, and scope-checking middleware behavior end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyService } from './apiKey.service';
import { NotFoundError, UnauthorizedError, BadRequestError, ForbiddenError } from '../../core/errors';

// Mock the apiKey utility functions so we get deterministic keys
vi.mock('../utils/apiKey', () => {
  let callCount = 0;
  return {
    generateApiKey: vi.fn(() => {
      callCount++;
      return `sk_live_integration_test_key_${String(callCount).padStart(16, '0')}`;
    }),
    hashApiKey: vi.fn((key: string) => `hash_of_${key}`),
    getKeyHint: vi.fn((key: string) => `sk_live_...${key.slice(-4)}`),
  };
});

// --- Mock repository factories ---

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

let idCounter = 0;

function fakeApiKeyRecord(overrides: Record<string, unknown> = {}) {
  idCounter++;
  return {
    id: `key-${idCounter}`,
    userId: 'user-1',
    name: 'Test Key',
    keyHash: `hash_of_sk_live_integration_test_key_${String(idCounter).padStart(16, '0')}`,
    keyHint: `sk_live_...${String(idCounter).padStart(4, '0')}`,
    scopes: ['characters:read', 'chats:read'],
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

const ACTIVE_USER = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  isActive: true,
};

describe('API Key Integration', () => {
  let apiKeyRepo: MockApiKeyRepo;
  let userRepo: MockUserRepo;
  let service: ApiKeyService;

  beforeEach(() => {
    idCounter = 0;
    apiKeyRepo = createMockApiKeyRepo();
    userRepo = createMockUserRepo();
    service = new ApiKeyService(apiKeyRepo as any, userRepo as any);
  });

  // ---------------------------------------------------------------
  // 1. Full lifecycle: create -> list -> get -> update -> delete
  // ---------------------------------------------------------------
  describe('Full lifecycle', () => {
    it('create -> list -> get -> update -> delete', async () => {
      // Step 1: Create key
      const record = fakeApiKeyRecord({ id: 'key-lifecycle' });
      apiKeyRepo.countByUserId.mockResolvedValue(0);
      apiKeyRepo.createApiKey.mockResolvedValue(record);

      const created = await service.createApiKey('user-1', {
        name: 'Test Key',
        scopes: ['characters:read', 'chats:read'],
      });

      expect(created.key).toMatch(/^sk_live_/);
      expect(created.id).toBe('key-lifecycle');
      expect(created.name).toBe('Test Key');
      expect(created.scopes).toEqual(['characters:read', 'chats:read']);
      expect(created.isActive).toBe(true);

      // Step 2: List keys -- should include created key (without raw key)
      apiKeyRepo.findByUserId.mockResolvedValue([record]);

      const list = await service.listApiKeys('user-1', 20, 0);

      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('key-lifecycle');
      expect(list[0]).not.toHaveProperty('key');
      expect(list[0]).not.toHaveProperty('keyHash');

      // Step 3: Get key by id
      apiKeyRepo.findById.mockResolvedValue(record);

      const fetched = await service.getApiKey('key-lifecycle', 'user-1');

      expect(fetched.id).toBe('key-lifecycle');
      expect(fetched.name).toBe('Test Key');
      expect(fetched).not.toHaveProperty('key');

      // Step 4: Update key name and scopes
      const updatedRecord = {
        ...record,
        name: 'Renamed Key',
        scopes: ['characters:read', 'characters:write'],
        updatedAt: new Date('2026-02-09T13:00:00Z'),
      };
      apiKeyRepo.updateApiKey.mockResolvedValue(updatedRecord);

      const updated = await service.updateApiKey('key-lifecycle', 'user-1', {
        name: 'Renamed Key',
        scopes: ['characters:read', 'characters:write'],
      });

      expect(updated.name).toBe('Renamed Key');
      expect(updated.scopes).toEqual(['characters:read', 'characters:write']);
      expect(apiKeyRepo.updateApiKey).toHaveBeenCalledWith('key-lifecycle', 'user-1', {
        name: 'Renamed Key',
        scopes: ['characters:read', 'characters:write'],
      });

      // Step 5: Delete key
      apiKeyRepo.deleteApiKey.mockResolvedValue(true);

      await expect(service.deleteApiKey('key-lifecycle', 'user-1')).resolves.toBeUndefined();
      expect(apiKeyRepo.deleteApiKey).toHaveBeenCalledWith('key-lifecycle', 'user-1');

      // Step 6: Get key after deletion -- should throw NotFoundError
      apiKeyRepo.findById.mockResolvedValue(null);

      await expect(service.getApiKey('key-lifecycle', 'user-1')).rejects.toThrow(NotFoundError);
      await expect(service.getApiKey('key-lifecycle', 'user-1')).rejects.toThrow('API key not found');
    });
  });

  // ---------------------------------------------------------------
  // 2. Validation
  // ---------------------------------------------------------------
  describe('Validation', () => {
    it('validates active key and returns userId, tenantId, scopes', async () => {
      const record = fakeApiKeyRecord({
        id: 'key-valid',
        scopes: ['characters:read', 'chats:write'],
      });
      apiKeyRepo.findByKeyHash.mockResolvedValue(record);
      apiKeyRepo.incrementRequestCount.mockResolvedValue(undefined);
      userRepo.findById.mockResolvedValue(ACTIVE_USER);

      const rawKey = 'sk_live_integration_test_key_0000000000000001';
      const result = await service.validateApiKey(rawKey);

      expect(result.userId).toBe('user-1');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.scopes).toEqual(['characters:read', 'chats:write']);
      expect(apiKeyRepo.incrementRequestCount).toHaveBeenCalled();
    });

    it('rejects expired key', async () => {
      const expiredRecord = fakeApiKeyRecord({
        id: 'key-expired',
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      });
      apiKeyRepo.findByKeyHash.mockResolvedValue(expiredRecord);
      userRepo.findById.mockResolvedValue(ACTIVE_USER);

      await expect(service.validateApiKey('sk_live_expired_key')).rejects.toThrow(UnauthorizedError);
      await expect(service.validateApiKey('sk_live_expired_key')).rejects.toThrow('API key has expired');
    });

    it('rejects inactive key', async () => {
      const inactiveRecord = fakeApiKeyRecord({
        id: 'key-inactive',
        isActive: false,
      });
      apiKeyRepo.findByKeyHash.mockResolvedValue(inactiveRecord);

      await expect(service.validateApiKey('sk_live_inactive_key')).rejects.toThrow(UnauthorizedError);
      await expect(service.validateApiKey('sk_live_inactive_key')).rejects.toThrow(
        'Invalid or inactive API key',
      );
    });

    it('rejects invalid key (not in DB)', async () => {
      apiKeyRepo.findByKeyHash.mockResolvedValue(null);

      await expect(service.validateApiKey('sk_live_nonexistent')).rejects.toThrow(UnauthorizedError);
      await expect(service.validateApiKey('sk_live_nonexistent')).rejects.toThrow(
        'Invalid or inactive API key',
      );
    });
  });

  // ---------------------------------------------------------------
  // 3. Limits
  // ---------------------------------------------------------------
  describe('Limits', () => {
    it('enforces max 10 keys per user', async () => {
      // User already has 10 keys
      apiKeyRepo.countByUserId.mockResolvedValue(10);

      await expect(
        service.createApiKey('user-1', {
          name: 'Key 11',
          scopes: ['characters:read'],
        }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.createApiKey('user-1', {
          name: 'Key 11',
          scopes: ['characters:read'],
        }),
      ).rejects.toThrow('Maximum 10 API keys per user');

      // createApiKey on the repo should never have been called
      expect(apiKeyRepo.createApiKey).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 4. Scope checking (requireScopes middleware)
  // ---------------------------------------------------------------
  describe('Scope checking', () => {
    // Helper: create a minimal Hono-like context mock
    function createMockContext(overrides: Record<string, unknown> = {}) {
      const store: Record<string, unknown> = { ...overrides };
      return {
        get: vi.fn((key: string) => store[key]),
        set: vi.fn((key: string, value: unknown) => {
          store[key] = value;
        }),
        req: { header: vi.fn() },
      };
    }

    it('requireScopes passes when scope present', async () => {
      // Import the middleware
      const { requireScopes } = await import('../middleware/apiKeyAuth');

      const ctx = createMockContext({
        authMethod: 'apiKey',
        apiKeyScopes: ['characters:read', 'chats:write'],
      });

      const middleware = requireScopes('characters:read');
      const next = vi.fn().mockResolvedValue(undefined);

      // Should not throw -- next() should be called
      await middleware(ctx as any, next);
      expect(next).toHaveBeenCalled();
    });

    it('requireScopes blocks when scope missing', async () => {
      const { requireScopes } = await import('../middleware/apiKeyAuth');

      const ctx = createMockContext({
        authMethod: 'apiKey',
        apiKeyScopes: ['characters:read'],
      });

      const middleware = requireScopes('chats:write');
      const next = vi.fn().mockResolvedValue(undefined);

      await expect(middleware(ctx as any, next)).rejects.toThrow(ForbiddenError);
      await expect(middleware(ctx as any, next)).rejects.toThrow('Missing required scopes: chats:write');
      expect(next).not.toHaveBeenCalled();
    });

    it('requireScopes passes for JWT auth (all scopes implicitly granted)', async () => {
      const { requireScopes } = await import('../middleware/apiKeyAuth');

      const ctx = createMockContext({
        authMethod: 'jwt',
        // No apiKeyScopes set -- JWT users get full access
      });

      const middleware = requireScopes('characters:read', 'chats:write', 'webhooks:manage');
      const next = vi.fn().mockResolvedValue(undefined);

      // Should pass through without checking scopes
      await middleware(ctx as any, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
