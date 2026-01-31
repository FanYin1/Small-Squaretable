import { api } from './api';
import type { Subscription, SubscriptionConfig } from '@client/types';

export interface CheckoutRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PortalRequest {
  returnUrl: string;
}

export const subscriptionApi = {
  getStatus: () =>
    api.get<{ subscription: Subscription }>('/subscriptions/status'),

  getConfig: () =>
    api.get<SubscriptionConfig>('/subscriptions/config'),

  createCheckout: (data: CheckoutRequest) =>
    api.post<{ url: string }>('/subscriptions/checkout', data),

  createPortal: (data: PortalRequest) =>
    api.post<{ url: string }>('/subscriptions/portal', data),
};
