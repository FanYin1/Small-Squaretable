/**
 * 角色相关类型定义
 */

import { z } from 'zod';

export const createCharacterSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  avatarUrl: z.string().url().max(500).optional(),
  cardData: z.record(z.any()),
  tags: z.array(z.string()).optional(),
  category: z.string().max(50).optional(),
  isNsfw: z.boolean().default(false),
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  avatarUrl: z.string().url().max(500).optional(),
  cardData: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().max(50).optional(),
  isNsfw: z.boolean().optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
