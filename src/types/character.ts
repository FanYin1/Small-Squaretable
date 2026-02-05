/**
 * 角色相关类型定义
 */

import { z } from 'zod';

/**
 * Sanitized card data value type for SillyTavern character cards
 * Only allows safe JSON-serializable types
 * Note: SillyTavern cards can have very large fields (character_book, first_mes, etc.)
 */
const baseCardDataValueSchema = z.union([
  z.string().max(2000000), // Allow large strings for character_book, first_mes, etc.
  z.number(),
  z.boolean(),
  z.null(),
]);

type CardDataValue = z.infer<typeof baseCardDataValueSchema> | CardDataValue[] | { [key: string]: CardDataValue };

export const cardDataValueSchema: z.ZodType<CardDataValue> = z.lazy(() =>
  z.union([
    baseCardDataValueSchema,
    z.array(cardDataValueSchema),
    z.record(cardDataValueSchema),
  ])
);

export const createCharacterSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  // SillyTavern cards can have very long descriptions
  description: z.string().max(50000).trim().optional(),
  // Allow data URLs for base64 encoded images (can be very large for high-res images)
  // In production, consider using a file upload service instead
  avatarUrl: z.string().url().max(5000000).optional(),
  cardData: z.record(cardDataValueSchema).refine(
    (data) => Object.keys(data).length > 0,
    'cardData must not be empty'
  ),
  tags: z.array(z.string().max(50).trim()).max(20).optional(),
  category: z.string().max(50).trim().optional(),
  isNsfw: z.boolean().default(false),
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(50000).trim().optional(),
  avatarUrl: z.string().url().max(5000000).optional(),
  cardData: z.record(cardDataValueSchema).optional(),
  tags: z.array(z.string().max(50).trim()).max(20).optional(),
  category: z.string().max(50).trim().optional(),
  isNsfw: z.boolean().optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
