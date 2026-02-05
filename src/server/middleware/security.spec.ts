/**
 * Security Headers Middleware Tests
 *
 * Tests for security headers and CSP configuration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders, developmentSecurityHeaders } from './security';

describe('Security Headers Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  describe('securityHeaders (Production)', () => {
    beforeEach(() => {
      app.use('*', securityHeaders());
      app.get('/test', (c) => c.json({ ok: true }));
    });

    it('should set Content-Security-Policy header', async () => {
      const res = await app.request('/test');
      const csp = res.headers.get('Content-Security-Policy');

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
    });

    it('should set X-Content-Type-Options header', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should set X-Frame-Options to DENY', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should set X-XSS-Protection header', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should set Referrer-Policy header', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin'
      );
    });

    it('should set Permissions-Policy header', async () => {
      const res = await app.request('/test');
      const permissions = res.headers.get('Permissions-Policy');

      expect(permissions).toContain('geolocation=()');
      expect(permissions).toContain('camera=()');
      expect(permissions).toContain('microphone=()');
    });

    it('should set Cross-Origin-Opener-Policy header', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    });

    it('should set Cross-Origin-Resource-Policy header', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    });

    it('should set X-Powered-By to empty string', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-Powered-By')).toBe('');
    });

    it('should allow nonce in CSP when provided', async () => {
      const appWithNonce = new Hono();
      appWithNonce.use('*', securityHeaders({ nonce: 'test-nonce-123' }));
      appWithNonce.get('/test', (c) => c.json({ ok: true }));

      const res = await appWithNonce.request('/test');
      const csp = res.headers.get('Content-Security-Policy');

      expect(csp).toContain("'nonce-test-nonce-123'");
    });

    it('should allow additional CSP directives', async () => {
      const appWithDirectives = new Hono();
      appWithDirectives.use(
        '*',
        securityHeaders({
          additionalDirectives: {
            'img-src': ["'self'", 'https://cdn.example.com'],
          },
        })
      );
      appWithDirectives.get('/test', (c) => c.json({ ok: true }));

      const res = await appWithDirectives.request('/test');
      const csp = res.headers.get('Content-Security-Policy');

      expect(csp).toContain('https://cdn.example.com');
    });
  });

  describe('developmentSecurityHeaders', () => {
    beforeEach(() => {
      app.use('*', developmentSecurityHeaders());
      app.get('/test', (c) => c.json({ ok: true }));
    });

    it('should set relaxed CSP for development', async () => {
      const res = await app.request('/test');
      const csp = res.headers.get('Content-Security-Policy');

      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain('http://localhost:*');
    });

    it('should still set X-Content-Type-Options', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should still set X-Frame-Options to DENY', async () => {
      const res = await app.request('/test');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });
});
