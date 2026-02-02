import { api } from './api';

export type ResourceType = 'messages' | 'llm_tokens' | 'images' | 'api_calls';

export interface UsageStats {
  period: string;
  byResource: Array<{
    resourceType: string;
    amount: number;
  }>;
  total: number;
}

export interface QuotaInfo {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
}

export interface QuotaResponse {
  messages: QuotaInfo;
  llm_tokens: QuotaInfo;
  images: QuotaInfo;
  api_calls: QuotaInfo;
}

export const usageApi = {
  getStats: () =>
    api.get<UsageStats>('/usage/stats'),

  getQuota: () =>
    api.get<QuotaResponse>('/usage/quota'),
};
