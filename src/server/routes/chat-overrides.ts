import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { chatOverrideRepository, chatRepository } from '../../db/repositories';
import { AppError } from '../../core/errors';

const app = new Hono();

// Validation schemas
const createOrUpdateOverrideSchema = z.object({
  overrides: z.record(z.any()),
  enabled: z.boolean().default(true),
  note: z.string().optional(),
});

const toggleOverrideSchema = z.object({
  enabled: z.boolean(),
});

/**
 * GET /api/v1/chats/:chatId/overrides
 * Get parameter overrides for a chat
 */
app.get('/:chatId/overrides', authMiddleware, async (c) => {
  const user = c.get('user');
  const { chatId } = c.req.param();

  // Verify chat ownership
  const chat = await chatRepository.findById(chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }
  if (chat.userId !== user.id) {
    throw new AppError('Forbidden', 403);
  }

  const override = await chatOverrideRepository.findByChatId(chatId);

  return c.json({
    success: true,
    data: override || null,
  });
});

/**
 * PUT /api/v1/chats/:chatId/overrides
 * Create or update parameter overrides for a chat
 */
app.put(
  '/:chatId/overrides',
  authMiddleware,
  zValidator('json', createOrUpdateOverrideSchema),
  async (c) => {
    const user = c.get('user');
    const { chatId } = c.req.param();
    const input = c.req.valid('json');

    // Verify chat ownership
    const chat = await chatRepository.findById(chatId);
    if (!chat) {
      throw new AppError('Chat not found', 404);
    }
    if (chat.userId !== user.id) {
      throw new AppError('Forbidden', 403);
    }

    const override = await chatOverrideRepository.createOrUpdate(chatId, input);

    return c.json({
      success: true,
      data: override,
    });
  }
);

/**
 * PATCH /api/v1/chats/:chatId/overrides/toggle
 * Enable or disable overrides
 */
app.patch(
  '/:chatId/overrides/toggle',
  authMiddleware,
  zValidator('json', toggleOverrideSchema),
  async (c) => {
    const user = c.get('user');
    const { chatId } = c.req.param();
    const { enabled } = c.req.valid('json');

    // Verify chat ownership
    const chat = await chatRepository.findById(chatId);
    if (!chat) {
      throw new AppError('Chat not found', 404);
    }
    if (chat.userId !== user.id) {
      throw new AppError('Forbidden', 403);
    }

    if (enabled) {
      await chatOverrideRepository.enable(chatId);
    } else {
      await chatOverrideRepository.disable(chatId);
    }

    const override = await chatOverrideRepository.findByChatId(chatId);

    return c.json({
      success: true,
      data: override,
    });
  }
);

/**
 * DELETE /api/v1/chats/:chatId/overrides
 * Delete parameter overrides for a chat
 */
app.delete('/:chatId/overrides', authMiddleware, async (c) => {
  const user = c.get('user');
  const { chatId } = c.req.param();

  // Verify chat ownership
  const chat = await chatRepository.findById(chatId);
  if (!chat) {
    throw new AppError('Chat not found', 404);
  }
  if (chat.userId !== user.id) {
    throw new AppError('Forbidden', 403);
  }

  await chatOverrideRepository.delete(chatId);

  return c.json({
    success: true,
    message: 'Override deleted',
  });
});

export default app;
