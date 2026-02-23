/**
 * Character Template API
 *
 * Handles character template CRUD and usage tracking
 */

import { api } from './api';
import type { CharacterTemplate } from '@client/types';

export const characterTemplateApi = {
  listTemplates: (params: { page?: number; limit?: number; category?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.category) query.set('category', params.category);
    const qs = query.toString();
    return api.get<{ items: CharacterTemplate[]; pagination: Record<string, unknown> }>(
      `/character-templates${qs ? `?${qs}` : ''}`
    );
  },

  getMyTemplates: () =>
    api.get<CharacterTemplate[]>('/character-templates/mine'),

  getTemplate: (id: string) =>
    api.get<CharacterTemplate>(`/character-templates/${id}`),

  createTemplate: (data: Partial<CharacterTemplate>) =>
    api.post<CharacterTemplate>('/character-templates', data),

  updateTemplate: (id: string, data: Partial<CharacterTemplate>) =>
    api.patch<CharacterTemplate>(`/character-templates/${id}`, data),

  deleteTemplate: (id: string) =>
    api.delete(`/character-templates/${id}`),

  useTemplate: (id: string) =>
    api.post<CharacterTemplate>(`/character-templates/${id}/use`),

  rateTemplate: (id: string, rating: number) =>
    api.post<{ rating: number }>(`/character-templates/${id}/rate`, { rating }),

  getTemplateRating: (id: string) =>
    api.get<{ average: number; count: number }>(`/character-templates/${id}/rating`),
};
