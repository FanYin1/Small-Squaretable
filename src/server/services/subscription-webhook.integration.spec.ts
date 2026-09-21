import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

/**
 * Stripe webhook 全链路集成测试。
 *
 * 覆盖的是「用户付了钱，权限有没有真的写进库」这条链路，而不是单个函数：
 * 路由 -> 验签 -> event.id 去重 -> 事件分发 -> 订阅表写入。
 *
 * 只 mock 两处外部边界：
 *   - stripe.webhooks.constructEvent（验签，需要真实 secret 和真实签名，本地拿不到）
 *   - 两个 repository（需要 Postgres）
 * 中间的分发和幂等逻辑都是真的在跑。
 */

const constructEvent = vi.fn();
const retrieveSubscription = vi.fn();

// 共享的 stub 对象而不是在 class 里 new vi.fn()：service 里的 `new Stripe(...)`
// 只发生一次，测试需要能拿到同一个 mock 来配置返回值。
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent };
    subscriptions = { retrieve: retrieveSubscription };
    customers = { create: vi.fn() };
    checkout = { sessions: { create: vi.fn() } };
    billingPortal = { sessions: { create: vi.fn() } };
  },
}));

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: {
    findByTenantId: vi.fn(),
    findByStripeSubscriptionId: vi.fn(),
    updateByTenantId: vi.fn(),
    updateByStripeSubscriptionId: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../db/repositories/stripe-webhook-event.repository', () => ({
  stripeWebhookEventRepository: {
    claim: vi.fn(),
    markProcessed: vi.fn(),
    markFailed: vi.fn(),
    findById: vi.fn(),
  },
}));

const SIGNATURE_HEADER = 't=1700000000,v1=deadbeefdeadbeef';

