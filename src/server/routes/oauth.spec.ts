import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// --- Mocks ---

vi.mock('../../core/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
  },
}));

vi.mock('../../core/config', () => ({
  config: {
    googleClientId: 'google-id',
    googleClientSecret: 'google-secret',
    githubClientId: 'github-id',
    githubClientSecret: 'github-secret',
    oauthCallbackBase: 'http://localhost:3000/api/v1/auth/oauth',
    appUrl: 'http://localhost:5173',
    jwtSecret: 'test-secret-key-for-unit-testing-minimum-32-chars',
  },
}));

vi.mock('../services/oauth.service', () => ({
  oauthService: {
    isSupported: vi.fn((p: string) => ['google', 'github'].includes(p)),
    getAuthorizationUrl: vi.fn(),
    handleCallback: vi.fn(),
    authenticateWithOAuth: vi.fn(),
  },
}));

describe('OAuth Routes', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import to get fresh module with mocks applied
    const { oauthRoutes } = await import('./oauth');
    app = new Hono();
    app.route('/api/v1/auth/oauth', oauthRoutes);
  });

  // --- GET /:provider (redirect to authorization URL) ---

  describe('GET /api/v1/auth/oauth/:provider', () => {
    it('should redirect to provider authorization URL with state', async () => {
      const { oauthService } = await import('../services/oauth.service');
      const { redis } = await import('../../core/redis');

      vi.mocked(oauthService.getAuthorizationUrl).mockReturnValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc123',
        state: 'abc123',
        codeVerifier: 'verifier123',
      });
      vi.mocked(redis.set).mockResolvedValue('OK');

      const res = await app.request('/api/v1/auth/oauth/google', {
        method: 'GET',
        redirect: 'manual',
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth?state=abc123',
      );
      expect(redis.set).toHaveBeenCalledWith(
        'oauth_state:abc123',
        JSON.stringify({ codeVerifier: 'verifier123', provider: 'google' }),
        { EX: 300 },
      );
    });

    it('should return error for unsupported provider', async () => {
      const { oauthService } = await import('../services/oauth.service');
      vi.mocked(oauthService.getAuthorizationUrl).mockImplementation(() => {
        throw new Error('Unsupported OAuth provider: twitter');
      });

      const res = await app.request('/api/v1/auth/oauth/twitter', {
        method: 'GET',
        redirect: 'manual',
      });

      // The error handler will catch this — status depends on error handling
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // --- GET /:provider/callback ---

  describe('GET /api/v1/auth/oauth/:provider/callback', () => {
    it('should redirect to frontend with auth code on success', async () => {
      const { oauthService } = await import('../services/oauth.service');
      const { redis } = await import('../../core/redis');

      vi.mocked(redis.get).mockResolvedValue(
        JSON.stringify({ codeVerifier: 'verifier123', provider: 'google' }),
      );
      vi.mocked(redis.del).mockResolvedValue(1);
      vi.mocked(redis.set).mockResolvedValue('OK');

      vi.mocked(oauthService.handleCallback).mockResolvedValue({
        provider: 'google',
        providerAccountId: 'goog-123',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      });

      vi.mocked(oauthService.authenticateWithOAuth).mockResolvedValue({
        user: {
          id: 'u1',
          tenantId: 't1',
          email: 'user@example.com',
          displayName: 'Test User',
          avatarUrl: null,
          role: 'user',
        },
        tokens: {
          accessToken: 'at',
          refreshToken: 'rt',
          expiresIn: 3600,
        },
        isNewUser: true,
      });

      const res = await app.request(
        '/api/v1/auth/oauth/google/callback?code=authcode&state=abc123',
        { method: 'GET', redirect: 'manual' },
      );

      expect(res.status).toBe(302);
      const location = res.headers.get('location')!;
      expect(location).toContain('http://localhost:5173/auth/oauth-callback?code=');
      // Verify the auth code was stored in Redis
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('oauth_code:'),
        expect.any(String),
        { EX: 30 },
      );
    });

    it('should redirect with error when state is invalid', async () => {
      const { redis } = await import('../../core/redis');
      vi.mocked(redis.get).mockResolvedValue(null);

      const res = await app.request(
        '/api/v1/auth/oauth/google/callback?code=authcode&state=bad_state',
        { method: 'GET', redirect: 'manual' },
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        'http://localhost:5173/auth/oauth-callback?error=invalid_state',
      );
    });

    it('should redirect with error when code or state is missing', async () => {
      const res = await app.request(
        '/api/v1/auth/oauth/google/callback',
        { method: 'GET', redirect: 'manual' },
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        'http://localhost:5173/auth/oauth-callback?error=missing_params',
      );
    });

    it('should redirect with error when provider mismatches', async () => {
      const { redis } = await import('../../core/redis');
      vi.mocked(redis.get).mockResolvedValue(
        JSON.stringify({ codeVerifier: 'v', provider: 'github' }),
      );
      vi.mocked(redis.del).mockResolvedValue(1);

      const res = await app.request(
        '/api/v1/auth/oauth/google/callback?code=authcode&state=abc123',
        { method: 'GET', redirect: 'manual' },
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(
        'http://localhost:5173/auth/oauth-callback?error=provider_mismatch',
      );
    });
  });

  // --- POST /oauth/exchange ---

  describe('POST /api/v1/auth/oauth/exchange', () => {
    it('should exchange valid auth code for tokens', async () => {
      const { redis } = await import('../../core/redis');

      const payload = {
        user: {
          id: 'u1',
          tenantId: 't1',
          email: 'user@example.com',
          displayName: 'Test User',
          avatarUrl: null,
          role: 'user',
        },
        tokens: {
          accessToken: 'at',
          refreshToken: 'rt',
          expiresIn: 3600,
        },
        isNewUser: false,
      };

      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(payload));
      vi.mocked(redis.del).mockResolvedValue(1);

      const res = await app.request('/api/v1/auth/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'valid-code' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.tokens.accessToken).toBe('at');
      expect(data.data.user.email).toBe('user@example.com');
      // Code should be deleted after use
      expect(redis.del).toHaveBeenCalledWith('oauth_code:valid-code');
    });

    it('should return 400 for expired/invalid auth code', async () => {
      const { redis } = await import('../../core/redis');
      vi.mocked(redis.get).mockResolvedValue(null);

      const res = await app.request('/api/v1/auth/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'expired-code' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_CODE');
    });

    it('should return 400 for missing code', async () => {
      const res = await app.request('/api/v1/auth/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });
});
