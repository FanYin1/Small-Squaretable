/**
 * CSRF Protection Middleware Tests
 *
 * Tests for CSRF token generation and validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  csrfProtection,
  getCsrfToken,
  generateCsrfToken,
  revokeCsrfToken,
} from './csrf';

describe('CSRF Protection Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  describe('generateCsrfToken', () => {
    it('should generate a unique 64-character hex string', () => {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different tokens on each call', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('getCsrfToken endpoint', () => {
    beforeEach(() => {
      app.get('/api/v1/csrf-token', getCsrfToken);
    });

    it('should return 401 when not authenticated', async () => {
      const res = await app.request('/api/v1/csrf-token');
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.error).toBe('No active session');
    });

    it('should generate and store CSRF token when authenticated', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';
      const res = await app.request('/api/v1/csrf-token', {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.csrfToken).toBeDefined();
      expect(data.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('csrfProtection middleware', () => {
    it('should allow GET requests without CSRF token', async () => {
      app.get('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      const res = await app.request('/api/test');
      expect(res.status).toBe(200);
    });

    it('should allow POST requests without auth', async () => {
      app.post('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should require CSRF token for authenticated POST requests', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      // Create a new app for this test
      const testApp = new Hono();
      testApp.get('/api/v1/csrf-token', getCsrfToken);
      testApp.post('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      // First get a CSRF token
      const csrfRes = await testApp.request('/api/v1/csrf-token', {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const { csrfToken } = await csrfRes.json();

      // Now make a POST request with the token
      const res = await testApp.request('/api/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-CSRF-Token': csrfToken,
        },
      });

      expect(res.status).toBe(200);
    });

    it('should reject authenticated POST without CSRF token', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      app.post('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).toBe(403);
      // HTTPException returns text, not JSON
      const text = await res.text();
      expect(text).toContain('Invalid CSRF token');
    });

    it('should reject authenticated POST with invalid CSRF token', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      app.post('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          'X-CSRF-Token': 'invalid-token',
        },
      });

      expect(res.status).toBe(403);
    });

    it('should validate PUT requests', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      app.put('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).toBe(403);
    });

    it('should validate PATCH requests', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      app.patch('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).toBe(403);
    });

    it('should validate DELETE requests', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      app.delete('/api/test', csrfProtection(), (c) => c.json({ ok: true }));

      const res = await app.request('/api/test', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('revokeCsrfToken', () => {
    beforeEach(() => {
      app.delete('/api/v1/csrf-token', revokeCsrfToken);
    });

    it('should revoke CSRF token', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

      const res = await app.request('/api/v1/csrf-token', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
