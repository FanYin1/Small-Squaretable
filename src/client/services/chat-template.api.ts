/**
 * Chat Template API
 *
 * Handles chat template CRUD and usage tracking
 */

import { api } from './api';

export interface ChatTemplate {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  firstMessage: string | null;
  tags: string[];
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  systemPrompt?: string;
  firstMessage?: string;
  tags?: string[];
  isPublic?: boolean;
}

export const chatTemplateApi = {
  getTemplates: () =>
    api.get<{ own: ChatTemplate[]; public: ChatTemplate[] }>('/chat-templates'),

  createTemplate: (data: CreateTemplateInput) =>
    api.post<ChatTemplate>('/chat-templates', data),

  updateTemplate: (id: string, data: Partial<CreateTemplateInput>) =>
    api.patch<ChatTemplate>(`/chat-templates/${id}`, data),

  deleteTemplate: (id: string) =>
    api.delete(`/chat-templates/${id}`),

  useTemplate: (id: string) =>
    api.post<ChatTemplate>(`/chat-templates/${id}/use`),
};
