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
  mockInviteConsume,
  mockInviteRecordUse,
  mockInviteWithTransaction,
  mockAuditLog,
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
  mockInviteConsume: vi.fn(),
  mockInviteRecordUse: vi.fn(),
  mockInviteWithTransaction: vi.fn(),
  mockAuditLog: vi.fn(),
}));

const TX = { marker: 'tx' };

// --- Module mocks ---

vi.mock('arctic', () => {
  const GoogleMock = vi.fn(function (this: Record<string, unknown>) {
    this.createAuthorizationURL = mockGoogleCreateAuthURL;
    this.validateAuthorizationCode = mockGoogleValidateCode;
  });
  const GitHubMock = vi.fn(function (this: Record<string, unknown>) {
    this.createAuthorizationURL = mockGitHubCreateAuthURL;
    this.validateAuthorizationCode = mockGitHubValidateCode;
  });
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

// 只 mock 到 repository 这一层，invite-code.service 的真实逻辑参与测试。
vi.mock('../../db/repositories/invite-code.repository', () => ({
  inviteCodeRepository: {
    withTransaction: mockInviteWithTransaction,
    consume: mockInviteConsume,
    recordUse: mockInviteRecordUse,
  },
}));

vi.mock('./audit.service', () => ({ auditService: { log: mockAuditLog } }));

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
import { InviteCodeError } from './invite-code.service';

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
    mockInviteWithTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX));
    mockInviteConsume.mockResolvedValue({ id: 'code-1' });
    mockInviteRecordUse.mockResolvedValue(undefined);
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
      const result = await oauthService.authenticateWithOAuth(profile, { ageConfirmed: true, inviteCode: 'ABCD-2345-WXYZ' });

      expect(result.isNewUser).toBe(true);
      expect(result.user.id).toBe('new-u');
      expect(mockTenantCreate).toHaveBeenCalledWith({ name: 'Test User', plan: 'free' }, TX);
      expect(mockUserCreate).toHaveBeenCalledWith(expect.objectContaining({
        email: 'user@example.com',
        tenantId: 'new-t',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        emailVerified: true,
      }), TX);
      expect(mockOAuthCreate).toHaveBeenCalledWith({
        userId: 'new-u',
        provider: 'google',
        providerAccountId: 'goog-123',
        email: 'user@example.com',
      }, TX);
    });

    it('should use email prefix as tenant name when displayName is null', async () => {
      mockFindByProviderAccount.mockResolvedValue(null);
      mockUserFindByEmail.mockResolvedValue(null);
      mockTenantCreate.mockResolvedValue({ id: 'new-t', name: 'user', plan: 'free' });
      mockUserCreate.mockResolvedValue(makeUser({ id: 'new-u', tenantId: 'new-t', displayName: null }));

      const profile = makeProfile({ displayName: null });
      await oauthService.authenticateWithOAuth(profile, { ageConfirmed: true, inviteCode: 'ABCD-2345-WXYZ' });

      expect(mockTenantCreate).toHaveBeenCalledWith({ name: 'user', plan: 'free' }, TX);
    });

    describe('满 18 岁声明', () => {
      beforeEach(() => {
        mockFindByProviderAccount.mockResolvedValue(null);
        mockUserFindByEmail.mockResolvedValue(null);
        mockTenantCreate.mockResolvedValue({ id: 'new-t', name: 'Test User', plan: 'free' });
        mockUserCreate.mockResolvedValue(makeUser({ id: 'new-u', tenantId: 'new-t' }));
      });

      it('OAuth 新用户没声明成年就不建号 —— 否则第三方登录就是绕过年龄门的后门', async () => {
        await expect(
          oauthService.authenticateWithOAuth(makeProfile()),
        ).rejects.toThrow('age_confirmation_required');

        expect(mockUserCreate).not.toHaveBeenCalled();
        expect(mockTenantCreate).not.toHaveBeenCalled();
      });

      it('OAuth 新用户声明后落库同样带时间点和哈希 IP', async () => {
        await oauthService.authenticateWithOAuth(makeProfile(), {
          ageConfirmed: true,
          inviteCode: 'ABCD-2345-WXYZ',
          actorIp: '203.0.113.7',
        });

        const arg = mockUserCreate.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.ageConfirmedAt).toBeInstanceOf(Date);
        expect(arg.ageConfirmedIp).toMatch(/^[0-9a-f]{16}$/);
        expect(arg.ageConfirmedIp).not.toBe('203.0.113.7');
      });

      it('老用户登录不需要重新声明 —— 年龄门只拦新建账号', async () => {
        mockFindByProviderAccount.mockResolvedValue({ userId: 'u1' });
        mockUserFindById.mockResolvedValue(makeUser());

        const result = await oauthService.authenticateWithOAuth(makeProfile());

        expect(result.isNewUser).toBe(false);
      });

      it('邮箱已存在走绑定分支时也不需要声明', async () => {
        mockUserFindByEmail.mockResolvedValue(makeUser({ id: 'u-old' }));

        const result = await oauthService.authenticateWithOAuth(makeProfile());

        expect(result.isNewUser).toBe(false);
        expect(mockUserCreate).not.toHaveBeenCalled();
      });
    });

    describe('邀请码', () => {
      const consent = { ageConfirmed: true, inviteCode: 'abcd-2345-wxyz', actorIp: '203.0.113.7' };

      beforeEach(() => {
        mockFindByProviderAccount.mockResolvedValue(null);
        mockUserFindByEmail.mockResolvedValue(null);
        mockTenantCreate.mockResolvedValue({ id: 'new-t', name: 'Test User', plan: 'free' });
        mockUserCreate.mockResolvedValue(makeUser({ id: 'new-u', tenantId: 'new-t' }));
      });

      function expectNothingCreated() {
        expect(mockTenantCreate).not.toHaveBeenCalled();
        expect(mockUserCreate).not.toHaveBeenCalled();
        expect(mockOAuthCreate).not.toHaveBeenCalled();
        expect(mockInviteRecordUse).not.toHaveBeenCalled();
      }

      it.each([undefined, '', '   '])('新用户缺码（%j）→ 400 INVITE_CODE_REQUIRED，不建号', async (inviteCode) => {
        const err = await oauthService
          .authenticateWithOAuth(makeProfile(), { ageConfirmed: true, inviteCode })
          .catch((e) => e);

        expect(err).toBeInstanceOf(InviteCodeError);
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVITE_CODE_REQUIRED');
        expect(mockInviteWithTransaction).not.toHaveBeenCalled();
        expectNothingCreated();
      });

      it('错码 / 过期 / 用尽 / 禁用 → 400 INVITE_CODE_INVALID，不建号', async () => {
        mockInviteConsume.mockResolvedValue(null);

        const err = await oauthService
          .authenticateWithOAuth(makeProfile(), consent)
          .catch((e) => e);

        expect(err).toBeInstanceOf(InviteCodeError);
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('INVITE_CODE_INVALID');
        expectNothingCreated();
      });

      it('年龄门先于邀请码：没声明成年不消耗邀请码', async () => {
        await expect(
          oauthService.authenticateWithOAuth(makeProfile(), { inviteCode: 'ABCD-2345-WXYZ' }),
        ).rejects.toThrow('age_confirmation_required');

        expect(mockInviteConsume).not.toHaveBeenCalled();
      });

      it('有效码：租户、用户、OAuth 绑定、使用记录都在消费邀请码的同一个事务里', async () => {
        const result = await oauthService.authenticateWithOAuth(makeProfile(), consent);

        expect(result.isNewUser).toBe(true);
        expect(mockInviteConsume).toHaveBeenCalledWith('ABCD-2345-WXYZ', TX);
        expect(mockTenantCreate).toHaveBeenCalledWith(expect.anything(), TX);
        expect(mockUserCreate).toHaveBeenCalledWith(expect.anything(), TX);
        expect(mockOAuthCreate).toHaveBeenCalledWith(expect.anything(), TX);
        expect(mockInviteRecordUse).toHaveBeenCalledWith({ codeId: 'code-1', userId: 'new-u' }, TX);
      });

      it('OAuth 绑定失败 → 错误向外抛（事务回滚），不记录使用', async () => {
        mockOAuthCreate.mockRejectedValueOnce(new Error('link failed'));

        await expect(oauthService.authenticateWithOAuth(makeProfile(), consent))
          .rejects.toThrow('link failed');

        expect(mockInviteRecordUse).not.toHaveBeenCalled();
      });

      it('使用邀请码写审计，来源标明 oauth 与 provider', async () => {
        await oauthService.authenticateWithOAuth(makeProfile(), consent);

        expect(mockAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'invite_code_use',
            actorId: 'new-u',
            targetId: 'code-1',
            metadata: expect.objectContaining({
              code: 'ABCD-2345-WXYZ',
              source: 'oauth',
              provider: 'google',
            }),
          }),
        );
      });

      it('老用户（已有 OAuth 绑定）登录不需要邀请码，也不消耗', async () => {
        mockFindByProviderAccount.mockResolvedValue({ userId: 'u1' });
        mockUserFindById.mockResolvedValue(makeUser());

        const result = await oauthService.authenticateWithOAuth(makeProfile());

        expect(result.isNewUser).toBe(false);
        expect(mockInviteConsume).not.toHaveBeenCalled();
      });

      it('邮箱匹配老用户走绑定分支，不需要邀请码，也不消耗', async () => {
        mockUserFindByEmail.mockResolvedValue(makeUser({ id: 'u-old' }));

        const result = await oauthService.authenticateWithOAuth(makeProfile());

        expect(result.isNewUser).toBe(false);
        expect(mockInviteConsume).not.toHaveBeenCalled();
        expect(mockInviteWithTransaction).not.toHaveBeenCalled();
      });
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
