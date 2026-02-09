/**
 * Developer API Service
 *
 * Handles API key management for the developer portal
 */

import { api } from './api';
import type {
  ApiKeyInfo,
  ApiKeyCreatedResponse,
  CreateApiKeyInput,
  UpdateApiKeyInput,
} from '@/types/apiKey';

export const developerApi = {
  createApiKey: (input: CreateApiKeyInput) =>
    api.post<ApiKeyCreatedResponse>('/developer/api-keys', input),

  listApiKeys: (limit = 20, offset = 0) =>
    api.get<ApiKeyInfo[]>(`/developer/api-keys?limit=${limit}&offset=${offset}`),

  getApiKey: (id: string) =>
    api.get<ApiKeyInfo>(`/developer/api-keys/${id}`),

  updateApiKey: (id: string, input: UpdateApiKeyInput) =>
    api.patch<ApiKeyInfo>(`/developer/api-keys/${id}`, input),

  deleteApiKey: (id: string) =>
    api.delete(`/developer/api-keys/${id}`),

  getScopes: () =>
    api.get<string[]>('/developer/scopes'),
};
