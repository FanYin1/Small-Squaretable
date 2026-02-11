/**
 * OAuth Routes
 *
 * GET  /oauth/:provider          — Redirect to provider authorization URL
 * GET  /oauth/:provider/callback — Handle provider callback, issue auth code
 * POST /oauth/exchange           — Exchange short-lived auth code for JWT pair
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import crypto from 'crypto';
import { oauthService } from '../services/oauth.service';
import { redis } from '../../core/redis';
import { config } from '../../core/config';
import type { ApiResponse } from '../../types/api';

const OAUTH_STATE_PREFIX = 'oauth_state:';
const OAUTH_STATE_TTL = 300; // 5 minutes
const OAUTH_CODE_PREFIX = 'oauth_code:';
const OAUTH_CODE_TTL = 30; // 30 seconds

export const oauthRoutes = new Hono();

/**
 * GET /oauth/:provider
 * Generate state + codeVerifier, store in Redis, redirect to provider.
 */
oauthRoutes.get('/:provider', async (c) => {
  const provider = c.req.param('provider');

  const { url, state, codeVerifier } = oauthService.getAuthorizationUrl(provider);

  // Store state → codeVerifier mapping in Redis
  await redis.set(
    `${OAUTH_STATE_PREFIX}${state}`,
    JSON.stringify({ codeVerifier, provider }),
    { EX: OAUTH_STATE_TTL },
  );

  return c.redirect(url);
});

/**
 * GET /oauth/:provider/callback
 * Verify state, exchange code, authenticate user, redirect to frontend.
 */
oauthRoutes.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider');
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    return c.redirect(`${config.appUrl}/auth/oauth-callback?error=missing_params`);
  }

  // Verify state from Redis
  const stateData = await redis.get(`${OAUTH_STATE_PREFIX}${state}`);
  if (!stateData) {
    return c.redirect(`${config.appUrl}/auth/oauth-callback?error=invalid_state`);
  }

  // Clean up state
  await redis.del(`${OAUTH_STATE_PREFIX}${state}`);

  const { codeVerifier, provider: storedProvider } = JSON.parse(stateData);
  if (storedProvider !== provider) {
    return c.redirect(`${config.appUrl}/auth/oauth-callback?error=provider_mismatch`);
  }

  try {
    const profile = await oauthService.handleCallback(provider, code, codeVerifier);
    const result = await oauthService.authenticateWithOAuth(profile);

    // Generate a short-lived auth code and store the result in Redis
    const authCode = crypto.randomBytes(32).toString('hex');
    await redis.set(
      `${OAUTH_CODE_PREFIX}${authCode}`,
      JSON.stringify({
        user: result.user,
        tokens: result.tokens,
        isNewUser: result.isNewUser,
      }),
      { EX: OAUTH_CODE_TTL },
    );

    return c.redirect(`${config.appUrl}/auth/oauth-callback?code=${authCode}`);
  } catch (err: any) {
    const message = encodeURIComponent(err.message || 'oauth_failed');
    return c.redirect(`${config.appUrl}/auth/oauth-callback?error=${message}`);
  }
});

/**
 * POST /oauth/exchange
 * Exchange a short-lived auth code for a JWT pair.
 */
const exchangeSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

oauthRoutes.post(
  '/exchange',
  zValidator('json', exchangeSchema),
  async (c) => {
    const { code: authCode } = c.req.valid('json');

    const data = await redis.get(`${OAUTH_CODE_PREFIX}${authCode}`);
    if (!data) {
      return c.json<ApiResponse>(
        { success: false, error: { code: 'INVALID_CODE', message: 'Invalid or expired auth code' } },
        400,
      );
    }

    // Clean up — single use
    await redis.del(`${OAUTH_CODE_PREFIX}${authCode}`);

    const result = JSON.parse(data);
    return c.json<ApiResponse>({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  },
);
