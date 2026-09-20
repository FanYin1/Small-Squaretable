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
  characterFilter?: string[]; // Array of character IDs
  scanDepth?: number; // Number of recent messages to scan
  contextPercentage?: number; // Max % of context budget
  recursive?: boolean; // Content will be scanned for keywords (default: true)
  preventRecursion?: boolean; // Won't be triggered by recursive scans (default: false)
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
  characterFilter?: string[];
  scanDepth?: number;
  contextPercentage?: number;
  recursive?: boolean;
  preventRecursion?: boolean;
}

export interface ScanResult {
  matches: Array<{
    id: string;
    keys: string[];
    secondaryKeys?: string[];
    content: string;
    comment?: string;
    depth: number;
    constant: boolean;
    matchedKeys: string[];
    tokens: number;
    recursionDepth: number;
  }>;
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
  importEntries: (worldbookId: string, data: Record<string, unknown>) =>
    api.post(`/worldbooks/${worldbookId}/import`, data),
  importFile: (data: Record<string, unknown>) =>
    api.post<{ worldBookId: string; name: string; imported: number }>('/worldbooks/import-file', data),
  exportWorldBook: (worldbookId: string) =>
    api.get<Record<string, unknown>>(`/worldbooks/${worldbookId}/export`),
  scanEntries: (worldbookId: string, text: string) =>
    api.post<ScanResult>(`/worldbooks/${worldbookId}/scan`, { text }),
};
