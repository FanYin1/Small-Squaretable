/**
 * CSRF Protection Middleware Tests
 *
 * Tests for CSRF token generation and validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
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

  describe('session isolation and stable issuance', () => {
    const makeSession = () => `shared-header-and-payload-prefix-${randomUUID()}`;
    beforeEach(() => {
      app.get('/csrf', getCsrfToken);
      app.delete('/csrf', revokeCsrfToken);
      app.post('/write', csrfProtection(), context => context.json({ ok: true }));
    });
    async function issue(session: string) {
      const response = await app.request('/csrf', { headers: { Authorization: `Bearer ${session}` } });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      return (await response.json()).csrfToken as string;
    }
    const write = (session: string, token: string) => app.request('/write', { method: 'POST',
      headers: { Authorization: `Bearer ${session}`, 'X-CSRF-Token': token } });

    it('keeps tokens with the same first 32 characters isolated', async () => {
      const first = makeSession();
      const second = first.slice(0, 32) + randomUUID();
      const firstToken = await issue(first);
      const secondToken = await issue(second);
      expect(firstToken).not.toBe(secondToken);
      expect((await write(first, firstToken)).status).toBe(200);
      expect((await write(second, secondToken)).status).toBe(200);
      expect((await write(first, secondToken)).status).toBe(403);
      expect((await write(second, firstToken)).status).toBe(403);
    });

    it('returns one token for concurrent and repeated reads of the same credential', async () => {
      const session = makeSession();
      const tokens = await Promise.all(Array.from({ length: 8 }, () => issue(session)));
      expect(new Set(tokens).size).toBe(1);
      expect(await issue(session)).toBe(tokens[0]);
      expect((await write(session, tokens[0])).status).toBe(200);
    });

    it('revokes only the selected credential and rejects its old token', async () => {
      const first = makeSession();
      const second = first.slice(0, 32) + randomUUID();
      const firstToken = await issue(first);
      const secondToken = await issue(second);
      await app.request('/csrf', { method: 'DELETE', headers: { Authorization: `Bearer ${first}` } });
      expect((await write(first, firstToken)).status).toBe(403);
      expect((await write(second, secondToken)).status).toBe(200);
      expect(await issue(first)).not.toBe(firstToken);
    });

    it('expires tokens without extending their life on every read', async () => {
      vi.useFakeTimers();
      try {
        const session = makeSession();
        const token = await issue(session);
        vi.advanceTimersByTime(1800000);
        expect(await issue(session)).toBe(token);
        vi.advanceTimersByTime(1800001);
        expect((await write(session, token)).status).toBe(403);
        expect(await issue(session)).not.toBe(token);
      } finally { vi.useRealTimers(); }
    });

    it('rejects a multibyte header with the same character count instead of throwing', async () => {
      const session = makeSession();
      await issue(session);
      expect((await write(session, 'é'.repeat(64))).status).toBe(403);
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
