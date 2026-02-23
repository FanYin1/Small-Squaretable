import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// vi.hoisted runs before vi.mock hoisting, so the reference is available
const { mockChildLogger } = vi.hoisted(() => ({
  mockChildLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

vi.mock('../services/logger.service', () => ({
  logger: { child: vi.fn(() => mockChildLogger), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { vitalsRoutes } from './vitals';

describe('Vitals Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/api/v1/analytics/vitals', vitalsRoutes);
  });

  describe('POST /api/v1/analytics/vitals', () => {
    it('should return 202 with valid vitals payload', async () => {
      const payload = {
        name: 'LCP',
        value: 1234.56,
        rating: 'good',
        timestamp: Date.now(),
        url: 'https://example.com/chat',
      };

      const res = await app.request('/api/v1/analytics/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should return 400 when name is missing', async () => {
      const payload = { value: 100 };

      const res = await app.request('/api/v1/analytics/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Missing name or value');
    });

    it('should return 202 with malformed body (graceful degradation)', async () => {
      const res = await app.request('/api/v1/analytics/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should log the vital metric via child logger', async () => {
      const payload = {
        name: 'CLS',
        value: 0.05,
        rating: 'good',
        timestamp: 1700000000000,
        url: 'https://example.com/',
      };

      await app.request('/api/v1/analytics/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(mockChildLogger.info).toHaveBeenCalledWith('Web vital recorded', {
        vital: { name: 'CLS', value: 0.05, rating: 'good', url: 'https://example.com/' },
        clientTimestamp: 1700000000000,
      });
    });
  });
});