const post = async (app: Hono, body: unknown, headers: Record<string, string> = {}) =>
  app.request('/subscriptions/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('Stripe webhook integration', () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { subscriptionRoutes } = await import('../routes/subscriptions');
    const { errorHandler } = await import('../middleware/error-handler');
    const { stripeWebhookEventRepository } = await import(
      '../../db/repositories/stripe-webhook-event.repository'
    );

    // 默认：第一次投递，拿到处理权
    vi.mocked(stripeWebhookEventRepository.claim).mockResolvedValue(true);

    app = new Hono();
    app.onError(errorHandler);
    app.route('/subscriptions', subscriptionRoutes);
  });

  describe('签名校验', () => {
    it('rejects a request with no stripe-signature header before touching the DB', async () => {
      const { stripeWebhookEventRepository } = await import(
        '../../db/repositories/stripe-webhook-event.repository'
      );

      const res = await post(app, { id: 'evt_1', type: 'invoice.paid' });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Missing stripe-signature header' });
      expect(constructEvent).not.toHaveBeenCalled();
      expect(stripeWebhookEventRepository.claim).not.toHaveBeenCalled();
    });

    it('returns 400 and records nothing when the signature does not verify', async () => {
      const { stripeWebhookEventRepository } = await import(
        '../../db/repositories/stripe-webhook-event.repository'
      );
      constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      const res = await post(
        app,
        { id: 'evt_forged', type: 'checkout.session.completed' },
        { 'stripe-signature': SIGNATURE_HEADER }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid webhook signature');
      // 去重表不该被伪造请求污染：否则攻击者可以用猜到的 event.id
      // 抢占处理权，让真实事件被当成重复投递丢掉。
      expect(stripeWebhookEventRepository.claim).not.toHaveBeenCalled();
    });

    it('passes the raw request body to constructEvent, not a re-serialized copy', async () => {
      // 验签算的是原始字节。JSON.parse -> JSON.stringify 一圈下来键顺序或
      // 空格变了，签名就永远对不上。
      const raw = '{"id":"evt_raw","type":"invoice.paid","data":{"object":{}}}';
      constructEvent.mockReturnValue({ id: 'evt_raw', type: 'invoice.paid', data: { object: {} } });

      await app.request('/subscriptions/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': SIGNATURE_HEADER },
        body: raw,
      });

      expect(constructEvent).toHaveBeenCalledWith(raw, SIGNATURE_HEADER, expect.any(String));
    });
  });

  describe('幂等（Stripe 是 at-least-once 投递）', () => {
    it('grants the subscription on first delivery of checkout.session.completed', async () => {
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');
      const { stripeWebhookEventRepository } = await import(
        '../../db/repositories/stripe-webhook-event.repository'
      );

      constructEvent.mockReturnValue({
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: { object: { metadata: { tenantId: 'tenant_abc' }, subscription: 'sub_123' } },
      });
      retrieveSubscription.mockResolvedValue({
        id: 'sub_123',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        billing_cycle_anchor: 1_700_000_000,
        cancel_at: null,
        cancel_at_period_end: false,
      });
      vi.mocked(subscriptionRepository.updateByTenantId).mockResolvedValue(null);

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      expect(res.status).toBe(200);
      expect(stripeWebhookEventRepository.claim).toHaveBeenCalledWith(
        'evt_checkout_1',
        'checkout.session.completed'
      );
      // 这条是整个链路的目的：权限确实写到了付款那个租户上
      expect(subscriptionRepository.updateByTenantId).toHaveBeenCalledWith(
        'tenant_abc',
        expect.objectContaining({
          stripeSubscriptionId: 'sub_123',
          status: 'active',
        })
      );
      expect(stripeWebhookEventRepository.markProcessed).toHaveBeenCalledWith('evt_checkout_1');
    });

    it('ignores a checkout session with no tenantId in metadata', async () => {
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_no_tenant',
        type: 'checkout.session.completed',
        data: { object: { metadata: {}, subscription: 'sub_123' } },
      });

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      // 没有 tenantId 就无从判断该给谁发权限；不能猜，也不该 5xx 让 Stripe 无限重投
      expect(res.status).toBe(200);
      expect(subscriptionRepository.updateByTenantId).not.toHaveBeenCalled();
    });

    it('does not re-grant entitlement when Stripe redelivers the same event.id', async () => {
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');
      const { stripeWebhookEventRepository } = await import(
        '../../db/repositories/stripe-webhook-event.repository'
      );

      constructEvent.mockReturnValue({
        id: 'evt_checkout_dup',
        type: 'checkout.session.completed',
        data: { object: { metadata: { tenantId: 'tenant_abc' }, subscription: 'sub_123' } },
      });
      // claim 返回 false = 这个 event.id 已经处理过/正在处理
      vi.mocked(stripeWebhookEventRepository.claim).mockResolvedValue(false);

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      // 返回 200 让 Stripe 停止重投，同时一个字都不写
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(subscriptionRepository.updateByTenantId).not.toHaveBeenCalled();
      expect(subscriptionRepository.updateByStripeSubscriptionId).not.toHaveBeenCalled();
      expect(stripeWebhookEventRepository.markProcessed).not.toHaveBeenCalled();
    });

    it('marks the event processed after a successful dispatch', async () => {
      const { stripeWebhookEventRepository } = await import(
        '../../db/repositories/stripe-webhook-event.repository'
      );
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_del_1',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123' } },
      });
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue(null);

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      expect(res.status).toBe(200);
      expect(stripeWebhookEventRepository.markProcessed).toHaveBeenCalledWith('evt_del_1');
      expect(stripeWebhookEventRepository.markFailed).not.toHaveBeenCalled();
    });

    it('marks the event failed and returns 5xx so Stripe retries', async () => {
      const { stripeWebhookEventRepository } = await import(
        '../../db/repositories/stripe-webhook-event.repository'
      );
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_boom',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123' } },
      });
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockRejectedValue(
        new Error('connection terminated')
      );

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      // 5xx 是给 Stripe 的重试信号。静默 200 = 用户付了钱但库里没记录。
      expect(res.status).toBe(500);
      expect(stripeWebhookEventRepository.markFailed).toHaveBeenCalledWith(
        'evt_boom',
        expect.stringContaining('connection terminated')
      );
      expect(stripeWebhookEventRepository.markProcessed).not.toHaveBeenCalled();
    });
  });

  describe('事件分发', () => {
    it('flips the subscription to past_due on invoice.payment_failed', async () => {
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_failed',
        type: 'invoice.payment_failed',
        data: { object: { subscription: 'sub_123' } },
      });
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue(null);

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      expect(res.status).toBe(200);
      expect(subscriptionRepository.updateByStripeSubscriptionId).toHaveBeenCalledWith('sub_123', {
        status: 'past_due',
      });
    });

    it('restores a past_due subscription to active on invoice.paid', async () => {
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_paid',
        type: 'invoice.paid',
        data: { object: { subscription: 'sub_123' } },
      });
      vi.mocked(subscriptionRepository.findByStripeSubscriptionId).mockResolvedValue({
        id: 'row_1',
        status: 'past_due',
        plan: 'pro',
      } as any);
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue(null);

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      expect(res.status).toBe(200);
      // 没有这条，付款失败后补交的用户会永远停在 past_due
      expect(subscriptionRepository.updateByStripeSubscriptionId).toHaveBeenCalledWith('sub_123', {
        status: 'active',
      });
    });

    it('does not resurrect a canceled subscription on invoice.paid', async () => {
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_paid_canceled',
        type: 'invoice.paid',
        data: { object: { subscription: 'sub_123' } },
      });
      vi.mocked(subscriptionRepository.findByStripeSubscriptionId).mockResolvedValue({
        id: 'row_1',
        status: 'canceled',
        plan: 'free',
      } as any);

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      expect(res.status).toBe(200);
      expect(subscriptionRepository.updateByStripeSubscriptionId).not.toHaveBeenCalled();
    });

    it('accepts an expanded subscription object on the invoice', async () => {
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_expanded',
        type: 'invoice.payment_failed',
        data: { object: { subscription: { id: 'sub_expanded' } } },
      });
      vi.mocked(subscriptionRepository.updateByStripeSubscriptionId).mockResolvedValue(null);

      await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      expect(subscriptionRepository.updateByStripeSubscriptionId).toHaveBeenCalledWith(
        'sub_expanded',
        { status: 'past_due' }
      );
    });

    it('acknowledges an unhandled event type without failing it', async () => {
      const { stripeWebhookEventRepository } = await import(
        '../../db/repositories/stripe-webhook-event.repository'
      );
      const { subscriptionRepository } = await import('../../db/repositories/subscription.repository');

      constructEvent.mockReturnValue({
        id: 'evt_unknown',
        type: 'customer.discount.created',
        data: { object: {} },
      });

      const res = await post(app, {}, { 'stripe-signature': SIGNATURE_HEADER });

      // 未处理的类型必须 200：返回 5xx 会让 Stripe 无限重投一个我们根本不关心的事件
      expect(res.status).toBe(200);
      expect(stripeWebhookEventRepository.markProcessed).toHaveBeenCalledWith('evt_unknown');
      expect(subscriptionRepository.updateByStripeSubscriptionId).not.toHaveBeenCalled();
    });
  });
});
