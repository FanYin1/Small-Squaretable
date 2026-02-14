/**
 * World Book API service
 *
 * Provides typed API calls for world book management.
 */

import { api } from './api';

export interface WorldBookDto {
  id: string;
  name: string;
  description: string | null;
  scope: 'global' | 'character' | 'persona' | 'chat';
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorldBookInput {
  name: string;
  scope: WorldBookDto['scope'];
  description?: string;
}

export const worldbookApi = {
  list: () => api.get<WorldBookDto[]>('/worldbooks'),
  get: (id: string) => api.get<WorldBookDto>(`/worldbooks/${id}`),
  create: (data: CreateWorldBookInput) => api.post<WorldBookDto>('/worldbooks', data),
  update: (id: string, data: Partial<CreateWorldBookInput & { isEnabled: boolean }>) =>
    api.patch<WorldBookDto>(`/worldbooks/${id}`, data),
  delete: (id: string) => api.delete(`/worldbooks/${id}`),
};
