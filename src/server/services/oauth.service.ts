/**
 * OAuth Service
 *
 * Provider registry (Google, GitHub), authorization URL generation,
 * token exchange, profile normalization, and user linking/creation.
 */

import { Google, GitHub, generateState, generateCodeVerifier, OAuth2Tokens } from 'arctic';
import { config } from '../../core/config';
import { oauthRepository } from '../../db/repositories/oauth.repository';
import { userRepository } from '../../db/repositories/user.repository';
import { tenantRepository } from '../../db/repositories/tenant.repository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../core/jwt';
import { redis } from '../../core/redis';
import { BadRequestError } from '../../core/errors';
import type { AuthUser, AuthTokens } from '../../types/auth';

// --- Provider registry ---

const SUPPORTED_PROVIDERS = ['google', 'github'] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function getGoogleClient(): Google {
  return new Google(
    config.googleClientId,
    config.googleClientSecret,
    `${config.oauthCallbackBase}/google/callback`,
  );
}

function getGitHubClient(): GitHub {
  return new GitHub(
    config.githubClientId,
    config.githubClientSecret,
    `${config.oauthCallbackBase}/github/callback`,
  );
}

// --- Types ---

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// --- Constants ---

const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

// --- Service ---

export const oauthService = {
  /**
   * Validate that a provider string is supported.
   */
  isSupported(provider: string): provider is Provider {
    return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
  },

  /**
   * Generate an authorization URL with state (+ PKCE code verifier for Google).
   */
  getAuthorizationUrl(provider: string): { url: string; state: string; codeVerifier: string } {
    if (!this.isSupported(provider)) {
      throw new BadRequestError(`Unsupported OAuth provider: ${provider}`);
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    let url: URL;
    if (provider === 'google') {
      url = getGoogleClient().createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);
    } else {
      // GitHub doesn't use PKCE
      url = getGitHubClient().createAuthorizationURL(state, ['user:email']);
    }

    return { url: url.toString(), state, codeVerifier };
  },

  /**
   * Exchange authorization code for tokens, then fetch the user profile
   * from the provider's API.
   */
  async handleCallback(
    provider: string,
    code: string,
    codeVerifier: string,
  ): Promise<OAuthProfile> {
    if (!this.isSupported(provider)) {
      throw new BadRequestError(`Unsupported OAuth provider: ${provider}`);
    }

    let tokens: OAuth2Tokens;
    if (provider === 'google') {
      tokens = await getGoogleClient().validateAuthorizationCode(code, codeVerifier);
    } else {
      tokens = await getGitHubClient().validateAuthorizationCode(code);
    }

    const accessToken = tokens.accessToken();
    return provider === 'google'
      ? await fetchGoogleProfile(accessToken)
      : await fetchGitHubProfile(accessToken);
  },

  /**
   * Authenticate (or register) a user from an OAuth profile.
   *
   * 1. If an oauth_account already exists for this provider+id → login that user.
   * 2. Else if a user with the same email exists → link the account + login.
   * 3. Else create a new user (emailVerified=true) + tenant + link account.
   */
  async authenticateWithOAuth(
    profile: OAuthProfile,
  ): Promise<{ user: AuthUser; tokens: AuthTokens; isNewUser: boolean }> {
    // 1. Existing OAuth link?
    const existing = await oauthRepository.findByProviderAccount(
      profile.provider,
      profile.providerAccountId,
    );

    if (existing) {
      const user = await userRepository.findById(existing.userId);
      if (!user || !user.isActive) {
        throw new BadRequestError('Account is deactivated');
      }
      await userRepository.updateLastLogin(user.id);
      const tokens = await generateTokenPair(user.id, user.tenantId, user.email, user.role ?? 'user');
      return { user: toAuthUser(user), tokens, isNewUser: false };
    }

    // 2. Email match?
    const existingUser = await userRepository.findByEmail(profile.email);
    if (existingUser) {
      // Link the OAuth account to the existing user
      await oauthRepository.create({
        userId: existingUser.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        email: profile.email,
      });
      await userRepository.updateLastLogin(existingUser.id);
      const tokens = await generateTokenPair(
        existingUser.id, existingUser.tenantId, existingUser.email, existingUser.role ?? 'user',
      );
      return { user: toAuthUser(existingUser), tokens, isNewUser: false };
    }

    // 3. Brand-new user
    const tenant = await tenantRepository.create({
      name: profile.displayName ?? profile.email.split('@')[0],
      plan: 'free',
    });

    const newUser = await userRepository.create({
      email: profile.email,
      tenantId: tenant.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      emailVerified: true, // OAuth emails are pre-verified
    } as any);

    await oauthRepository.create({
      userId: newUser.id,
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
      email: profile.email,
    });

    const tokens = await generateTokenPair(newUser.id, newUser.tenantId, newUser.email, newUser.role ?? 'user');
    return { user: toAuthUser(newUser), tokens, isNewUser: true };
  },
};

// --- Helpers ---

async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new BadRequestError('Failed to fetch Google profile');
  }
  const data = (await res.json()) as {
    id: string;
    email: string;
    name?: string;
    picture?: string;
  };
  return {
    provider: 'google',
    providerAccountId: data.id,
    email: data.email,
    displayName: data.name ?? null,
    avatarUrl: data.picture ?? null,
  };
}

async function fetchGitHubProfile(accessToken: string): Promise<OAuthProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  // Fetch user info
  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) {
    throw new BadRequestError('Failed to fetch GitHub profile');
  }
  const userData = (await userRes.json()) as {
    id: number;
    login: string;
    name?: string;
    avatar_url?: string;
    email?: string;
  };

  // GitHub may not return email in the user endpoint; fetch from /user/emails
  let email = userData.email;
  if (!email) {
    const emailRes = await fetch('https://api.github.com/user/emails', { headers });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email ?? emails[0]?.email ?? null;
    }
  }

  if (!email) {
    throw new BadRequestError('GitHub account has no verified email');
  }

  return {
    provider: 'github',
    providerAccountId: String(userData.id),
    email,
    displayName: userData.name ?? userData.login,
    avatarUrl: userData.avatar_url ?? null,
  };
}

function toAuthUser(user: any): AuthUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role ?? 'user',
  };
}

async function generateTokenPair(
  userId: string,
  tenantId: string,
  email: string,
  role: 'user' | 'moderator' | 'admin' = 'user',
): Promise<AuthTokens> {
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken({ userId, tenantId, email, role }),
    generateRefreshToken(userId),
  ]);

  // Store refresh token in Redis
  const payload = await verifyRefreshToken(refreshToken);
  await redis.set(
    `${REFRESH_TOKEN_PREFIX}${userId}`,
    payload.tokenId,
    { EX: REFRESH_TOKEN_TTL },
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: 60 * 60, // 1 hour
  };
}
