/**
 * POST /api/v1/chats/:id/messages 的用量计量测试
 *
 * 这条路由挂了 requireQuota('messages')，但历史上从来没有往 usage 表写过。
 * 于是 messages 的累计用量恒为 0，gate 永远放行，套餐上限形同虚设。
 * 这组测试守的就是「gate 和计量必须成对出现」。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// --- Mocks (must precede chatRoutes import) ---

vi.mock('../services/chat.service', () => ({
  chatService: { addMessage: vi.fn() },
}));

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: { findById: vi.fn(), update: vi.fn() },
}));

vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: {
    findById: vi.fn(),
    findByChatId: vi.fn(),
    findSiblings: vi.fn(),
    searchByChatId: vi.fn(),
    deleteAfter: vi.fn(),
    createWithParent: vi.fn(),
  },
}));

vi.mock('../../db/repositories/message-bookmark.repository', () => ({
  messageBookmarkRepository: {
    findByUser: vi.fn(),
    findByMessage: vi.fn(),
    create: vi.fn(),
    deleteByMessage: vi.fn(),
  },
}));

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/user-persona.repository', () => ({
  userPersonaRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/chat-character.repository', () => ({
  chatCharacterRepository: { findByChatId: vi.fn() },
}));

vi.mock('../../db/repositories/character-growth.repository', () => ({
  characterGrowthRepository: {
    getOrCreate: vi.fn().mockResolvedValue({ id: 'g1' }),
    incrementChats: vi.fn(),
    incrementMessages: vi.fn(),
  },
}));

vi.mock('../services/event-bus.service', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../services/group-chat.service', () => ({
  groupChatService: {
    addCharacter: vi.fn(),
    removeCharacter: vi.fn(),
    getChatCharacters: vi.fn().mockResolvedValue([]),
    isGroupChat: vi.fn().mockResolvedValue(false),
    setStrategy: vi.fn(),
  },
}));

vi.mock('../config/llm.config', () => ({
  getAvailableModels: vi.fn().mockReturnValue(['gpt-4']),
}));

vi.mock('../services/logger.service', () => {
  const fn = vi.fn;
  const child = { info: fn(), warn: fn(), error: fn(), debug: fn() };
  const log = { info: fn(), warn: fn(), error: fn(), debug: fn(), child: fn().mockReturnValue(child) };
  return { createLogger: () => log, logger: log };
});

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../db/schema/chat-snapshots', () => ({ chatSnapshots: {} }));
vi.mock('../../db/schema/characters', () => ({ characters: {} }));
vi.mock('../../db/schema/message-reactions', () => ({ messageReactions: {} }));
vi.mock('../../db/schema/chats', () => ({
  messages: { id: 'id', extra: 'extra', chatId: 'chatId', sentAt: 'sentAt' },
  chats: {},
  messageRoleEnum: {},
}));

vi.mock('../../core/jwt', () => ({
  verifyAccessToken: vi.fn(),
  extractTokenFromHeader: vi.fn((header: string) => {
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice(7);
  }),
}));

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: vi.fn() },
}));

// 真实的 usage.service 会打 Postgres；这里只 mock 到 service 边界，
// 让 meterUsage 的逻辑本身仍然走真实代码
vi.mock('../services/usage.service', () => ({
  usageService: { checkQuota: vi.fn(), trackUsage: vi.fn() },
}));

// --- Imports (after mocks) ---

import { chatRoutes } from './chats';
import { chatService } from '../services/chat.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { userRepository } from '../../db/repositories/user.repository';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { usageService } from '../services/usage.service';
import { verifyAccessToken } from '../../core/jwt';

const TENANT = 'tenant-123';

function postMessage(app: Hono, body: Record<string, unknown>) {
  return app.request('/api/v1/chats/chat-123/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/chats/:id/messages — usage metering', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/api/v1/chats', chatRoutes);

    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: 'user-123',
      tenantId: TENANT,
      email: 'test@example.com',
    } as never);
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user-123',
      tenantId: TENANT,
      email: 'test@example.com',
      isActive: true,
    } as never);
    vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue({
      id: 'sub-1',
      tenantId: TENANT,
      plan: 'free',
      status: 'active',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(usageService.checkQuota).mockResolvedValue({
      resourceType: 'messages',
      currentUsage: 5,
      period: '2026-01',
    } as never);
    vi.mocked(usageService.trackUsage).mockResolvedValue({} as never);
    vi.mocked(chatRepository.findById).mockResolvedValue({
      id: 'chat-123',
      userId: 'user-123',
      tenantId: TENANT,
      characterId: null,
      metadata: {},
    } as never);
    vi.mocked(chatService.addMessage).mockResolvedValue({
      id: 1,
      chatId: 'chat-123',
      role: 'user',
      content: 'Hello',
    } as never);
  });

  it('records one message against the tenant quota', async () => {
    const res = await postMessage(app, { role: 'user', content: 'Hello' });

    expect(res.status).toBe(201);
    expect(usageService.trackUsage).toHaveBeenCalledWith(
      TENANT,
      'messages',
      1,
      expect.objectContaining({ transport: 'http' })
    );
  });

  it('records exactly one increment per request', async () => {
    await postMessage(app, { role: 'user', content: 'Hello' });

    const messageCalls = vi
      .mocked(usageService.trackUsage)
      .mock.calls.filter((call) => call[1] === 'messages');
    expect(messageCalls).toHaveLength(1);
  });

  // 助手消息也要计量：HTTP 回退路径下用户消息和助手消息是两次独立的 POST，
  // 只算用户那条的话，同一段对话在 HTTP 上消耗的配额会是 WebSocket 的一半
  it('records assistant messages too, not just user messages', async () => {
    vi.mocked(chatService.addMessage).mockResolvedValue({
      id: 2,
      chatId: 'chat-123',
      role: 'assistant',
      content: 'Hi there',
    } as never);

    const res = await postMessage(app, { role: 'assistant', content: 'Hi there' });

    expect(res.status).toBe(201);
    expect(usageService.trackUsage).toHaveBeenCalledWith(
      TENANT,
      'messages',
      1,
      expect.anything()
    );
  });

  it('records the message when it was created on a branch (parentMessageId)', async () => {
    vi.mocked(messageRepository.createWithParent).mockResolvedValue({
      id: 3,
      chatId: 'chat-123',
      role: 'user',
      content: 'branched',
    } as never);

    const res = await postMessage(app, {
      role: 'user',
      content: 'branched',
      parentMessageId: 1,
    });

    expect(res.status).toBe(201);
    expect(usageService.trackUsage).toHaveBeenCalledWith(TENANT, 'messages', 1, expect.anything());
  });

  // 配额被拒时请求根本没落库，不该记账
  it('does not record usage when the quota gate rejects the request', async () => {
    vi.mocked(usageService.checkQuota).mockResolvedValue({
      resourceType: 'messages',
      currentUsage: 100,
      period: '2026-01',
    } as never);

    const res = await postMessage(app, { role: 'user', content: 'Hello' });

    expect(res.status).toBe(403);
    expect(usageService.trackUsage).not.toHaveBeenCalled();
  });

  // 别人的聊天走 404，同样没有消息落库
  it('does not record usage when the chat does not belong to the caller', async () => {
    vi.mocked(chatRepository.findById).mockResolvedValue({
      id: 'chat-123',
      userId: 'someone-else',
      tenantId: TENANT,
    } as never);

    const res = await postMessage(app, { role: 'user', content: 'Hello' });

    expect(res.status).toBe(404);
    expect(usageService.trackUsage).not.toHaveBeenCalled();
  });

  // 计量失败不能反过来吞掉用户的消息：消息已经写进库了，
  // 这时候返回 5xx 会让客户端重发，用丢消息换一行账单记录
  it('still returns 201 when the usage write fails', async () => {
    vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('usage db down'));

    const res = await postMessage(app, { role: 'user', content: 'Hello' });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
  });
});
