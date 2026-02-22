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

export interface WorldBookEntry {
  id: string;
  worldbookId: string;
  keyword: string;
  content: string;
  position: number;
  isEnabled: boolean;
  priority: number;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntryInput {
  keyword: string;
  content: string;
  position?: number;
  isEnabled?: boolean;
  priority?: number;
  settings?: Record<string, unknown>;
}

export const worldbookApi = {
  list: () => api.get<WorldBookDto[]>('/worldbooks'),
  get: (id: string) => api.get<WorldBookDto>(`/worldbooks/${id}`),
  create: (data: CreateWorldBookInput) => api.post<WorldBookDto>('/worldbooks', data),
  update: (id: string, data: Partial<CreateWorldBookInput & { isEnabled: boolean }>) =>
    api.patch<WorldBookDto>(`/worldbooks/${id}`, data),
  delete: (id: string) => api.delete(`/worldbooks/${id}`),
  getEntries: (worldbookId: string) => api.get<WorldBookEntry[]>(`/worldbooks/${worldbookId}/entries`),
  createEntry: (worldbookId: string, data: CreateEntryInput) =>
    api.post<WorldBookEntry>(`/worldbooks/${worldbookId}/entries`, data),
  updateEntry: (worldbookId: string, entryId: string, data: Partial<CreateEntryInput & { isEnabled: boolean }>) =>
    api.patch<WorldBookEntry>(`/worldbooks/${worldbookId}/entries/${entryId}`, data),
  deleteEntry: (worldbookId: string, entryId: string) =>
    api.delete(`/worldbooks/${worldbookId}/entries/${entryId}`),
};
