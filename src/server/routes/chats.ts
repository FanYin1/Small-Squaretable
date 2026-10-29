/**
 * 聊天路由
 *
 * 提供聊天 CRUD 和消息管理的 API 端点
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { storyIdentitySnapshotSchema } from '../../types/story-identity';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { chatService } from '../services/chat.service';
import { chatCreationService } from '../services/chat-creation.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { resolveStoryCharacter } from '../services/story-content.service';
import { getStoryState, getStoryEvents, getStoryEvent, addStoryNote, deleteStoryNote, saveStoryOpening } from '../services/story-state.service';
import { storyNoteSchema } from '../../types/story-state';
import { getStoryMemoryView } from '../services/story-memory-view.service';
import { exportStoryReading, renderStoryReading } from '../services/story-export.service';
import { userPersonaRepository } from '../../db/repositories/user-persona.repository';
import { groupChatService } from '../services/group-chat.service';
import { authMiddleware } from '../middleware/auth';
import { requireQuota } from '../middleware/feature-gate';
import {
  createChatSchema,
  updateChatSchema,
  createMessageSchema,
  updateMessageSchema,
} from '../../types/chat';
import { paginationSchema } from '../../types/api';
import type { ApiResponse, PaginatedResponse } from '../../types/api';
import type { Chat } from '../../db/schema/chats';
import { eventBus } from '../services/event-bus.service';
import { messageBookmarkRepository } from '../../db/repositories/message-bookmark.repository';
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';
import { getAvailableModels } from '../config/llm.config';
import { AppError } from '../../core/errors';
import { createLogger } from '../services/logger.service';
import { chatVariableStore } from '../services/chat-variable.service';
import { saveLegacyAssistantMessage } from '../services/legacy-variables.service';
import { applyMacros, createMacroContextWithVars } from '../services/macro.service';
import { meterUsage } from '../services/usage-meter';
import { featureService } from '../services/feature.service';
import { openingContent } from '../../types/story-opening';
import { storyCorrectionsService } from '../services/story-corrections.service';
import { branchInputSchema, branchCommitSchema, readingInputSchema } from '../../types/story-corrections';

const logger = createLogger({ service: 'chats-route' });

export const chatRoutes = new Hono();

chatRoutes.get('/:id/story-branches', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })), async (c) => {
  const user = c.get('user');
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, data: await storyCorrectionsService.family(c.req.param('id'), user.id, user.tenantId) });
});
chatRoutes.post('/:id/story-branches/preview', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })), zValidator('json', branchInputSchema), async (c) => {
  const user = c.get('user');
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, data: await storyCorrectionsService.preview(c.req.param('id'), user.id, user.tenantId, c.req.valid('json')) });
});
chatRoutes.post('/:id/story-branches', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })), zValidator('json', branchCommitSchema), async (c) => {
  const user = c.get('user');
  const { input, previewDigest } = c.req.valid('json');
  const result = await storyCorrectionsService.fork(c.req.param('id'), user.id, user.tenantId, input, previewDigest);
  return c.json({ success: true, data: { chatId: result.chat.id, created: result.created } }, result.created ? 201 : 200);
});
chatRoutes.get('/:id/story-readings', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })), async (c) => {
  const user = c.get('user');
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, data: await storyCorrectionsService.readings(c.req.param('id'), user.id, user.tenantId) });
});
chatRoutes.post('/:id/story-readings', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })), zValidator('json', readingInputSchema), async (c) => {
  const user = c.get('user');
  return c.json({ success: true, data: await storyCorrectionsService.saveReading(c.req.param('id'), user.id, user.tenantId, c.req.valid('json')) }, 201);
});
chatRoutes.delete('/:id/story-readings/:readingId', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid(), readingId: z.string().uuid() })), async (c) => {
  const user = c.get('user');
  const { id, readingId } = c.req.valid('param');
  await storyCorrectionsService.removeReading(id, user.id, user.tenantId, readingId);
  return c.json({ success: true });
});

chatRoutes.get('/:id/story-memory', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid() })),
  zValidator('query', z.object({ before: z.string().uuid().optional() })), async (c) => {
    const user = c.get('user');
    c.header('Cache-Control', 'no-store');
    return c.json({ success: true, data: await getStoryMemoryView(c.req.valid('param').id, user.id, user.tenantId, c.req.valid('query').before) });
  });

chatRoutes.get('/:id/story-state', authMiddleware(), async (c) => {
  const user = c.get('user');
  await chatService.getById(c.req.param('id'), user.id, user.tenantId);
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, data: await getStoryState(c.req.param('id'), user.id) });
});

chatRoutes.get('/:id/story-events', authMiddleware(), zValidator('query', z.object({ beforeVersion: z.coerce.number().int().positive().optional() })), async (c) => {
  const user = c.get('user');
  await chatService.getById(c.req.param('id'), user.id, user.tenantId);
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, data: await getStoryEvents(c.req.param('id'), user.id, c.req.valid('query').beforeVersion) });
});

chatRoutes.get('/:id/story-events/:eventId', authMiddleware(), zValidator('param', z.object({ id: z.string().uuid(), eventId: z.string().uuid() })), async (c) => {
  const user = c.get('user');
  const { id, eventId } = c.req.valid('param');
  await chatService.getById(id, user.id, user.tenantId);
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, data: await getStoryEvent(id, user.id, eventId) });
});

chatRoutes.post('/:id/story-notes', authMiddleware(), zValidator('json', storyNoteSchema), async (c) => {
  const user = c.get('user');
  await chatService.getById(c.req.param('id'), user.id, user.tenantId);
  return c.json({ success: true, data: await addStoryNote(c.req.param('id'), user.id, c.req.valid('json')) }, 201);
});

chatRoutes.delete('/:id/story-notes/:noteId', authMiddleware(), async (c) => {
  const user = c.get('user');
  await chatService.getById(c.req.param('id'), user.id, user.tenantId);
  await deleteStoryNote(c.req.param('id'), user.id, c.req.param('noteId'));
  return c.json({ success: true });
});

chatRoutes.get('/creation-requests/:requestId', authMiddleware(),
  zValidator('param', z.object({ requestId: z.string().uuid() })), async (c) => {
    const user = c.get('user');
    const { requestId } = c.req.valid('param');
    c.header('Cache-Control', 'no-store');
    return c.json<ApiResponse>({
      success: true,
      data: await chatCreationService.lookup(user.id, user.tenantId, requestId),
      meta: { timestamp: new Date().toISOString() },
    });
  });

// 创建聊天
chatRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createChatSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');

    // Resolve the list of character IDs (backwards compatible)
    const allCharacterIds: string[] = input.characterIds
      ? input.characterIds
      : input.characterId
        ? [input.characterId]
        : [];

    // Set characterId to the first character for backwards compatibility
    const primaryCharacterId = allCharacterIds[0];
    const { chat, created } = await chatCreationService.create(user.id, user.tenantId, {
      ...input, clientRequestId: input.clientRequestId ?? randomUUID(),
    }, async () => {
      const quota = await featureService.checkQuota(user.tenantId, 'messages');
      if (!quota.allowed) throw new AppError('You have exceeded your messages quota', 403, 'QUOTA_EXCEEDED');
    });

    if (created && input.opening && input.opening.reference.source !== 'none') {
      await meterUsage(user.tenantId, 'messages', 1, { transport: 'http', chatId: chat.id, role: 'assistant' });
    }

    if (created) eventBus.emit('chat.created', { chatId: chat.id, userId: user.id, characterId: primaryCharacterId });

    // Fire-and-forget: increment character growth for new chat
    if (created && primaryCharacterId) {
      characterGrowthRepository.getOrCreate(primaryCharacterId, user.id)
        .then((growth) => characterGrowthRepository.incrementChats(growth.id))
        .catch((err) => logger.warn('Failed to increment chat growth', { error: err }));
    }

    // Enrich with character info
    let characterName: string | null = null;
    let characterAvatar: string | null = null;
    if (chat.contentSnapshotVersion != null) {
      const saved = await resolveStoryCharacter(chat, primaryCharacterId);
      characterName = saved?.name ?? null;
      characterAvatar = saved?.avatarUrl ?? null;
    } else if (primaryCharacterId) {
      const charRow = await db
        .select({ name: characters.name, avatarUrl: characters.avatarUrl })
        .from(characters)
        .where(eq(characters.id, primaryCharacterId));
      if (charRow[0]) {
        characterName = charRow[0].name;
        characterAvatar = charRow[0].avatarUrl;
      }
    }

    return c.json<ApiResponse>(
      {
        success: true,
        data: { ...chat, characterName, characterAvatar },
        meta: { timestamp: new Date().toISOString() },
      },
      created ? 201 : 200
    );
  }
);

// 获取用户的聊天列表
chatRoutes.get(
  '/',
  authMiddleware(),
  zValidator('query', paginationSchema),
  async (c) => {
    const user = c.get('user');
    const pagination = c.req.valid('query');
    const result = await chatService.getByUserId(user.id, pagination);

    // Enrich chats with character name/avatar
    const characterIds = [...new Set(result.items.map(ch => ch.characterId).filter(Boolean))] as string[];
    const charMap = new Map<string, { name: string; avatarUrl: string | null }>();
    if (characterIds.length > 0) {
      const charRows = await db
        .select({ id: characters.id, name: characters.name, avatarUrl: characters.avatarUrl })
        .from(characters)
        .where(sql`${characters.id} IN ${characterIds}`);
      for (const row of charRows) {
        charMap.set(row.id, { name: row.name, avatarUrl: row.avatarUrl });
      }
    }
    const enrichedItems = await Promise.all(result.items.map(async ch => {
      const character = ch.contentSnapshotVersion != null ? await resolveStoryCharacter(ch, ch.characterId)
        : ch.characterId ? charMap.get(ch.characterId) : null;
      return { ...ch, characterName: character?.name ?? null, characterAvatar: character?.avatarUrl ?? null };
    }));

    return c.json<ApiResponse<PaginatedResponse<Chat>>>(
      {
        success: true,
        data: { ...result, items: enrichedItems },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// GET /:id/export — Export chat history
const exportChatSchema = z.object({
  format: z.enum(['json', 'txt', 'markdown']).default('json'),
});

chatRoutes.get('/:id/export', authMiddleware(), zValidator('query', exportChatSchema), async (c) => {
  const user = c.get('user') as { id: string; tenantId: string };
  const { id } = c.req.param();
  const { format } = c.req.valid('query');
  c.header('Cache-Control', 'no-store');

  try {
    const record = await exportStoryReading(id, user.id, user.tenantId);
    const safeName = (record.chat.title || 'story').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    const extension = format === 'markdown' ? 'md' : format;
    const contentType = format === 'json' ? 'application/json' : format === 'markdown' ? 'text/markdown' : 'text/plain';
    c.header('Content-Type', `${contentType}; charset=utf-8`);
    c.header('Content-Disposition', `attachment; filename="${safeName}.${extension}"`);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(format === 'json' ? JSON.stringify(record, null, 2) : renderStoryReading(record, format));
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Failed to export chat', { error: String(error), chatId: id });
    return c.json({ success: false, error: { code: 'EXPORT_ERROR', message: 'Failed to export chat' } }, 500);
  }
});

// 获取用户的书签列表 (must be before /:id to avoid matching "bookmarks" as id)
const bookmarkListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

chatRoutes.get(
  '/bookmarks',
  authMiddleware(),
  zValidator('query', bookmarkListQuerySchema),
  async (c) => {
    const user = c.get('user');
    const { limit, offset } = c.req.valid('query');

    const bookmarks = await messageBookmarkRepository.findByUser(user.id, limit, offset);

    return c.json<ApiResponse>(
      {
        success: true,
        data: bookmarks,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// POST /:id/summary — Generate conversation summary
chatRoutes.post('/:id/summary', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');

  const chat = await chatRepository.findById(chatId);
  if (!chat || chat.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  try {
    const summary = await chatService.generateSummary(chatId, user.id);
    return c.json<ApiResponse>(
      {
        success: true,
        data: { summary },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  } catch (error) {
    if (error instanceof AppError && error.code === 'NO_MESSAGES') {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NO_MESSAGES', message: 'No messages to summarize' },
          meta: { timestamp: new Date().toISOString() },
        },
        400
      );
    }
    throw error;
  }
});

// GET /:id/summary — Get stored conversation summary
chatRoutes.get('/:id/summary', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');

  const chat = await chatRepository.findById(chatId);
  if (!chat || chat.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: { summary: chat.summary || null },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 获取单个聊天
chatRoutes.get('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const chat = await chatService.getById(chatId, user.id, user.tenantId);

  // Enrich with character info
  let characterName: string | null = null;
  let characterAvatar: string | null = null;
  if (chat.contentSnapshotVersion != null) {
    const saved = await resolveStoryCharacter(chat, chat.characterId);
    characterName = saved?.name ?? null;
    characterAvatar = saved?.avatarUrl ?? null;
  } else if (chat.characterId) {
    const charRow = await db
      .select({ name: characters.name, avatarUrl: characters.avatarUrl })
      .from(characters)
      .where(eq(characters.id, chat.characterId));
    if (charRow[0]) {
      characterName = charRow[0].name;
      characterAvatar = charRow[0].avatarUrl;
    }
  }

  return c.json<ApiResponse>(
    {
      success: true,
      data: { ...chat, characterName, characterAvatar },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新聊天
chatRoutes.patch(
  '/:id',
  authMiddleware(),
  zValidator('json', updateChatSchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const input = c.req.valid('json');
    const chat = await chatService.update(chatId, user.id, user.tenantId, input);

    return c.json<ApiResponse>(
      {
        success: true,
        data: chat,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 删除聊天
chatRoutes.delete('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  await chatService.delete(chatId, user.id, user.tenantId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Chat deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 更新聊天模型选择
const updateModelSchema = z.object({
  model: z.string().min(1),
});

chatRoutes.patch(
  '/:id/model',
  authMiddleware(),
  zValidator('json', updateModelSchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const { model } = c.req.valid('json');

    // Verify the chat belongs to the user
    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    // Verify the model is available
    const availableModels = getAvailableModels();
    if (!availableModels.includes(model)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Model '${model}' is not available` },
          meta: { timestamp: new Date().toISOString() },
        },
        400
      );
    }

    // Merge model into existing metadata
    const existingMetadata = (chat.metadata as Record<string, unknown>) || {};
    const updatedChat = await chatRepository.update(chatId, chat.tenantId, {
      metadata: { ...existingMetadata, model },
    });

    if (!updatedChat) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    return c.json<ApiResponse>(
      {
        success: true,
        data: updatedChat,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 发送消息
chatRoutes.post(
  '/:id/messages',
  authMiddleware(),
  requireQuota('messages'),
  zValidator('json', createMessageSchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const input = c.req.valid('json');

    // IDOR fix: verify the chat belongs to the authenticated user
    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    if (chat.contentSnapshotVersion != null) {
      const character = await resolveStoryCharacter(chat, chat.characterId);
      const card = character?.cardData as Record<string, unknown> | undefined;
      const savedOpening = character && 'opening' in character ? character.opening : undefined;
      const greetings = savedOpening && card ? [openingContent(card, savedOpening.reference)]
        : [card?.first_mes, ...(Array.isArray(card?.alternate_greetings) ? card.alternate_greetings : [])];
      if (input.role !== 'assistant' || input.parentMessageId || !greetings.includes(input.content)) {
        throw new AppError('Continue this story through the live connection. Historical corrections are not enabled.', 409, 'STORY_HISTORY_FIXED');
      }
      input.extra = undefined;
    }

    // Apply macro expansion on assistant messages (e.g. first_mes greetings with {{char}}, {{user}})
    if (input.role === 'assistant' && (chat.characterId || chat.contentSnapshotVersion != null)) {
      const character = await resolveStoryCharacter(chat, chat.characterId);
      if (character) {
        // Fetch persona if personaId exists
        let userName = user.displayName || 'User';
        if (chat.identitySnapshot != null) {
          userName = storyIdentitySnapshotSchema.parse(chat.identitySnapshot).name;
        } else if (chat.personaId) {
          const persona = await userPersonaRepository.findById(chat.personaId);
          if (persona && persona.userId === user.id) {
            userName = persona.name;
          }
        }

        const cardData = (character.cardData || {}) as Record<string, string>;
        const macroCtx = await createMacroContextWithVars(
          {
            charName: character.name,
            userName,
            personality: cardData.personality || '',
            scenario: cardData.scenario || '',
            description: character.description || '',
            mesExamples: cardData.mes_example || '',
          },
          chatId,
          user.id,
        );
        input.content = applyMacros(input.content, macroCtx);
      }
    }

    const opening = chat.contentSnapshotVersion != null ? await saveStoryOpening(chatId, user.id, input.content) : null;
    if (opening && !opening.created) return c.json({ success: true, data: opening.message }, 201);
    const message = opening?.message ?? (input.role === 'assistant' && chat.contentSnapshotVersion == null
      ? await saveLegacyAssistantMessage({ chatId, ...input })
      : input.parentMessageId
      ? await messageRepository.createWithParent({
          chatId,
          role: input.role,
          content: input.content,
          attachments: input.attachments,
          parentMessageId: input.parentMessageId,
        })
      : await chatService.addMessage(chatId, input));

    // 计量放在消息确实落库之后：先记账再写库的话，写库失败会留下幻影用量。
    // 上面的 requireQuota 只是读累计值，不写；两者必须成对出现，否则
    // messages 的用量恒为 0，gate 永远不会拒绝。
    // await 但不影响响应——meterUsage 内部吞掉失败并记 error 日志。
    await meterUsage(user.tenantId, 'messages', 1, {
      transport: 'http',
      chatId,
      role: input.role,
    });

    eventBus.emit('chat.message.sent', { chatId, messageId: message.id, userId: user.id, role: input.role });

    // Fire-and-forget: increment character growth for new message
    if (chat.characterId) {
      characterGrowthRepository.getOrCreate(chat.characterId, user.id)
        .then((growth) => characterGrowthRepository.incrementMessages(growth.id))
        .catch((err) => logger.warn('Failed to increment message growth', { error: err }));
    }

    return c.json<ApiResponse>(
      {
        success: true,
        data: message,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// 删除单条消息
chatRoutes.delete('/:id/messages/:messageId', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const messageId = parseInt(c.req.param('messageId'));

  if (isNaN(messageId)) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid message ID' },
        meta: { timestamp: new Date().toISOString() },
      },
      400
    );
  }

  await chatService.deleteMessage(chatId, messageId, user.id, user.tenantId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Message deleted successfully' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 编辑消息
chatRoutes.patch(
  '/:id/messages/:messageId',
  authMiddleware(),
  zValidator('json', updateMessageSchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const messageId = parseInt(c.req.param('messageId'));
    const updates = c.req.valid('json');

    if (isNaN(messageId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid message ID' },
          meta: { timestamp: new Date().toISOString() },
        },
        400
      );
    }

    const message = await chatService.editMessage(chatId, messageId, updates, user.id, user.tenantId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: message,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 搜索聊天消息
const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

chatRoutes.get(
  '/:id/messages/search',
  authMiddleware(),
  zValidator('query', searchQuerySchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const { q, limit } = c.req.valid('query');

    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const results = await messageRepository.searchByChatId(chatId, q, limit);

    return c.json<ApiResponse>(
      {
        success: true,
        data: results,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
});

// 获取聊天消息列表（游标分页）
chatRoutes.get(
  '/:id/messages',
  authMiddleware(),
  zValidator('query', messagesQuerySchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const { limit, before, after } = c.req.valid('query');

  // IDOR fix: verify the chat belongs to the authenticated user
  const chat = await chatRepository.findById(chatId);
  if (!chat || chat.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  const messages = await chatService.getMessages(chatId, {
    limit,
    before,
    after,
  });

  return c.json<ApiResponse>(
    {
      success: true,
      data: messages,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 会话回滚
const rollbackSchema = z.object({
  messageId: z.number().int().positive(),
});

chatRoutes.post(
  '/:id/rollback',
  authMiddleware(),
  zValidator('json', rollbackSchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const { messageId } = c.req.valid('json');

    const ownedStory = await chatService.getById(chatId, user.id, user.tenantId);
    if (ownedStory.contentSnapshotVersion != null) throw new AppError('History rollback requires a matching state checkpoint and is not enabled for this story.', 409, 'STORY_HISTORY_FIXED');

    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const msg = await messageRepository.findById(messageId);
    if (!msg || msg.chatId !== chatId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Message not found in this chat' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const deletedCount = await messageRepository.deleteAfter(chatId, messageId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: { deletedCount },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 获取消息分支（兄弟消息）
chatRoutes.get(
  '/:id/branches/:messageId',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const messageId = parseInt(c.req.param('messageId'));

    if (isNaN(messageId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid message ID' },
          meta: { timestamp: new Date().toISOString() },
        },
        400
      );
    }

    // Verify chat ownership
    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    const siblings = await messageRepository.findSiblings(messageId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: siblings,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// --- Group chat character management ---

const addCharacterSchema = z.object({
  characterId: z.string().uuid(),
});

// 获取聊天中的角色列表
chatRoutes.get('/:id/characters', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');

  const chat = await chatRepository.findById(chatId);
  if (!chat || chat.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  const characters = await groupChatService.getChatCharacters(chatId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: characters,
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// 添加角色到聊天
chatRoutes.post(
  '/:id/characters',
  authMiddleware(),
  zValidator('json', addCharacterSchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const { characterId } = c.req.valid('json');

    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    // Enforce max character count (8)
    const existing = await groupChatService.getChatCharacters(chatId);
    if (existing.length >= 8) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'LIMIT_EXCEEDED', message: 'Maximum 8 characters per group chat' },
          meta: { timestamp: new Date().toISOString() },
        },
        400
      );
    }

    const result = await groupChatService.addCharacter(chatId, characterId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// 从聊天中移除角色
chatRoutes.delete('/:id/characters/:characterId', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const characterId = c.req.param('characterId');

  const chat = await chatRepository.findById(chatId);
  if (!chat || chat.userId !== user.id) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat not found' },
        meta: { timestamp: new Date().toISOString() },
      },
      404
    );
  }

  // Prevent removing the last character from a group chat
  const currentCharacters = await groupChatService.getChatCharacters(chatId);
  if (currentCharacters.length <= 1) {
    return c.json<ApiResponse>(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot remove the last character from a chat' },
        meta: { timestamp: new Date().toISOString() },
      },
      400
    );
  }

  await groupChatService.removeCharacter(chatId, characterId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: { message: 'Character removed from chat' },
      meta: { timestamp: new Date().toISOString() },
    },
    200
  );
});

// --- Group chat strategy ---

const groupStrategySchema = z.object({
  strategy: z.enum(['round_robin', 'all', 'random']),
});

chatRoutes.patch(
  '/:id/group-strategy',
  authMiddleware(),
  zValidator('json', groupStrategySchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const { strategy } = c.req.valid('json');

    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    await groupChatService.setStrategy(chatId, strategy);
    return c.json<ApiResponse>(
      {
        success: true,
        data: { strategy },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// --- Message bookmarks ---

// ブックマーク作成
chatRoutes.post(
  '/:id/messages/:messageId/bookmark',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const messageId = Number(c.req.param('messageId'));

    if (isNaN(messageId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid message ID' },
          meta: { timestamp: new Date().toISOString() },
        },
        400
      );
    }

    // Verify chat ownership
    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== user.id) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Chat not found' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    // Verify message belongs to chat
    const msg = await messageRepository.findById(messageId);
    if (!msg || msg.chatId !== chatId) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Message not found in this chat' },
          meta: { timestamp: new Date().toISOString() },
        },
        404
      );
    }

    // Check if already bookmarked
    const existing = await messageBookmarkRepository.findByMessage(user.id, messageId);
    if (existing) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'CONFLICT', message: 'Message already bookmarked' },
          meta: { timestamp: new Date().toISOString() },
        },
        409
      );
    }

    let note: string | undefined;
    try {
      const body = await c.req.json();
      if (body && typeof body.note === 'string') {
        note = body.note;
      }
    } catch {
      // No body or invalid JSON — that's fine, note is optional
    }

    const bookmark = await messageBookmarkRepository.create({
      userId: user.id,
      messageId,
      note,
    });

    return c.json<ApiResponse>(
      {
        success: true,
        data: bookmark,
        meta: { timestamp: new Date().toISOString() },
      },
      201
    );
  }
);

// ブックマーク削除
chatRoutes.delete(
  '/:id/messages/:messageId/bookmark',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const messageId = Number(c.req.param('messageId'));

    if (isNaN(messageId)) {
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid message ID' },
          meta: { timestamp: new Date().toISOString() },
        },
        400
      );
    }

    await messageBookmarkRepository.deleteByMessage(user.id, messageId);

    return c.json<ApiResponse>(
      {
        success: true,
        data: { message: 'Bookmark removed' },
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// --- Message reactions ---

// Toggle reaction (add if not exists, remove if exists)
chatRoutes.post('/:id/messages/:messageId/reactions', authMiddleware(), async (c) => {
  const user = c.get('user') as { id: string };
  const messageId = c.req.param('messageId');
  const { emoji } = await c.req.json();

  if (!emoji || typeof emoji !== 'string') {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'emoji is required' },
      meta: { timestamp: new Date().toISOString() },
    }, 400);
  }

  const existing = await db.select().from(messageReactions)
    .where(and(
      eq(messageReactions.messageId, Number(messageId)),
      eq(messageReactions.userId, user.id),
      eq(messageReactions.emoji, emoji),
    )).limit(1);

  if (existing.length > 0) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing[0].id));
    return c.json<ApiResponse>({ success: true, data: { action: 'removed' }, meta: { timestamp: new Date().toISOString() } });
  } else {
    await db.insert(messageReactions).values({
      messageId: Number(messageId),
      userId: user.id,
      emoji,
    });
    return c.json<ApiResponse>({ success: true, data: { action: 'added' }, meta: { timestamp: new Date().toISOString() } });
  }
});

// Get grouped reactions for a message
chatRoutes.get('/:id/messages/:messageId/reactions', authMiddleware(), async (c) => {
  const messageId = c.req.param('messageId');
  const reactions = await db.select().from(messageReactions)
    .where(eq(messageReactions.messageId, Number(messageId)));

  const grouped: Record<string, { emoji: string; count: number; userIds: string[] }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].userIds.push(r.userId);
  }

  return c.json<ApiResponse>({
    success: true,
    data: Object.values(grouped),
    meta: { timestamp: new Date().toISOString() },
  });
});

// --- Message pinning ---

// Pin a message
chatRoutes.post('/:id/messages/:messageId/pin', authMiddleware(), async (c) => {
  const messageId = c.req.param('messageId');

  const msg = await db.select({ id: messagesTable.id, extra: messagesTable.extra })
    .from(messagesTable)
    .where(eq(messagesTable.id, Number(messageId)))
    .limit(1);

  if (!msg.length) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Message not found' },
      meta: { timestamp: new Date().toISOString() },
    }, 404);
  }

  const existingExtra = (msg[0].extra as Record<string, unknown>) || {};
  await db.update(messagesTable)
    .set({ extra: { ...existingExtra, pinned: true } })
    .where(eq(messagesTable.id, Number(messageId)));

  return c.json<ApiResponse>({
    success: true,
    data: { pinned: true },
    meta: { timestamp: new Date().toISOString() },
  });
});

// Unpin a message
chatRoutes.delete('/:id/messages/:messageId/pin', authMiddleware(), async (c) => {
  const messageId = c.req.param('messageId');

  const msg = await db.select({ id: messagesTable.id, extra: messagesTable.extra })
    .from(messagesTable)
    .where(eq(messagesTable.id, Number(messageId)))
    .limit(1);

  if (!msg.length) {
    return c.json<ApiResponse>({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Message not found' },
      meta: { timestamp: new Date().toISOString() },
    }, 404);
  }

  const existingExtra = (msg[0].extra as Record<string, unknown>) || {};
  const { pinned, ...rest } = existingExtra;
  await db.update(messagesTable)
    .set({ extra: Object.keys(rest).length > 0 ? rest : null })
    .where(eq(messagesTable.id, Number(messageId)));

  return c.json<ApiResponse>({
    success: true,
    data: { pinned: false },
    meta: { timestamp: new Date().toISOString() },
  });
});

// List pinned messages in a chat
chatRoutes.get('/:id/pinned', authMiddleware(), async (c) => {
  const chatId = c.req.param('id');

  const pinned = await db.select()
    .from(messagesTable)
    .where(and(
      eq(messagesTable.chatId, chatId),
      sql`${messagesTable.extra}->>'pinned' = 'true'`,
    ))
    .orderBy(messagesTable.sentAt);

  return c.json<ApiResponse>({
    success: true,
    data: pinned,
    meta: { timestamp: new Date().toISOString() },
  });
});

// --- Chat snapshot endpoints ---

import crypto from 'crypto';
import { db } from '../../db';
import { eq, and, sql } from 'drizzle-orm';
import { messages as messagesTable } from '../../db/schema/chats';
import { chatSnapshots } from '../../db/schema/chat-snapshots';
import { characters } from '../../db/schema/characters';
import { messageReactions } from '../../db/schema/message-reactions';

const createSnapshotSchema = z.object({
  title: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

// POST /:id/snapshot — Create a chat snapshot
chatRoutes.post(
  '/:id/snapshot',
  authMiddleware(),
  zValidator('json', createSnapshotSchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const body = c.req.valid('json');

    try {
      // Verify chat ownership
      const chat = await chatRepository.findById(chatId);
      if (!chat || chat.userId !== user.id) {
        return c.json<ApiResponse>(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Chat not found' },
            meta: { timestamp: new Date().toISOString() },
          },
          404,
        );
      }

      // Fetch all messages
      const allMessages = await messageRepository.findByChatId(chatId);

      // Get character info
      let characterName: string | null = null;
      let characterAvatar: string | null = null;
      if (chat.contentSnapshotVersion != null) {
        const saved = await resolveStoryCharacter(chat, chat.characterId);
        characterName = saved?.name ?? null;
        characterAvatar = saved?.avatarUrl ?? null;
      } else if (chat.characterId) {
        const charResult = await db
          .select({ name: characters.name, avatarUrl: characters.avatarUrl })
          .from(characters)
          .where(eq(characters.id, chat.characterId));
        if (charResult[0]) {
          characterName = charResult[0].name;
          characterAvatar = charResult[0].avatarUrl;
        }
      }

      const shareToken = crypto.randomBytes(32).toString('hex');

      const [snapshot] = await db
        .insert(chatSnapshots)
        .values({
          chatId,
          userId: user.id,
          shareToken,
          title: body.title || chat.title || 'Untitled Snapshot',
          messages: allMessages,
          messageCount: allMessages.length,
          characterName,
          characterAvatar,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        })
        .returning();

      return c.json<ApiResponse>(
        {
          success: true,
          data: snapshot,
          meta: { timestamp: new Date().toISOString() },
        },
        201,
      );
    } catch (error) {
      logger.error('Failed to create chat snapshot', { error: String(error), chatId });
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to create snapshot' },
          meta: { timestamp: new Date().toISOString() },
        },
        500,
      );
    }
  },
);

// GET /:id/snapshots — List snapshots for a chat
chatRoutes.get(
  '/:id/snapshots',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');

    try {
      // Verify chat ownership
      const chat = await chatRepository.findById(chatId);
      if (!chat || chat.userId !== user.id) {
        return c.json<ApiResponse>(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Chat not found' },
            meta: { timestamp: new Date().toISOString() },
          },
          404,
        );
      }

      const snapshots = await db
        .select()
        .from(chatSnapshots)
        .where(eq(chatSnapshots.chatId, chatId));

      return c.json<ApiResponse>(
        {
          success: true,
          data: snapshots,
          meta: { timestamp: new Date().toISOString() },
        },
        200,
      );
    } catch (error) {
      logger.error('Failed to list chat snapshots', { error: String(error), chatId });
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to list snapshots' },
          meta: { timestamp: new Date().toISOString() },
        },
        500,
      );
    }
  },
);

// DELETE /snapshots/:snapshotId — Delete a snapshot
chatRoutes.delete(
  '/snapshots/:snapshotId',
  authMiddleware(),
  async (c) => {
    const user = c.get('user');
    const snapshotId = c.req.param('snapshotId');

    try {
      const result = await db
        .select()
        .from(chatSnapshots)
        .where(eq(chatSnapshots.id, snapshotId));

      const snapshot = result[0];
      if (!snapshot || snapshot.userId !== user.id) {
        return c.json<ApiResponse>(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Snapshot not found' },
            meta: { timestamp: new Date().toISOString() },
          },
          404,
        );
      }

      await db
        .delete(chatSnapshots)
        .where(eq(chatSnapshots.id, snapshotId));

      return c.json<ApiResponse>(
        {
          success: true,
          data: { message: 'Snapshot deleted successfully' },
          meta: { timestamp: new Date().toISOString() },
        },
        200,
      );
    } catch (error) {
      logger.error('Failed to delete snapshot', { error: String(error), snapshotId });
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to delete snapshot' },
          meta: { timestamp: new Date().toISOString() },
        },
        500,
      );
    }
  },
);

// ─── Chat Variables ─────────────────────────────────────────────────────────

/**
 * GET /:id/variables — Get all chat variables for a chat session.
 * Used by the ERA bridge to fetch variable state for status bar iframes.
 */
chatRoutes.get(
  '/:id/variables',
  authMiddleware(),
  async (c) => {
    const chatId = c.req.param('id');
    const user = c.get('user' as never) as { id: string };

    try {
      const chat = await chatRepository.findById(chatId);
      if (!chat || chat.userId !== user.id) {
        return c.json<ApiResponse>(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Chat not found' },
            meta: { timestamp: new Date().toISOString() },
          },
          404,
        );
      }

      const variables = await chatVariableStore.getChatVars(chatId);
      return c.json<ApiResponse>(
        {
          success: true,
          data: { variables },
          meta: { timestamp: new Date().toISOString() },
        },
        200,
      );
    } catch (error) {
      logger.error('Failed to get chat variables', { error: String(error), chatId });
      return c.json<ApiResponse>(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to get chat variables' },
          meta: { timestamp: new Date().toISOString() },
        },
        500,
      );
    }
  },
);
