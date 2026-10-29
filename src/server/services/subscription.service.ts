import Stripe from 'stripe';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { stripeWebhookEventRepository } from '../../db/repositories/stripe-webhook-event.repository';
import { AppError, NotFoundError, ValidationError } from '../../core/errors';
import { config } from '../../core/config';
import { logger } from './logger.service';
import { auditService } from './audit.service';
import type { Subscription } from '../../db/schema/subscriptions';

let stripeClient: Stripe | undefined;

function getStripe(): Stripe {
  if (!config.stripeSecretKey) {
    throw new AppError('Online payments are unavailable', 503, 'PAYMENTS_UNAVAILABLE');
  }
  stripeClient ??= new Stripe(config.stripeSecretKey, { apiVersion: '2026-01-28.clover' });
  return stripeClient;
}

const subscriptionLogger = logger.child({ module: 'subscription' });

export type PlanType = 'free' | 'pro' | 'team';
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing';

/** 权限吊销原因，写进 subscriptions.revokedReason */
export type RevokeReason = 'refund' | 'dispute';

const PRICE_TO_PLAN: Record<string, PlanType> = {
  [config.stripeProMonthlyPrice]: 'pro',
  [config.stripeProYearlyPrice]: 'pro',
  [config.stripeTeamMonthlyPrice]: 'team',
};

export class SubscriptionService {
  async getSubscriptionStatus(tenantId: string): Promise<Subscription | null> {
    return subscriptionRepository.findByTenantId(tenantId);
  }

  async createOrGetCustomer(tenantId: string, email: string): Promise<string> {
    const stripe = getStripe();
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

    const session = await getStripe().checkout.sessions.create({
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
    const stripe = getStripe();
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

  /**
   * 处理 Stripe webhook。
   *
   * 两件事必须按顺序发生：先验签（决定这个请求可不可信），再去重
   * （决定这个事件该不该再处理一次）。Stripe 是 at-least-once 投递，
   * 同一个 event.id 会重投，所以发放权限的逻辑必须挡在去重后面。
   *
   * 抛错交给调用方转成 5xx —— Stripe 看到 5xx 会重试，这是我们想要的：
   * 处理失败不能静默吞掉，否则用户付了钱而库里没有记录。
   */
  async handleWebhook(payload: string, signature: string): Promise<void> {
    const stripe = getStripe();
    const webhookSecret = config.stripeWebhookSecret;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new ValidationError('Invalid webhook signature');
    }

    const claimed = await stripeWebhookEventRepository.claim(event.id, event.type);
    if (!claimed) {
      // 已处理过或正在处理。返回成功让 Stripe 停止重投，这正是幂等的意义。
      subscriptionLogger.info('Skipping duplicate Stripe webhook event', {
        eventId: event.id,
        eventType: event.type,
      });
      return;
    }

    try {
      await this.dispatchEvent(event);
      await stripeWebhookEventRepository.markProcessed(event.id);
    } catch (error) {
      // 记为 failed，下一次重投可以重新抢占；同时原样抛出让 Stripe 知道要重试。
      await stripeWebhookEventRepository.markFailed(event.id, String(error));
      subscriptionLogger.error('Failed to process Stripe webhook event', error as Error, {
        eventId: event.id,
        eventType: event.type,
      });
      throw error;
    }
  }

  private async dispatchEvent(event: Stripe.Event): Promise<void> {
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
      case 'invoice.paid':
        // 续费成功。付款失败时我们把状态打到 past_due，这里必须能恢复回 active，
        // 否则用户补交了钱还是被降级对待。
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'charge.refunded':
        // 钱退了，权限必须跟着走。订阅状态不会因为退款变化，所以只靠
        // customer.subscription.* 这条线永远抓不到这种情况。
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      case 'charge.dispute.closed':
        await this.handleDisputeClosed(event.data.object as Stripe.Dispute);
        break;
      default:
        subscriptionLogger.debug('Ignoring unhandled Stripe event type', {
          eventId: event.id,
          eventType: event.type,
        });
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const tenantId = session.metadata?.tenantId;
    if (!tenantId || !session.subscription) return;

    const subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
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
    const subscriptionId = this.extractSubscriptionId(invoice);
    if (!subscriptionId) return;
    await subscriptionRepository.updateByStripeSubscriptionId(subscriptionId, {
      status: 'past_due',
    });
  }

  /**
   * 续费成功。只在当前是 past_due 时才需要动 —— 但这里无条件写 active 也是安全的：
   * invoice.paid 意味着这个周期的钱确实收到了。取消（canceled）走的是
   * customer.subscription.deleted，不会有 invoice.paid 跟在后面。
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = this.extractSubscriptionId(invoice);
    if (!subscriptionId) return;

    const existing = await subscriptionRepository.findByStripeSubscriptionId(subscriptionId);
    if (!existing || existing.status !== 'past_due') return;

    await subscriptionRepository.updateByStripeSubscriptionId(subscriptionId, {
      status: 'active',
    });
  }

  /**
   * 全额退款 → 吊销权限。
   *
   * 只认全额：部分退款（按比例退一期里的几天、退了个附加费）不该直接断服务，
   * 那属于账务调整而不是「这笔交易不算了」。
   */
  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const fullyRefunded = charge.refunded === true || charge.amount_refunded >= charge.amount;
    if (!fullyRefunded) {
      subscriptionLogger.info('Partial refund, keeping entitlement', {
        chargeId: charge.id,
        amount: charge.amount,
        amountRefunded: charge.amount_refunded,
      });
      return;
    }

    await this.revokeByCustomer(this.extractCustomerId(charge), 'refund', {
      chargeId: charge.id,
      amountRefunded: charge.amount_refunded,
      currency: charge.currency,
    });
  }

  /**
   * 拒付开出来就吊销，不等裁决。
   *
   * 裁决要几十天，这期间钱已经被银行扣回，用户却还在用服务。赢了再恢复
   * （charge.dispute.closed / status=won）代价比反过来小得多。
   */
  private async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const customerId = await this.resolveDisputeCustomer(dispute);

    // 不要叫 reason：审计里 reason 是吊销原因（refund/dispute），
    // 用 dispute.reason（fraudulent 之类）去占这个键会把它覆盖掉，
    // 财务对账时就分不出这笔是退款还是拒付了。
    await this.revokeByCustomer(customerId, 'dispute', {
      disputeId: dispute.id,
      disputeReason: dispute.reason,
      amount: dispute.amount,
    });
  }

