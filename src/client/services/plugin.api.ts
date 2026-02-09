/**
 * Plugin API Service
 *
 * Handles plugin marketplace, install management, and author CRUD
 */

import { api } from './api';
import type {
  PluginInfo,
  PluginInstallInfo,
  CreatePluginInput,
  UpdatePluginInput,
  UpdateInstallConfigInput,
  PluginExecutionResult,
} from '@/types/plugin';

export interface PluginMarketplaceParams {
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'popular' | 'newest' | 'name';
}

export interface PaginatedPlugins {
  items: PluginInfo[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const pluginApi = {
  // --- Author Management ---
  createPlugin: (input: CreatePluginInput) =>
    api.post<PluginInfo>('/plugins', input),

  getMyPlugins: () =>
    api.get<PluginInfo[]>('/plugins/mine'),

  updatePlugin: (id: string, input: UpdatePluginInput) =>
    api.patch<PluginInfo>(`/plugins/${id}`, input),

  deletePlugin: (id: string) =>
    api.delete(`/plugins/${id}`),

  publishPlugin: (id: string) =>
    api.post<PluginInfo>(`/plugins/${id}/publish`),

  // --- Marketplace ---
  getMarketplace: (params: PluginMarketplaceParams = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.sort) query.set('sort', params.sort);
    const qs = query.toString();
    return api.get<PaginatedPlugins>(`/plugins/marketplace${qs ? `?${qs}` : ''}`);
  },

  getMarketplacePlugin: (id: string) =>
    api.get<PluginInfo>(`/plugins/marketplace/${id}`),

  // --- Install Management ---
  installPlugin: (pluginId: string, config: Record<string, unknown> = {}) =>
    api.post<PluginInstallInfo>('/plugins/installs', { pluginId, config }),

  getInstalls: () =>
    api.get<PluginInstallInfo[]>('/plugins/installs'),

  updateInstallConfig: (installId: string, input: UpdateInstallConfigInput) =>
    api.patch<PluginInstallInfo>(`/plugins/installs/${installId}`, input),

  uninstallPlugin: (installId: string) =>
    api.delete(`/plugins/installs/${installId}`),

  enablePlugin: (installId: string) =>
    api.post<PluginInstallInfo>(`/plugins/installs/${installId}/enable`),

  disablePlugin: (installId: string) =>
    api.post<PluginInstallInfo>(`/plugins/installs/${installId}/disable`),

  // --- Execution ---
  executeEvent: (event: string, payload: unknown) =>
    api.post<PluginExecutionResult[]>('/plugins/execute', { event, payload }),
};
