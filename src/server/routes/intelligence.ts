/**
 * Intelligence Routes
 *
 * API endpoints for character memory and emotion management
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { memoryService } from '../services/memory.service';
import { emotionService } from '../services/emotion.service';
import { memoryQuerySchema, extractMemoriesSchema, updateEmotionSchema } from '../../types/intelligence';
import type { ApiResponse } from '../../types/api';

export const intelligenceRoutes = new Hono();

// Get memories for a character
intelligenceRoutes.get(
  '/characters/:characterId/intelligence/memories',
  authMiddleware(),
  zValidator('query', memoryQuerySchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    const query = c.req.valid('query');

    let memories;
    if (query.query) {
      memories = await memoryService.retrieveMemories({
        characterId,
        userId: user.id,
        query: query.query,
        limit: query.limit,
      });
    } else {
      memories = await memoryService.getMemories(characterId, user.id, query.limit);
    }

    const total = await memoryService.getMemoryCount(characterId, user.id);

    return c.json<ApiResponse>({
      success: true,
      data: {
        memories,
        total,
        limit: query.limit,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// Delete a specific memory
intelligenceRoutes.delete(
  '/characters/:characterId/intelligence/memories/:memoryId',
  authMiddleware(),
  async (c) => {
    const memoryId = c.req.param('memoryId');
    await memoryService.deleteMemory(memoryId);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Memory deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// Clear all memories for a character
intelligenceRoutes.delete(
  '/characters/:characterId/intelligence/memories',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    await memoryService.clearAllMemories(characterId, user.id);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'All memories cleared successfully' },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// Extract memories from a chat
intelligenceRoutes.post(
  '/characters/:characterId/intelligence/extract-memories',
  authMiddleware(),
  zValidator('json', extractMemoriesSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    const { chatId } = c.req.valid('json');

    // This would need to fetch messages from the chat and extract memories
    // For now, return a placeholder response
    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Memory extraction initiated', characterId, chatId, userId: user.id },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// Get current emotion for a character
intelligenceRoutes.get(
  '/characters/:characterId/intelligence/emotion',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    const chatId = c.req.query('chatId');

    const current = await emotionService.getCurrentEmotion(characterId, user.id, chatId);
    const history = await emotionService.getEmotionHistory(characterId, user.id, 20);

    return c.json<ApiResponse>({
      success: true,
      data: {
        current,
        history,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// Update emotion manually (for testing/admin)
intelligenceRoutes.post(
  '/characters/:characterId/intelligence/emotion',
  authMiddleware(),
  zValidator('json', updateEmotionSchema),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    const chatId = c.req.query('chatId');
    const { valence, arousal } = c.req.valid('json');

    // Create a synthetic text to trigger emotion update
    const result = await emotionService.analyzeAndUpdate({
      characterId,
      userId: user.id,
      chatId,
      text: `Manual emotion update: valence=${valence}, arousal=${arousal}`,
    });

    return c.json<ApiResponse>({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  }
);

// Reset emotion for a character
intelligenceRoutes.delete(
  '/characters/:characterId/intelligence/emotion',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const characterId = c.req.param('characterId');
    await emotionService.resetEmotion(characterId, user.id);

    return c.json<ApiResponse>({
      success: true,
      data: { message: 'Emotion reset successfully' },
      meta: { timestamp: new Date().toISOString() },
    });
  }
);
