import { describe, expect, it, vi } from 'vitest';

vi.mock('../../core/config', async importOriginal => {
  const original = await importOriginal<typeof import('../../core/config')>();
  return { ...original, config: { ...original.config, stripeSecretKey: '' } };
});
vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../../db/repositories/stripe-webhook-event.repository', () => ({
  stripeWebhookEventRepository: { claim: vi.fn() },
}));

import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { stripeWebhookEventRepository } from '../../db/repositories/stripe-webhook-event.repository';
import { SubscriptionService } from './subscription.service';

describe('Subscription service without online payments', () => {
  const service = new SubscriptionService();

  it('loads with the real Stripe SDK and keeps subscription status available', async () => {
    await expect(service.getSubscriptionStatus('tenant')).resolves.toBeNull();
  });

  it('rejects payment operations before reading or changing billing state', async () => {
    vi.mocked(subscriptionRepository.findByTenantId).mockClear();
    for (const operation of [
      () => service.createCheckoutSession('tenant', 'reader@example.test', 'price', 'https://example.test/ok', 'https://example.test/cancel'),
      () => service.createBillingPortalSession('tenant', 'https://example.test'),
      () => service.handleWebhook('{}', 'signature'),
    ]) {
      await expect(operation()).rejects.toMatchObject({ statusCode: 503, code: 'PAYMENTS_UNAVAILABLE' });
    }
    expect(subscriptionRepository.findByTenantId).not.toHaveBeenCalled();
    expect(stripeWebhookEventRepository.claim).not.toHaveBeenCalled();
  });
});
