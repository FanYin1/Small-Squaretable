import Stripe from 'stripe';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { NotFoundError, ValidationError } from '../../core/errors';
import type { Subscription } from '../../db/schema/subscriptions';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

export type PlanType = 'free' | 'pro' | 'team';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

const PRICE_TO_PLAN: Record<string, PlanType> = {
  [process.env.STRIPE_PRICE_PRO_MONTHLY!]: 'pro',
  [process.env.STRIPE_PRICE_PRO_YEARLY!]: 'pro',
  [process.env.STRIPE_PRICE_TEAM_MONTHLY!]: 'team',
};

export class SubscriptionService {
  async getSubscriptionStatus(tenantId: string): Promise<Subscription | null> {
    return subscriptionRepository.findByTenantId(tenantId);
  }

  async createOrGetCustomer(tenantId: string, email: string): Promise<string> {
    const existingSub = await subscriptionRepository.findByTenantId(tenantId);
    if (existingSub?.stripeCustomerId) {
      return existingSub.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email,
      metadata: { tenantId },
    });

    if (existingSub) {
      await subscriptionRepository.update(existingSub.id, {
        stripeCustomerId: customer.id,
      });
    } else {
      await subscriptionRepository.create({
        tenantId,
        stripeCustomerId: customer.id,
        plan: 'free',
        status: 'active',
      });
    }

    return customer.id;
  }

  async createCheckoutSession(
    tenantId: string,
    email: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    const customerId = await this.createOrGetCustomer(tenantId, email);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenantId },
    });

    if (!session.url) {
      throw new ValidationError('Failed to create checkout session');
    }

    return session.url;
  }

  async createBillingPortalSession(tenantId: string, returnUrl: string): Promise<string> {
    const subscription = await subscriptionRepository.findByTenantId(tenantId);
    if (!subscription?.stripeCustomerId) {
      throw new NotFoundError('Subscription');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  async handleWebhook(payload: string, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new ValidationError('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const tenantId = session.metadata?.tenantId;
    if (!tenantId || !session.subscription) return;

    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    const priceId = subscription.items.data[0]?.price.id;
    const plan = PRICE_TO_PLAN[priceId] || 'pro';

    await subscriptionRepository.updateByTenantId(tenantId, {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan,
      status: 'active',
      currentPeriodStart: new Date(subscription.billing_cycle_anchor * 1000),
      currentPeriodEnd: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const priceId = subscription.items.data[0]?.price.id;
    const plan = PRICE_TO_PLAN[priceId] || 'pro';
    const status = this.mapStripeStatus(subscription.status);

    await subscriptionRepository.updateByStripeSubscriptionId(subscription.id, {
      stripePriceId: priceId,
      plan,
      status,
      currentPeriodStart: new Date(subscription.billing_cycle_anchor * 1000),
      currentPeriodEnd: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    await subscriptionRepository.updateByStripeSubscriptionId(subscription.id, {
      plan: 'free',
      status: 'canceled',
      stripeSubscriptionId: null,
      stripePriceId: null,
      cancelAtPeriodEnd: false,
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const sub = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
    const subscriptionId = typeof sub === 'string' ? sub : sub?.id;
    if (!subscriptionId) return;
    await subscriptionRepository.updateByStripeSubscriptionId(subscriptionId, {
      status: 'past_due',
    });
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      active: 'active',
      canceled: 'canceled',
      past_due: 'past_due',
      trialing: 'trialing',
      unpaid: 'past_due',
      incomplete: 'past_due',
      incomplete_expired: 'canceled',
      paused: 'canceled',
    };
    return statusMap[status] || 'active';
  }
}

export const subscriptionService = new SubscriptionService();
