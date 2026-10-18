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
import { auditService } from '../services/audit.service';
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

  /**
   * 注册页勾了成年声明后才会带上 ageConfirmed=1。
   *
   * 声明随 state 存进 Redis，不放在回调 URL 上——回调地址用户可以自己改，
   * 放在那里等于让「是否声明过」变成可伪造的查询参数。
   * 登录页不带这个标记：老用户登录不需要重复声明，而全新账号会在
   * authenticateWithOAuth 里被拦下并提示去注册页。
   */
  const ageConfirmed = c.req.query('ageConfirmed') === '1';

  // Store state → codeVerifier mapping in Redis
  await redis.set(
    `${OAUTH_STATE_PREFIX}${state}`,
    JSON.stringify({ codeVerifier, provider, ageConfirmed }),
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

  const { codeVerifier, provider: storedProvider, ageConfirmed } = JSON.parse(stateData);
  if (storedProvider !== provider) {
    return c.redirect(`${config.appUrl}/auth/oauth-callback?error=provider_mismatch`);
  }

  const actorIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

  try {
    const profile = await oauthService.handleCallback(provider, code, codeVerifier);
    const result = await oauthService.authenticateWithOAuth(profile, {
      ageConfirmed: ageConfirmed === true,
      actorIp: actorIp === 'unknown' ? undefined : actorIp,
    });

    // Audit OAuth link
    auditService.log({
      tenantId: result.user.tenantId,
      actorId: result.user.id,
      actorIp,
      action: 'oauth_link',
      metadata: { provider },
    });

    // 新建账号才有声明可记；和邮箱注册留同一个 action，取证时一处查得到。
    if (result.isNewUser) {
      auditService.log({
        tenantId: result.user.tenantId,
        actorId: result.user.id,
        actorIp,
        action: 'age_confirm',
        metadata: { source: 'oauth', provider },
      });
    }

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
