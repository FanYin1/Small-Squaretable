import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock apiKey service
vi.mock('../services/apiKey.service', () => ({
  apiKeyService: {
    createApiKey: vi.fn(),
    listApiKeys: vi.fn(),
    getApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
  },
}));

import { developerRoutes } from './developer';
import { apiKeyService } from '../services/apiKey.service';
import { API_KEY_SCOPES } from '../../types/apiKey';

describe('Developer Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/developer', developerRoutes);
    vi.clearAllMocks();
  });

  // ── POST /api-keys ──

  describe('POST /developer/api-keys', () => {
    const validInput = {
      name: 'My API Key',
      scopes: ['characters:read', 'chats:read'],
      rateLimitPerMinute: 100,
    };

    it('should create an API key and return 201', async () => {
      const mockResult = { id: 'key-1', name: 'My API Key', key: 'sq_test_abc123' };
      vi.mocked(apiKeyService.createApiKey).mockResolvedValue(mockResult as any);

      const res = await app.request('/developer/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validInput),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockResult);
      expect(body.meta.timestamp).toBeDefined();
      expect(apiKeyService.createApiKey).toHaveBeenCalledWith('user-123', {
        ...validInput,
      });
    });

    it('should apply default rateLimitPerMinute when omitted', async () => {
      vi.mocked(apiKeyService.createApiKey).mockResolvedValue({ id: 'key-2' } as any);

      const res = await app.request('/developer/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Key', scopes: ['profile:read'] }),
      });

      expect(res.status).toBe(201);
      expect(apiKeyService.createApiKey).toHaveBeenCalledWith('user-123', expect.objectContaining({
        rateLimitPerMinute: 60,
      }));
    });

    it('should return 400 when name is missing', async () => {
      const res = await app.request('/developer/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: ['characters:read'] }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when scopes is empty', async () => {
      const res = await app.request('/developer/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Key', scopes: [] }),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when scopes contains invalid value', async () => {
      const res = await app.request('/developer/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Key', scopes: ['invalid:scope'] }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api-keys ──

  describe('GET /developer/api-keys', () => {
    it('should list API keys and return 200', async () => {
      const mockKeys = [
        { id: 'key-1', name: 'Key 1' },
        { id: 'key-2', name: 'Key 2' },
      ];
      vi.mocked(apiKeyService.listApiKeys).mockResolvedValue(mockKeys as any);

      const res = await app.request('/developer/api-keys');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockKeys);
      expect(apiKeyService.listApiKeys).toHaveBeenCalledWith('user-123', 20, 0);
    });

    it('should pass custom limit and offset', async () => {
      vi.mocked(apiKeyService.listApiKeys).mockResolvedValue([] as any);

      const res = await app.request('/developer/api-keys?limit=5&offset=10');

      expect(res.status).toBe(200);
      expect(apiKeyService.listApiKeys).toHaveBeenCalledWith('user-123', 5, 10);
    });
  });

  // ── GET /api-keys/:id ──

  describe('GET /developer/api-keys/:id', () => {
    it('should return a single API key with 200', async () => {
      const mockKey = { id: 'key-1', name: 'My Key', scopes: ['characters:read'] };
      vi.mocked(apiKeyService.getApiKey).mockResolvedValue(mockKey as any);

      const res = await app.request('/developer/api-keys/key-1');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockKey);
      expect(apiKeyService.getApiKey).toHaveBeenCalledWith('key-1', 'user-123');
    });
  });

  // ── PATCH /api-keys/:id ──

  describe('PATCH /developer/api-keys/:id', () => {
    it('should update an API key and return 200', async () => {
      const mockUpdated = { id: 'key-1', name: 'Updated Key' };
      vi.mocked(apiKeyService.updateApiKey).mockResolvedValue(mockUpdated as any);

      const res = await app.request('/developer/api-keys/key-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Key' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockUpdated);
      expect(apiKeyService.updateApiKey).toHaveBeenCalledWith('key-1', 'user-123', { name: 'Updated Key' });
    });

    it('should accept isActive update', async () => {
      vi.mocked(apiKeyService.updateApiKey).mockResolvedValue({ id: 'key-1', isActive: false } as any);

      const res = await app.request('/developer/api-keys/key-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });

      expect(res.status).toBe(200);
      expect(apiKeyService.updateApiKey).toHaveBeenCalledWith('key-1', 'user-123', { isActive: false });
    });
  });

  // ── DELETE /api-keys/:id ──

  describe('DELETE /developer/api-keys/:id', () => {
    it('should delete an API key and return 200 with deleted:true', async () => {
      vi.mocked(apiKeyService.deleteApiKey).mockResolvedValue(undefined as any);

      const res = await app.request('/developer/api-keys/key-1', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ deleted: true });
      expect(apiKeyService.deleteApiKey).toHaveBeenCalledWith('key-1', 'user-123');
    });
  });

  // ── GET /scopes ──

  describe('GET /developer/scopes', () => {
    it('should return available scopes with 200', async () => {
      const res = await app.request('/developer/scopes');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(API_KEY_SCOPES);
      expect(body.data).toContain('characters:read');
      expect(body.data).toContain('characters:write');
      expect(body.data).toContain('chats:read');
      expect(body.data).toContain('chats:write');
      expect(body.data).toContain('webhooks:manage');
      expect(body.data).toContain('social:read');
      expect(body.data).toContain('social:write');
      expect(body.data).toContain('profile:read');
      expect(body.data).toHaveLength(8);
    });
  });
});
