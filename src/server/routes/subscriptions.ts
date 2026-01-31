import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { subscriptionService } from '../services/subscription.service';
import { authMiddleware } from '../middleware/auth';
import type { ApiResponse } from '../../types/api';

export const subscriptionRoutes = new Hono();

const checkoutSchema = z.object({
  priceId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

subscriptionRoutes.get('/status', authMiddleware(), async (c) => {
  const user = c.get('user');
  const subscription = await subscriptionService.getSubscriptionStatus(user.tenantId);

  return c.json<ApiResponse>({
    success: true,
    data: {
      subscription: subscription ?? {
        plan: 'free',
        status: 'active',
      },
    },
    meta: { timestamp: new Date().toISOString() },
  });
});

subscriptionRoutes.post(
  '/checkout',
  authMiddleware(),
  zValidator('json', checkoutSchema),
  async (c) => {
    const user = c.get('user');
    const { priceId, successUrl, cancelUrl } = c.req.valid('json');

    const checkoutUrl = await subscriptionService.createCheckoutSession(
      user.tenantId,
      user.email,
      priceId,
      successUrl,
      cancelUrl
    );

    return c.json<ApiResponse>({
      success: true,
      data: { url: checkoutUrl },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

subscriptionRoutes.post(
  '/portal',
  authMiddleware(),
  zValidator('json', portalSchema),
  async (c) => {
    const user = c.get('user');
    const { returnUrl } = c.req.valid('json');

    const portalUrl = await subscriptionService.createBillingPortalSession(
      user.tenantId,
      returnUrl
    );

    return c.json<ApiResponse>({
      success: true,
      data: { url: portalUrl },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

subscriptionRoutes.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  const payload = await c.req.text();
  await subscriptionService.handleWebhook(payload, signature);

  return c.json({ received: true });
});

subscriptionRoutes.get('/config', async (c) => {
  return c.json<ApiResponse>({
    success: true,
    data: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      prices: {
        proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
        proYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
        teamMonthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
      },
    },
    meta: { timestamp: new Date().toISOString() },
  });
});
