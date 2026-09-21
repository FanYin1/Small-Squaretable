import { api } from './api';
import type { Subscription, SubscriptionConfig, Entitlement } from '@client/types';

export interface CheckoutRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PortalRequest {
  returnUrl: string;
}

export const subscriptionApi = {
  /**
   * entitlement 是服务端算好的「当前真正生效的套餐」。
   * 可选是为了兼容还没部署新后端的情况，前端要能退回只看 subscription。
   */
  getStatus: () =>
    api.get<{ subscription: Subscription; entitlement?: Entitlement }>('/subscriptions/status'),

  getConfig: () =>
    api.get<SubscriptionConfig>('/subscriptions/config'),

  createCheckout: (data: CheckoutRequest) =>
    api.post<{ url: string }>('/subscriptions/checkout', data),

  createPortal: (data: PortalRequest) =>
    api.post<{ url: string }>('/subscriptions/portal', data),
};
