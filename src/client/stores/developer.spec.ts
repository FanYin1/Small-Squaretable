import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDeveloperStore } from './developer';
import { developerApi } from '@client/services/developer.api';
import type { ApiKeyInfo, ApiKeyCreatedResponse } from '@/types/apiKey';

vi.mock('@client/services/developer.api', () => ({
  developerApi: {
    listApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    getScopes: vi.fn(),
  },
}));

vi.mock('@client/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

const makeKey = (overrides: Partial<ApiKeyInfo> = {}): ApiKeyInfo => ({
  id: 'key-1',
  name: 'Test Key',
  keyHint: 'sk_...abc',
  scopes: ['characters:read'],
  rateLimitPerMinute: 60,
  isActive: true,
  lastUsedAt: null,
  requestCount: 0,
  expiresAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('Developer Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  // 1. Initial state
  it('should have correct initial state', () => {
    const store = useDeveloperStore();
    expect(store.apiKeys).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.availableScopes).toEqual([]);
  });

  // 2. activeKeyCount getter
  it('should compute activeKeyCount from active keys only', () => {
    const store = useDeveloperStore();
    store.apiKeys = [
      makeKey({ id: '1', isActive: true }),
      makeKey({ id: '2', isActive: false }),
      makeKey({ id: '3', isActive: true }),
    ];
    expect(store.activeKeyCount).toBe(2);
  });

  // 3. fetchApiKeys — success
  it('should fetch API keys and set loading states', async () => {
    const keys = [makeKey({ id: '1' }), makeKey({ id: '2' })];
    vi.mocked(developerApi.listApiKeys).mockResolvedValue(keys);

    const store = useDeveloperStore();
    const promise = store.fetchApiKeys();

    expect(store.loading).toBe(true);
    await promise;

    expect(store.loading).toBe(false);
    expect(store.apiKeys).toEqual(keys);
    expect(developerApi.listApiKeys).toHaveBeenCalledWith(50, 0);
  });

  // 4. fetchApiKeys — error
  it('should handle fetchApiKeys error and reset loading', async () => {
    vi.mocked(developerApi.listApiKeys).mockRejectedValue(new Error('Network error'));

    const store = useDeveloperStore();
    await store.fetchApiKeys();

    expect(store.loading).toBe(false);
    expect(store.apiKeys).toEqual([]);
  });

  // 5. createApiKey — success
  it('should create API key, unshift to array, and return result', async () => {
    const existing = makeKey({ id: 'old' });
    const created: ApiKeyCreatedResponse = { ...makeKey({ id: 'new' }), key: 'sk_full_key' };
    vi.mocked(developerApi.createApiKey).mockResolvedValue(created);

    const store = useDeveloperStore();
    store.apiKeys = [existing];

    const result = await store.createApiKey({ name: 'New Key', scopes: ['characters:read'] });

    expect(result).toEqual(created);
    expect(store.apiKeys).toHaveLength(2);
    expect(store.apiKeys[0].id).toBe('new');
    expect(store.apiKeys[1].id).toBe('old');
  });

  // 6. createApiKey — error
  it('should return null on createApiKey error', async () => {
    vi.mocked(developerApi.createApiKey).mockRejectedValue(new Error('Forbidden'));

    const store = useDeveloperStore();
    const result = await store.createApiKey({ name: 'Key', scopes: ['characters:read'] });

    expect(result).toBeNull();
  });

  // 7. updateApiKey — success
  it('should update API key in-place and return true', async () => {
    const original = makeKey({ id: 'key-1', name: 'Old Name' });
    const updated = makeKey({ id: 'key-1', name: 'New Name' });
    vi.mocked(developerApi.updateApiKey).mockResolvedValue(updated);

    const store = useDeveloperStore();
    store.apiKeys = [original];

    const result = await store.updateApiKey('key-1', { name: 'New Name' });

    expect(result).toBe(true);
    expect(store.apiKeys[0].name).toBe('New Name');
    expect(developerApi.updateApiKey).toHaveBeenCalledWith('key-1', { name: 'New Name' });
  });

  // 8. updateApiKey — error
  it('should return false on updateApiKey error', async () => {
    vi.mocked(developerApi.updateApiKey).mockRejectedValue(new Error('Not found'));

    const store = useDeveloperStore();
    store.apiKeys = [makeKey({ id: 'key-1' })];

    const result = await store.updateApiKey('key-1', { name: 'X' });

    expect(result).toBe(false);
    expect(store.apiKeys[0].name).toBe('Test Key');
  });

  // 9. deleteApiKey — success
  it('should delete API key from array and return true', async () => {
    vi.mocked(developerApi.deleteApiKey).mockResolvedValue(undefined as never);

    const store = useDeveloperStore();
    store.apiKeys = [makeKey({ id: 'a' }), makeKey({ id: 'b' })];

    const result = await store.deleteApiKey('a');

    expect(result).toBe(true);
    expect(store.apiKeys).toHaveLength(1);
    expect(store.apiKeys[0].id).toBe('b');
  });

  // 10. deleteApiKey — error
  it('should return false on deleteApiKey error', async () => {
    vi.mocked(developerApi.deleteApiKey).mockRejectedValue(new Error('Server error'));

    const store = useDeveloperStore();
    store.apiKeys = [makeKey({ id: 'a' })];

    const result = await store.deleteApiKey('a');

    expect(result).toBe(false);
    expect(store.apiKeys).toHaveLength(1);
  });

  // 11. fetchScopes — success
  it('should fetch and set available scopes', async () => {
    const scopes = ['characters:read', 'characters:write', 'chats:read'];
    vi.mocked(developerApi.getScopes).mockResolvedValue(scopes);

    const store = useDeveloperStore();
    await store.fetchScopes();

    expect(store.availableScopes).toEqual(scopes);
  });

  // 12. fetchScopes — error
  it('should handle fetchScopes error gracefully', async () => {
    vi.mocked(developerApi.getScopes).mockRejectedValue(new Error('Timeout'));

    const store = useDeveloperStore();
    await store.fetchScopes();

    expect(store.availableScopes).toEqual([]);
  });
});
