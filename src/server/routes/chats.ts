/**
 * 聊天路由
 *
 * 提供聊天 CRUD 和消息管理的 API 端点
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { chatService } from '../services/chat.service';
import { authMiddleware } from '../middleware/auth';
import {
  createChatSchema,
  updateChatSchema,
  createMessageSchema,
} from '../../types/chat';
import { paginationSchema } from '../../types/api';
import type { ApiResponse, PaginatedResponse } from '../../types/api';
import type { Chat, Message } from '../../db/schema/chats';

export const chatRoutes = new Hono();

// 创建聊天
chatRoutes.post(
  '/',
  authMiddleware(),
  zValidator('json', createChatSchema),
  async (c) => {
    const user = c.get('user');
    const input = c.req.valid('json');
    const chat = await chatService.create(user.id, user.tenantId, input);

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
  zValidator('json', createMessageSchema),
  async (c) => {
    const chatId = c.req.param('id');
    const input = c.req.valid('json');
    const message = await chatService.addMessage(chatId, input);

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

// 获取聊天消息列表（游标分页）
chatRoutes.get('/:id/messages', authMiddleware(), async (c) => {
  const chatId = c.req.param('id');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 20;
  const before = c.req.query('before') ? parseInt(c.req.query('before')!) : undefined;
  const after = c.req.query('after') ? parseInt(c.req.query('after')!) : undefined;

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
