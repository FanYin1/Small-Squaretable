/**
 * 聊天相关类型定义
 */

import { z } from 'zod';

export const createChatSchema = z.object({
  characterId: z.string().uuid(),
  title: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateChatSchema = z.object({
  title: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

export const createMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  attachments: z.array(z.any()).optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