  /**
   * 拒付裁决结束。只有我们赢了、且当初就是因为这场拒付吊销的，才恢复权限。
   * 因退款吊销的不受影响 —— 退款和拒付是两件独立的事。
   */
  private async handleDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
    if (dispute.status !== 'won') {
      subscriptionLogger.info('Dispute not won, entitlement stays revoked', {
        disputeId: dispute.id,
        status: dispute.status,
      });
      return;
    }

    const customerId = await this.resolveDisputeCustomer(dispute);
    if (!customerId) return;

    const subscription = await subscriptionRepository.findByStripeCustomerId(customerId);
    if (!subscription?.revokedAt || subscription.revokedReason !== 'dispute') return;

    await subscriptionRepository.update(subscription.id, {
      revokedAt: null,
      revokedReason: null,
    });

    auditService.log({
      tenantId: subscription.tenantId,
      actorId: 'system',
      action: 'subscription_restore',
      targetType: 'subscription',
      targetId: subscription.id,
      metadata: { disputeId: dispute.id, disputeStatus: dispute.status },
    });

    subscriptionLogger.info('Entitlement restored after winning dispute', {
      tenantId: subscription.tenantId,
      disputeId: dispute.id,
    });
  }

  /**
   * 落吊销标记。
   *
   * 幂等：已经吊销过就不再写，保留第一次的时间点 —— Stripe 会重投，
   * 覆写会把「什么时候失去权限」这个事实改掉。
   *
   * 找不到订阅不算错误，直接返回：这可能是一次性付款或别的产品线的 charge，
   * 抛错只会让 Stripe 无限重投一个永远不会成功的事件。
   */
  private async revokeByCustomer(
    customerId: string | undefined,
    reason: RevokeReason,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!customerId) {
      subscriptionLogger.warn('Refund/dispute without customer, cannot revoke', { reason, ...metadata });
      return;
    }

    const subscription = await subscriptionRepository.findByStripeCustomerId(customerId);
    if (!subscription) {
      subscriptionLogger.warn('No subscription for customer, nothing to revoke', {
        customerId,
        reason,
      });
      return;
    }

    if (subscription.revokedAt) {
      subscriptionLogger.info('Entitlement already revoked, skipping', {
        tenantId: subscription.tenantId,
        revokedAt: subscription.revokedAt,
        revokedReason: subscription.revokedReason,
      });
      return;
    }

    // 只写吊销字段：plan/status 由 Stripe 订阅状态驱动，退款时订阅往往还是
    // active，在这里改会和下一次 customer.subscription.updated 打架。
    await subscriptionRepository.update(subscription.id, {
      revokedAt: new Date(),
      revokedReason: reason,
    });

    auditService.log({
      tenantId: subscription.tenantId,
      actorId: 'system',
      action: 'subscription_revoke',
      targetType: 'subscription',
      targetId: subscription.id,
      // reason 放在展开之后：调用方传进来的字段不许覆盖吊销原因
      metadata: { plan: subscription.plan, ...metadata, reason },
    });

    subscriptionLogger.warn('Entitlement revoked', {
      tenantId: subscription.tenantId,
      plan: subscription.plan,
      reason,
    });
  }

  /** dispute.charge 可能是 id 也可能已展开；是 id 时得回查一次才能拿到 customer */
  private async resolveDisputeCustomer(dispute: Stripe.Dispute): Promise<string | undefined> {
    if (typeof dispute.charge !== 'string') {
      return this.extractCustomerId(dispute.charge);
    }

    const charge = await getStripe().charges.retrieve(dispute.charge);
    return this.extractCustomerId(charge);
  }

  /** charge.customer 可能是 id 字符串、展开后的对象，或 null */
  private extractCustomerId(charge: Stripe.Charge | undefined): string | undefined {
    const customer = charge?.customer;
    if (!customer) return undefined;
    return typeof customer === 'string' ? customer : customer.id;
  }

  /** invoice.subscription 在不同 API 版本里可能是 id 字符串或展开后的对象 */
  private extractSubscriptionId(invoice: Stripe.Invoice): string | undefined {
    const sub = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
    return typeof sub === 'string' ? sub : sub?.id;
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
