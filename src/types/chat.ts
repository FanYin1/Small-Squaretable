/**
 * 聊天相关类型定义
 */

import { z } from 'zod';
import { openingSelectionSchema } from './story-opening';

export const chatCreationStatusSchema = z.discriminatedUnion('status', [
  z.object({ protocol: z.literal(1), status: z.literal('created'), chatId: z.string().min(1) }),
  z.object({ protocol: z.literal(1), status: z.literal('deleted') }),
  z.object({ protocol: z.literal(1), status: z.literal('not_found') }),
]);

export type ChatCreationStatus = z.infer<typeof chatCreationStatusSchema>;

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
  opening: openingSelectionSchema.optional(),
  clientRequestId: z.string().uuid().optional(),
  characterId: z.string().uuid().optional(),
  characterIds: z.array(z.string().uuid()).min(1).max(10).optional(),
  personaId: z.string().uuid().optional(),
  title: z.string().max(500).trim().optional(),
  metadata: z.record(metadataValueSchema).optional(),
}).refine(
  (data) => data.characterId || data.characterIds,
  { message: 'Either characterId or characterIds is required' }
);

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
  parentMessageId: z.number().optional(),
  extra: z.record(z.unknown()).optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(50000).optional(),
  pinned: z.boolean().optional(),
  importance: z.number().int().min(1).max(10).optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
