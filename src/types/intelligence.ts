/**
 * Intelligence Types
 *
 * Types for memory and emotion systems
 */

import { z } from 'zod';

// Memory types
export const memoryTypeSchema = z.enum(['fact', 'preference', 'relationship', 'event']);
export type MemoryType = z.infer<typeof memoryTypeSchema>;

export const memorySchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  userId: z.string().uuid(),
  type: memoryTypeSchema,
  content: z.string().min(1).max(1000),
  importance: z.number().min(0).max(1).default(0.5),
  accessCount: z.number().int().min(0).default(0),
  sourceChatId: z.string().uuid().nullable().optional(),
  sourceMessageId: z.number().int().nullable().optional(),
  createdAt: z.string().datetime(),
  lastAccessed: z.string().datetime(),
});

export type Memory = z.infer<typeof memorySchema>;

export const createMemorySchema = z.object({
  type: memoryTypeSchema,
  content: z.string().min(1).max(1000),
  importance: z.number().min(0).max(1).optional(),
});

export type CreateMemoryInput = z.infer<typeof createMemorySchema>;

export const memoryQuerySchema = z.object({
  query: z.string().min(1).max(500).optional(),
  type: memoryTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type MemoryQuery = z.infer<typeof memoryQuerySchema>;

// Emotion types
export const emotionLabelSchema = z.enum([
  'excited', 'happy', 'loving', 'calm', 'curious', 'surprised',
  'confused', 'bored', 'sad', 'fearful', 'angry', 'disgusted'
]);
export type EmotionLabel = z.infer<typeof emotionLabelSchema>;

export const emotionStateSchema = z.object({
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  label: emotionLabelSchema,
  description: z.string(),
});

export type EmotionState = z.infer<typeof emotionStateSchema>;

export const emotionRecordSchema = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  userId: z.string().uuid(),
  chatId: z.string().uuid().nullable().optional(),
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  triggerMessageId: z.number().int().nullable().optional(),
  triggerContent: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type EmotionRecord = z.infer<typeof emotionRecordSchema>;

export const updateEmotionSchema = z.object({
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
});

export type UpdateEmotionInput = z.infer<typeof updateEmotionSchema>;

// API Response types
export const memoryListResponseSchema = z.object({
  memories: z.array(memorySchema),
  total: z.number().int(),
  limit: z.number().int(),
});

export type MemoryListResponse = z.infer<typeof memoryListResponseSchema>;

export const emotionResponseSchema = z.object({
  current: emotionStateSchema.nullable(),
  history: z.array(emotionRecordSchema).optional(),
});

export type EmotionResponse = z.infer<typeof emotionResponseSchema>;

// Extract memories request
export const extractMemoriesSchema = z.object({
  chatId: z.string().uuid(),
  messageCount: z.number().int().min(1).max(50).optional(),
});

export type ExtractMemoriesInput = z.infer<typeof extractMemoriesSchema>;
