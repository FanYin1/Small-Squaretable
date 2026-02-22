/**
 * 聊天路由
 *
 * 提供聊天 CRUD 和消息管理的 API 端点
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { chatService } from '../services/chat.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
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

export const chatRoutes = new Hono();

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
    const chat = await chatService.create(user.id, user.tenantId, {
      characterId: primaryCharacterId,
      title: input.title,
      metadata: input.metadata,
    });

    // Insert into chat_characters for each character
    for (let i = 0; i < allCharacterIds.length; i++) {
      await groupChatService.addCharacter(chat.id, allCharacterIds[i], i);
    }

    eventBus.emit('chat.created', { chatId: chat.id, userId: user.id, characterId: primaryCharacterId });

    return c.json<ApiResponse>(
      {
        success: true,
        data: chat,
        meta: { timestamp: new Date().toISOString() },
      },
      201
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

    return c.json<ApiResponse<PaginatedResponse<Chat>>>(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      200
    );
  }
);

// 导出聊天
const exportQuerySchema = z.object({
  format: z.enum(['json', 'markdown', 'txt']).default('json'),
});

chatRoutes.get(
  '/:id/export',
  authMiddleware(),
  zValidator('query', exportQuerySchema),
  async (c) => {
    const user = c.get('user');
    const chatId = c.req.param('id');
    const { format } = c.req.valid('query');

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

    const allMessages = await messageRepository.findByChatId(chatId);
    const exportedAt = new Date().toISOString();
    const chatTitle = chat.title || 'Untitled';

    if (format === 'json') {
      const exportData = {
        chat: { id: chat.id, title: chatTitle, createdAt: chat.createdAt },
        messages: allMessages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.characterId ? { characterId: m.characterId } : {}),
          sentAt: m.sentAt,
        })),
        exportedAt,
      };
      c.header('Content-Disposition', `attachment; filename="chat-${chatId}.json"`);
      return c.json(exportData);
    }

    if (format === 'markdown') {
      const lines: string[] = [
        `# Chat: ${chatTitle}`,
        `Created: ${chat.createdAt.toISOString()}`,
        '',
        '---',
        '',
      ];
      for (const m of allMessages) {
        const label = m.role === 'user' ? 'You' : 'Assistant';
        lines.push(`**${label}**: ${m.content}`, '');
      }
      lines.push('---', `Exported at ${exportedAt}`);
      const body = lines.join('\n');
      return new Response(body, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="chat-${chatId}.md"`,
        },
      });
    }

    // txt format
    const lines: string[] = [
      `Chat: ${chatTitle}`,
      `Created: ${chat.createdAt.toISOString()}`,
      '---',
    ];
    for (const m of allMessages) {
      const label = m.role === 'user' ? 'You' : 'Assistant';
      lines.push(`[${label}]: ${m.content}`);
    }
    lines.push('---', `Exported at ${exportedAt}`);
    const body = lines.join('\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="chat-${chatId}.txt"`,
      },
    });
  }
);

// 获取单个聊天
chatRoutes.get('/:id', authMiddleware(), async (c) => {
  const user = c.get('user');
  const chatId = c.req.param('id');
  const chat = await chatService.getById(chatId, user.id, user.tenantId);

  return c.json<ApiResponse>(
    {
      success: true,
      data: chat,
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

    const message = await chatService.addMessage(chatId, input);


    eventBus.emit('chat.message.sent', { chatId, messageId: message.id, userId: user.id, role: input.role });

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
    const { content } = c.req.valid('json');

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

    const message = await chatService.editMessage(chatId, messageId, content, user.id, user.tenantId);

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
  after: z.coerce.number().int().optional(),
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
