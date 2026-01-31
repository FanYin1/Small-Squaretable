import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '@/server/index';

describe('Server Integration Tests', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await app.request('/health');
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('ok');
      expect(json.version).toBe('0.1.0');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('GET /api/v1', () => {
    it('should require tenant ID header', async () => {
      const res = await app.request('/api/v1');
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Missing tenant ID');
    });

    it('should return API info with valid tenant ID', async () => {
      const res = await app.request('/api/v1', {
        headers: { 'X-Tenant-ID': 'test-tenant-123' },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.message).toBe('Small Squaretable API v1');
      expect(json.tenantId).toBe('test-tenant-123');
      expect(json.endpoints).toBeDefined();
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await app.request('/unknown-route', {
        headers: { 'X-Tenant-ID': 'test-tenant' },
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe('Not Found');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const res = await app.request('/health', {
        method: 'OPTIONS',
      });

      expect(res.headers.get('access-control-allow-origin')).toBeDefined();
    });
  });
});
