/**
 * OAuth Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mocks ---

const {
  mockGoogleCreateAuthURL,
  mockGoogleValidateCode,
  mockGitHubCreateAuthURL,
  mockGitHubValidateCode,
  mockGenerateState,
  mockGenerateCodeVerifier,
  mockFindByProviderAccount,
  mockOAuthCreate,
  mockUserFindById,
  mockUserFindByEmail,
  mockUserCreate,
  mockUserUpdateLastLogin,
  mockTenantCreate,
  mockGenerateAccessToken,
  mockGenerateRefreshToken,
  mockVerifyRefreshToken,
  mockRedisSet,
} = vi.hoisted(() => ({
  mockGoogleCreateAuthURL: vi.fn(),
  mockGoogleValidateCode: vi.fn(),
  mockGitHubCreateAuthURL: vi.fn(),
  mockGitHubValidateCode: vi.fn(),
  mockGenerateState: vi.fn().mockReturnValue('mock-state'),
  mockGenerateCodeVerifier: vi.fn().mockReturnValue('mock-verifier'),
  mockFindByProviderAccount: vi.fn(),
  mockOAuthCreate: vi.fn(),
  mockUserFindById: vi.fn(),
  mockUserFindByEmail: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserUpdateLastLogin: vi.fn(),
  mockTenantCreate: vi.fn(),
  mockGenerateAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
  mockGenerateRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
  mockVerifyRefreshToken: vi.fn().mockResolvedValue({ userId: 'u1', tokenId: 'tid-1' }),
  mockRedisSet: vi.fn().mockResolvedValue('OK'),
}));

// --- Module mocks ---

vi.mock('arctic', () => {
  const GoogleMock = vi.fn(() => ({
    createAuthorizationURL: mockGoogleCreateAuthURL,
    validateAuthorizationCode: mockGoogleValidateCode,
  }));
  const GitHubMock = vi.fn(() => ({
    createAuthorizationURL: mockGitHubCreateAuthURL,
    validateAuthorizationCode: mockGitHubValidateCode,
  }));
  return {
    Google: GoogleMock,
    GitHub: GitHubMock,
    generateState: mockGenerateState,
    generateCodeVerifier: mockGenerateCodeVerifier,
    OAuth2Tokens: vi.fn(),
  };
});

vi.mock('../../core/config', () => ({
  config: {
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
    githubClientId: 'github-client-id',
    githubClientSecret: 'github-client-secret',
    oauthCallbackBase: 'http://localhost:3000/api/v1/auth/oauth',
  },
}));

vi.mock('../../db/repositories/oauth.repository', () => ({
  oauthRepository: {
    findByProviderAccount: mockFindByProviderAccount,
    create: mockOAuthCreate,
  },
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: {
    findById: mockUserFindById,
    findByEmail: mockUserFindByEmail,
    create: mockUserCreate,
    updateLastLogin: mockUserUpdateLastLogin,
  },
}));

vi.mock('../../db/repositories/tenant.repository', () => ({
  tenantRepository: {
    create: mockTenantCreate,
  },
}));

vi.mock('../../core/jwt', () => ({
  generateAccessToken: mockGenerateAccessToken,
  generateRefreshToken: mockGenerateRefreshToken,
  verifyRefreshToken: mockVerifyRefreshToken,
}));

vi.mock('../../core/redis', () => ({
  redis: {
    set: mockRedisSet,
  },
}));

// --- Import after mocks ---

import { oauthService } from './oauth.service';
import { BadRequestError } from '../../core/errors';

// --- Helpers ---

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  tenantId: 't1',
  email: 'user@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  role: 'user',
  isActive: true,
  ...overrides,
});

const makeProfile = (overrides: Record<string, unknown> = {}) => ({
  provider: 'google',
  providerAccountId: 'goog-123',
  email: 'user@example.com',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/avatar.png',
  ...overrides,
});

// --- Tests ---

describe('oauthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default return values cleared by clearAllMocks
    mockGenerateState.mockReturnValue('mock-state');
    mockGenerateCodeVerifier.mockReturnValue('mock-verifier');
    mockGenerateAccessToken.mockResolvedValue('mock-access-token');
    mockGenerateRefreshToken.mockResolvedValue('mock-refresh-token');
    mockVerifyRefreshToken.mockResolvedValue({ userId: 'u1', tokenId: 'tid-1' });
    mockRedisSet.mockResolvedValue('OK');
  });

  // ---- isSupported ----

  describe('isSupported', () => {
    it('should return true for google', () => {
      expect(oauthService.isSupported('google')).toBe(true);
    });

    it('should return true for github', () => {
      expect(oauthService.isSupported('github')).toBe(true);
    });

    it('should return false for twitter', () => {
      expect(oauthService.isSupported('twitter')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(oauthService.isSupported('')).toBe(false);
    });
  });

  // ---- getAuthorizationUrl ----

  describe('getAuthorizationUrl', () => {
    it('should return url, state, codeVerifier for google', () => {
      mockGoogleCreateAuthURL.mockReturnValue(new URL('https://accounts.google.com/o/oauth2/auth?state=mock-state'));

      const result = oauthService.getAuthorizationUrl('google');

      expect(result.state).toBe('mock-state');
      expect(result.codeVerifier).toBe('mock-verifier');
      expect(result.url).toContain('https://accounts.google.com');
      expect(mockGoogleCreateAuthURL).toHaveBeenCalledWith(
        'mock-state',
        'mock-verifier',
        ['openid', 'email', 'profile'],
      );
    });

    it('should return url, state, codeVerifier for github', () => {
      mockGitHubCreateAuthURL.mockReturnValue(new URL('https://github.com/login/oauth/authorize?state=mock-state'));

      const result = oauthService.getAuthorizationUrl('github');

      expect(result.state).toBe('mock-state');
      expect(result.codeVerifier).toBe('mock-verifier');
      expect(result.url).toContain('https://github.com');
      expect(mockGitHubCreateAuthURL).toHaveBeenCalledWith('mock-state', ['user:email']);
    });

    it('should throw BadRequestError for unsupported provider', () => {
      expect(() => oauthService.getAuthorizationUrl('twitter')).toThrow(BadRequestError);
      expect(() => oauthService.getAuthorizationUrl('twitter')).toThrow('Unsupported OAuth provider: twitter');
    });
  });

  // ---- handleCallback ----

  describe('handleCallback', () => {
    const mockTokens = { accessToken: () => 'mock-provider-access-token' };

    it('should exchange code and fetch Google profile', async () => {
      mockGoogleValidateCode.mockResolvedValue(mockTokens);

      const googleProfile = {
        id: 'goog-123',
        email: 'user@gmail.com',
        name: 'Google User',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(googleProfile),
      }));

      const result = await oauthService.handleCallback('google', 'auth-code', 'verifier');

      expect(mockGoogleValidateCode).toHaveBeenCalledWith('auth-code', 'verifier');
      expect(result).toEqual({
        provider: 'google',
        providerAccountId: 'goog-123',
        email: 'user@gmail.com',
        displayName: 'Google User',
        avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
      });
    });

    it('should exchange code and fetch GitHub profile with email in user endpoint', async () => {
      mockGitHubValidateCode.mockResolvedValue(mockTokens);

      const githubUser = {
        id: 42,
        login: 'octocat',
        name: 'Octo Cat',
        avatar_url: 'https://avatars.githubusercontent.com/u/42',
        email: 'octocat@github.com',
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(githubUser),
      }));

      const result = await oauthService.handleCallback('github', 'gh-code', 'verifier');

      expect(mockGitHubValidateCode).toHaveBeenCalledWith('gh-code');
      expect(result).toEqual({
        provider: 'github',
        providerAccountId: '42',
        email: 'octocat@github.com',
        displayName: 'Octo Cat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42',
      });
    });

    it('should fallback to /user/emails when GitHub user has no email', async () => {
      mockGitHubValidateCode.mockResolvedValue(mockTokens);

      const githubUser = {
        id: 42,
        login: 'octocat',
        name: 'Octo Cat',
        avatar_url: 'https://avatars.githubusercontent.com/u/42',
        email: null,
      };

      const githubEmails = [
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'primary@example.com', primary: true, verified: true },
      ];

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(githubUser) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(githubEmails) });

      vi.stubGlobal('fetch', mockFetch);

      const result = await oauthService.handleCallback('github', 'gh-code', 'verifier');

      expect(result.email).toBe('primary@example.com');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when GitHub has no verified email at all', async () => {
      mockGitHubValidateCode.mockResolvedValue(mockTokens);

      const githubUser = { id: 42, login: 'octocat', email: null };
      const githubEmails: unknown[] = [];

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(githubUser) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(githubEmails) });

      vi.stubGlobal('fetch', mockFetch);

      await expect(oauthService.handleCallback('github', 'gh-code', 'v'))
        .rejects.toThrow('GitHub account has no verified email');
    });

    it('should throw BadRequestError when Google profile fetch fails', async () => {
      mockGoogleValidateCode.mockResolvedValue(mockTokens);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      await expect(oauthService.handleCallback('google', 'code', 'verifier'))
        .rejects.toThrow('Failed to fetch Google profile');
    });

    it('should throw BadRequestError when GitHub profile fetch fails', async () => {
      mockGitHubValidateCode.mockResolvedValue(mockTokens);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      await expect(oauthService.handleCallback('github', 'code', 'verifier'))
        .rejects.toThrow('Failed to fetch GitHub profile');
    });

    it('should throw BadRequestError for unsupported provider', async () => {
      await expect(oauthService.handleCallback('twitter', 'code', 'verifier'))
        .rejects.toThrow(BadRequestError);
    });
  });

  // ---- authenticateWithOAuth ----

  describe('authenticateWithOAuth', () => {
    it('should return existing user when OAuth link exists', async () => {
      const user = makeUser();
      mockFindByProviderAccount.mockResolvedValue({ userId: 'u1', provider: 'google', providerAccountId: 'goog-123' });
      mockUserFindById.mockResolvedValue(user);

      const result = await oauthService.authenticateWithOAuth(makeProfile());

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe('u1');
      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBe('mock-refresh-token');
      expect(mockUserUpdateLastLogin).toHaveBeenCalledWith('u1');
      expect(mockRedisSet).toHaveBeenCalled();
    });

    it('should throw when existing OAuth-linked user is deactivated', async () => {
      mockFindByProviderAccount.mockResolvedValue({ userId: 'u1', provider: 'google', providerAccountId: 'goog-123' });
      mockUserFindById.mockResolvedValue(makeUser({ isActive: false }));

      await expect(oauthService.authenticateWithOAuth(makeProfile()))
        .rejects.toThrow('Account is deactivated');
    });

    it('should throw when existing OAuth-linked user is not found', async () => {
      mockFindByProviderAccount.mockResolvedValue({ userId: 'u1', provider: 'google', providerAccountId: 'goog-123' });
      mockUserFindById.mockResolvedValue(null);

      await expect(oauthService.authenticateWithOAuth(makeProfile()))
        .rejects.toThrow('Account is deactivated');
    });

    it('should link account and return user when email matches existing user', async () => {
      const existingUser = makeUser({ id: 'u2', tenantId: 't2' });
      mockFindByProviderAccount.mockResolvedValue(null);
      mockUserFindByEmail.mockResolvedValue(existingUser);

      const result = await oauthService.authenticateWithOAuth(makeProfile());

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe('u2');
      expect(mockOAuthCreate).toHaveBeenCalledWith({
        userId: 'u2',
        provider: 'google',
        providerAccountId: 'goog-123',
        email: 'user@example.com',
      });
      expect(mockUserUpdateLastLogin).toHaveBeenCalledWith('u2');
    });

    it('should create new tenant, user, and OAuth link for brand-new user', async () => {
      mockFindByProviderAccount.mockResolvedValue(null);
      mockUserFindByEmail.mockResolvedValue(null);
      mockTenantCreate.mockResolvedValue({ id: 'new-t', name: 'Test User', plan: 'free' });
      mockUserCreate.mockResolvedValue(makeUser({ id: 'new-u', tenantId: 'new-t' }));

      const profile = makeProfile();
      const result = await oauthService.authenticateWithOAuth(profile);

      expect(result.isNewUser).toBe(true);
      expect(result.user.id).toBe('new-u');
      expect(mockTenantCreate).toHaveBeenCalledWith({ name: 'Test User', plan: 'free' });
      expect(mockUserCreate).toHaveBeenCalledWith(expect.objectContaining({
        email: 'user@example.com',
        tenantId: 'new-t',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        emailVerified: true,
      }));
      expect(mockOAuthCreate).toHaveBeenCalledWith({
        userId: 'new-u',
        provider: 'google',
        providerAccountId: 'goog-123',
        email: 'user@example.com',
      });
    });

    it('should use email prefix as tenant name when displayName is null', async () => {
      mockFindByProviderAccount.mockResolvedValue(null);
      mockUserFindByEmail.mockResolvedValue(null);
      mockTenantCreate.mockResolvedValue({ id: 'new-t', name: 'user', plan: 'free' });
      mockUserCreate.mockResolvedValue(makeUser({ id: 'new-u', tenantId: 'new-t', displayName: null }));

      const profile = makeProfile({ displayName: null });
      await oauthService.authenticateWithOAuth(profile);

      expect(mockTenantCreate).toHaveBeenCalledWith({ name: 'user', plan: 'free' });
    });

    it('should store refresh token in Redis with correct key and TTL', async () => {
      const user = makeUser();
      mockFindByProviderAccount.mockResolvedValue({ userId: 'u1' });
      mockUserFindById.mockResolvedValue(user);

      await oauthService.authenticateWithOAuth(makeProfile());

      expect(mockRedisSet).toHaveBeenCalledWith(
        'refresh_token:u1',
        'tid-1',
        { EX: 7 * 24 * 60 * 60 },
      );
    });
  });
});
