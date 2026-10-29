/**
 * Credits API (P3-1)
 *
 * 用户侧只读：余额与自己的流水。充值 / 冲正只在管理端（admin.api.ts）。
 */

import { api } from './api';
import type { CreditActivity, CreditLedgerFilters, CreditRange } from '../../types/credit-activity';
export type { CreditActivity } from '../../types/credit-activity';

export interface CreditBalance {
  unlimited?: boolean;
  /** subscription 时前端不展示点数 */
  billingMode: 'subscription' | 'credits';
  tokensPerPoint: number;
  balanceTokens: number;
  heldTokens: number;
  availableTokens: number;
  balancePoints: number;
  availablePoints: number;
}

export interface CreditLedgerItem {
  id: string;
  kind: 'topup' | 'charge' | 'reversal';
  /** 带符号 token：充值为正，消费 / 冲正为负 */
  tokens: number;
  points: number;
  chatId: string | null;
  messageId: number | null;
  inputTokens?: number;
  outputTokens?: number;
  createdAt: string;
}

export interface CreditLedgerResponse {
  items: CreditLedgerItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const creditsApi = {
  getBalance: () => api.get<CreditBalance>('/credits/balance'),

  getActivity: (range: CreditRange) => api.get<CreditActivity>('/credits/activity?' + new URLSearchParams(range)),

  getLedger: (params: { page?: number; limit?: number } & CreditLedgerFilters = {}) => {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined);
    const query = entries.length
      ? '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
      : '';
    return api.get<CreditLedgerResponse>('/credits/ledger' + query);
  },
};
