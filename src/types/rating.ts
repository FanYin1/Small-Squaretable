/**
 * 评分相关类型定义
 */

import { z } from 'zod';

/**
 * 评分输入验证 Schema
 */
export const ratingInputSchema = z.object({
  quality: z.number().int().min(1).max(5),
  creativity: z.number().int().min(1).max(5),
  interactivity: z.number().int().min(1).max(5),
  accuracy: z.number().int().min(1).max(5),
  entertainment: z.number().int().min(1).max(5),
});

export type RatingInputDto = z.infer<typeof ratingInputSchema>;

/**
 * 评分响应类型
 */
export interface RatingResponseDto {
  overall: string | null;
  dimensions: {
    quality: string | null;
    creativity: string | null;
    interactivity: string | null;
    accuracy: string | null;
    entertainment: string | null;
  };
  count: number;
  userRating: {
    quality: number;
    creativity: number;
    interactivity: number;
    accuracy: number;
    entertainment: number;
  } | null;
}
