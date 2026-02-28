/**
 * API Key Auth Middleware unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from './error-handler';
import { UnauthorizedError, ForbiddenError } from '../../core/errors';

// Mock the apiKey service
vi.mock('../services/apiKey.service', () => ({
  apiKeyService: {
    validateApiKey: vi.fn(),
  },
}));

// Mock the user repository
vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
  },
}));

// --- Helpers ---

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    isActive: true,
    ...overrides,
  };
}

describe('API Key Auth Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('apiKeyAuthMiddleware', () => {
    it('should authenticate via X-API-Key header and set user and tenantId in context', async () => {
      const { apiKeyAuthMiddleware } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(apiKeyService.validateApiKey).mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        scopes: ['characters:read'],
      });
      vi.mocked(userRepository.findById).mockResolvedValue(fakeUser() as any);

      app.use('/*', apiKeyAuthMiddleware());
      app.get('/test', (c) =>
        c.json({
          userId: c.get('user')?.id,
          tenantId: c.get('tenantId'),
        }),
      );

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'sq_test_testkey123' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userId).toBe('user-1');
      expect(data.tenantId).toBe('tenant-1');
      expect(apiKeyService.validateApiKey).toHaveBeenCalledWith('sq_test_testkey123');
    });

    it('should authenticate via Authorization: Bearer sq_test_... header', async () => {
      const { apiKeyAuthMiddleware } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(apiKeyService.validateApiKey).mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        scopes: ['characters:read', 'characters:write'],
      });
      vi.mocked(userRepository.findById).mockResolvedValue(fakeUser() as any);

      app.use('/*', apiKeyAuthMiddleware());
      app.get('/test', (c) =>
        c.json({
          userId: c.get('user')?.id,
          tenantId: c.get('tenantId'),
        }),
      );

      const res = await app.request('/test', {
        headers: { Authorization: 'Bearer sq_test_myapikey456' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.userId).toBe('user-1');
      expect(data.tenantId).toBe('tenant-1');
      expect(apiKeyService.validateApiKey).toHaveBeenCalledWith('sq_test_myapikey456');
    });

    it('should set apiKeyScopes and authMethod=apiKey in context', async () => {
      const { apiKeyAuthMiddleware } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(apiKeyService.validateApiKey).mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        scopes: ['characters:read', 'chats:write'],
      });
      vi.mocked(userRepository.findById).mockResolvedValue(fakeUser() as any);

      app.use('/*', apiKeyAuthMiddleware());
      app.get('/test', (c) =>
        c.json({
          scopes: c.get('apiKeyScopes'),
          authMethod: c.get('authMethod'),
        }),
      );

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'sq_test_testkey123' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scopes).toEqual(['characters:read', 'chats:write']);
      expect(data.authMethod).toBe('apiKey');
    });

    it('should return 401 for invalid API key', async () => {
      const { apiKeyAuthMiddleware } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');

      vi.mocked(apiKeyService.validateApiKey).mockRejectedValue(
        new UnauthorizedError('Invalid or inactive API key'),
      );

      app.use('/*', apiKeyAuthMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'sq_test_invalid' },
      });

      expect(res.status).toBe(401);
    });

    it('should fall through (call next without setting user) when no API key header present', async () => {
      const { apiKeyAuthMiddleware } = await import('./apiKeyAuth');

      app.use('/*', apiKeyAuthMiddleware());
      app.get('/test', (c) => {
        const user = c.get('user');
        const authMethod = c.get('authMethod');
        return c.json({ hasUser: !!user, authMethod: authMethod ?? null });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.hasUser).toBe(false);
      expect(data.authMethod).toBeNull();
    });

    it('should return 401 for expired API key', async () => {
      const { apiKeyAuthMiddleware } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');

      vi.mocked(apiKeyService.validateApiKey).mockRejectedValue(
        new UnauthorizedError('API key has expired'),
      );

      app.use('/*', apiKeyAuthMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'sq_test_expired' },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.message).toContain('expired');
    });

    it('should return 401 for inactive API key', async () => {
      const { apiKeyAuthMiddleware } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');

      vi.mocked(apiKeyService.validateApiKey).mockRejectedValue(
        new UnauthorizedError('Invalid or inactive API key'),
      );

      app.use('/*', apiKeyAuthMiddleware());
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'sq_test_inactive' },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.message).toContain('inactive');
    });

  });

  describe('requireScopes', () => {
    it('should pass when required scope is present', async () => {
      const { apiKeyAuthMiddleware, requireScopes } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(apiKeyService.validateApiKey).mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        scopes: ['characters:read', 'characters:write'],
      });
      vi.mocked(userRepository.findById).mockResolvedValue(fakeUser() as any);

      app.use('/*', apiKeyAuthMiddleware());
      app.use('/*', requireScopes('characters:read'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'sq_test_testkey123' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('should return 403 when required scope is missing', async () => {
      const { apiKeyAuthMiddleware, requireScopes } = await import('./apiKeyAuth');
      const { apiKeyService } = await import('../services/apiKey.service');
      const { userRepository } = await import('../../db/repositories/user.repository');

      vi.mocked(apiKeyService.validateApiKey).mockResolvedValue({
        userId: 'user-1',
        tenantId: 'tenant-1',
        scopes: ['characters:read'],
      });
      vi.mocked(userRepository.findById).mockResolvedValue(fakeUser() as any);

      app.use('/*', apiKeyAuthMiddleware());
      app.use('/*', requireScopes('characters:write'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'X-API-Key': 'sq_test_testkey123' },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.message).toContain('characters:write');
    });

    it('should pass for JWT auth (authMethod !== apiKey)', async () => {
      const { requireScopes } = await import('./apiKeyAuth');

      // No apiKeyAuthMiddleware — simulates JWT auth where authMethod is not set
      app.use('/*', requireScopes('characters:write'));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });
});
