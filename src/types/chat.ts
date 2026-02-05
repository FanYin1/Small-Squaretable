/**
 * 聊天相关类型定义
 */

import { z } from 'zod';

/**
 * Sanitized metadata value type - only allows safe JSON-serializable types
 */
const baseMetadataValueSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
]);

type MetadataValue = z.infer<typeof baseMetadataValueSchema> | MetadataValue[] | { [key: string]: MetadataValue };

export const metadataValueSchema: z.ZodType<MetadataValue> = z.lazy(() =>
  z.union([
    baseMetadataValueSchema,
    z.array(metadataValueSchema),
    z.record(metadataValueSchema),
  ])
);

export const createChatSchema = z.object({
  characterId: z.string().uuid(),
  title: z.string().max(500).trim().optional(),
  metadata: z.record(metadataValueSchema).optional(),
});

export const updateChatSchema = z.object({
  title: z.string().max(500).trim().optional(),
  metadata: z.record(metadataValueSchema).optional(),
});

/**
 * Attachment schema for messages
 */
export const attachmentSchema = z.object({
  type: z.enum(['image', 'audio', 'video', 'file']),
  url: z.string().url().max(2000),
  name: z.string().max(255).optional(),
  size: z.number().int().positive().optional(),
  mimeType: z.string().max(100).optional(),
});

export const createMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(50000).trim(),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
