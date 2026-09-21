/**
 * WebSocket 聊天链路的配额计量与拦截测试
 *
 * 客户端只要 wsConnected 就走 WebSocket 发消息，HTTP 那条只是回退路径。
 * 而 WebSocket 处理器完全不经过 Hono 中间件链，历史上既没有配额检查
 * 也没有用量计量——也就是说主力链路上的消息一条都没记账，
 * requireQuota('messages') 拦不到任何人。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSMessageType } from '../../types/websocket';
import type { WSUserMessage } from '../../types/websocket';

vi.mock('../services/websocket.service', () => ({
  websocketService: {
    getClientInfo: vi.fn(),
    joinChat: vi.fn(),
    sendToClient: vi.fn(),
    registerClient: vi.fn(),
    unregisterClient: vi.fn(),
    leaveChat: vi.fn(),
    broadcastToChat: vi.fn(),
    updateHeartbeat: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock('../services/logger.service', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock('../services/usage.service', () => ({
  usageService: { trackUsage: vi.fn(), checkQuota: vi.fn() },
}));

vi.mock('../services/feature.service', () => ({
  featureService: { checkQuota: vi.fn() },
}));

vi.mock('../services/chat.service', () => ({
  chatService: {
    addMessage: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
    buildEnhancedSystemPrompt: vi.fn(),
    updateEmotionFromMessage: vi.fn(),
    checkAndExtractMemories: vi.fn(),
  },
  getChatModel: vi.fn().mockReturnValue('glm-4.5-air'),
}));

vi.mock('../services/context-manager.service', () => ({
  contextManager: {
    buildContext: vi.fn().mockReturnValue({ messages: [{ role: 'user', content: 'Hello' }] }),
    injectAtDepth: vi.fn((messages: unknown) => messages),
  },
}));

vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: { findById: vi.fn() },
}));

vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: { create: vi.fn(), findBranch: vi.fn() },
}));

vi.mock('../../db/repositories/character-growth.repository', () => ({
  characterGrowthRepository: {
    getOrCreate: vi.fn().mockResolvedValue({ id: 'growth-1' }),
    incrementMessages: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/group-chat.service', () => ({
  groupChatService: {
    isGroupChat: vi.fn().mockResolvedValue(false),
    getStrategy: vi.fn(),
    selectRespondents: vi.fn(),
  },
}));

vi.mock('../services/llm.service', () => ({
  llmService: {
    streamChatCompletion: vi.fn(),
    completion: vi.fn(),
    countTokens: vi.fn((text: string) => (text ? Math.ceil(text.length / 4) : 0)),
  },
}));

vi.mock('../config/llm.config', () => ({
  getDefaultModel: vi.fn().mockReturnValue('glm-4.5-air'),
  getModelMeta: vi.fn().mockReturnValue({ defaultTemperature: 0.7 }),
}));

vi.mock('../../db', () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../db/schema/chats', () => ({ chats: { id: 'id', unreadCount: 'unreadCount' } }));
vi.mock('../services/chat-variable.service', () => ({
  chatVariableStore: { setChatVar: vi.fn(), deleteChatVar: vi.fn() },
}));
vi.mock('../services/regex-scripts.service', () => ({
  applyRegexScripts: vi.fn((content: string) => content),
  getRegexScripts: vi.fn().mockReturnValue([]),
  RegexPlacement: { AI_OUTPUT: 2 },
}));
vi.mock('../../core/jwt', () => ({ verifyAccessToken: vi.fn() }));

import { WebSocketHandler } from './websocket';
import { websocketService } from '../services/websocket.service';
import { usageService } from '../services/usage.service';
import { featureService } from '../services/feature.service';
import { chatService } from '../services/chat.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { groupChatService } from '../services/group-chat.service';
import { messageRepository } from '../../db/repositories/message.repository';

const CLIENT_ID = 'client-1';
const TENANT = 'tenant-1';
const USER = 'user-1';
const CHAT = 'chat-1';

function userMessage(content = 'Hello'): WSUserMessage {
  return {
    type: WSMessageType.USER_MESSAGE,
    timestamp: new Date().toISOString(),
    data: { chatId: CHAT, content },
  };
}

function messagesMetered() {
  return vi.mocked(usageService.trackUsage).mock.calls.filter((call) => call[1] === 'messages');
}

function tokensMetered() {
  return vi.mocked(usageService.trackUsage).mock.calls.filter((call) => call[1] === 'llm_tokens');
}

describe('WebSocket chat — quota metering and enforcement', () => {
  let handler: WebSocketHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new WebSocketHandler();

    vi.mocked(websocketService.getClientInfo).mockReturnValue({
      id: CLIENT_ID,
      userId: USER,
      tenantId: TENANT,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    } as never);
    vi.mocked(featureService.checkQuota).mockResolvedValue({
      allowed: true,
      currentUsage: 5,
      limit: 100,
      remaining: 95,
    });
    vi.mocked(usageService.trackUsage).mockResolvedValue({} as never);
    vi.mocked(chatService.addMessage).mockResolvedValue({ id: 1 } as never);
    vi.mocked(groupChatService.isGroupChat).mockResolvedValue(false);
    // 隔离出 handleUserMessage：回复生成本身在别的用例里单独测
    vi.spyOn(handler as never as { handleSingleCharacterResponse: () => Promise<void> }, 'handleSingleCharacterResponse')
      .mockResolvedValue(undefined);
  });

  describe('user message', () => {
    it('meters one message after the user message is saved', async () => {
      await (handler as never as { handleUserMessage: (c: string, m: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());

      expect(messagesMetered()).toHaveLength(1);
      expect(messagesMetered()[0]).toEqual([
        TENANT,
        'messages',
        1,
        expect.objectContaining({ transport: 'websocket' }),
      ]);
    });

    // 这是整个修复的重点：WebSocket 是客户端默认走的通道，
    // 这里不拦的话 requireQuota 挂在 HTTP 上也只是装饰
    it('refuses the message when the tenant is out of quota', async () => {
      vi.mocked(featureService.checkQuota).mockResolvedValue({
        allowed: false,
        currentUsage: 100,
        limit: 100,
        remaining: 0,
      });

      await (handler as never as { handleUserMessage: (c: string, m: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());

      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(usageService.trackUsage).not.toHaveBeenCalled();
    });

    it('tells the client why the message was refused', async () => {
      vi.mocked(featureService.checkQuota).mockResolvedValue({
        allowed: false,
        currentUsage: 100,
        limit: 100,
        remaining: 0,
      });

      await (handler as never as { handleUserMessage: (c: string, m: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());

      expect(websocketService.sendToClient).toHaveBeenCalledWith(
        CLIENT_ID,
        expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({ code: 'QUOTA_EXCEEDED' }),
        })
      );
    });

    it('does not generate a reply when the quota gate refuses', async () => {
      vi.mocked(featureService.checkQuota).mockResolvedValue({
        allowed: false,
        currentUsage: 100,
        limit: 100,
        remaining: 0,
      });
      const single = vi.spyOn(
        handler as never as { handleSingleCharacterResponse: () => Promise<void> },
        'handleSingleCharacterResponse'
      );

      await (handler as never as { handleUserMessage: (c: string, m: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());

      expect(single).not.toHaveBeenCalled();
    });

    // 计量失败不能反过来打断对话：消息已经落库并广播了
    it('still broadcasts the message when the usage write fails', async () => {
      vi.mocked(usageService.trackUsage).mockRejectedValue(new Error('usage db down'));

      await (handler as never as { handleUserMessage: (c: string, m: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());

      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(
        CHAT,
        expect.objectContaining({ type: WSMessageType.USER_MESSAGE })
      );
      expect(websocketService.sendToClient).not.toHaveBeenCalled();
    });
  });

  describe('assistant reply (single character)', () => {
    beforeEach(() => {
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: CHAT,
        userId: USER,
        characterId: null,
        personaId: null,
        metadata: {},
      } as never);
      vi.mocked(chatService.getMessages).mockResolvedValue([
        { id: 1, role: 'user', content: 'Hello', pinned: false, importance: 0 },
      ] as never);
      vi.mocked(chatService.addMessage).mockResolvedValue({ id: 2 } as never);
    });

    async function runReply(content = 'Generated reply') {
      const h = handler as never as {
        handleSingleCharacterResponse: (
          chatId: string,
          content: string,
          userId: string,
          userMessageId: number,
          tenantId?: string
        ) => Promise<void>;
        streamLlmResponse: () => Promise<string>;
      };
      vi.spyOn(h, 'handleSingleCharacterResponse').mockRestore();
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue(content);
      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);
    }

    it('meters the assistant message against the same quota', async () => {
      await runReply();

      expect(messagesMetered()).toHaveLength(1);
      expect(messagesMetered()[0]).toEqual([
        TENANT,
        'messages',
        1,
        expect.objectContaining({ transport: 'websocket', role: 'assistant' }),
      ]);
    });

    // WebSocket 流式生成走的是自己的 streamLlmResponse，不经过
    // llm.ts 那两个路由，所以 llm_tokens 在这条链路上也是 0
    it('meters the llm tokens produced by the stream', async () => {
      await runReply('a'.repeat(400));

      expect(tokensMetered()).toHaveLength(1);
      const [, , amount, metadata] = tokensMetered()[0];
      expect(amount).toBeGreaterThan(0);
      expect(metadata).toEqual(expect.objectContaining({ transport: 'websocket' }));
    });

    it('does not meter anything when generation produced no content', async () => {
      await runReply('');

      expect(usageService.trackUsage).not.toHaveBeenCalled();
      expect(chatService.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('assistant replies (group chat)', () => {
    it('meters one message per responding character', async () => {
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: CHAT,
        userId: USER,
        personaId: null,
        metadata: {},
      } as never);
      vi.mocked(chatService.getMessages).mockResolvedValue([]);
      vi.mocked(groupChatService.getStrategy).mockResolvedValue('round_robin' as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({
        systemPrompt: 'sys',
        atDepthEntries: [],
      } as never);
      vi.mocked(messageRepository.create).mockResolvedValue({ id: 9 } as never);

      const { characterRepository } = await import('../../db/repositories/character.repository');
      vi.mocked(characterRepository.findById).mockResolvedValue({
        id: 'char-1',
        name: 'Alice',
        cardData: {},
      } as never);

      const h = handler as never as {
        handleGroupChatResponse: (
          chatId: string,
          content: string,
          userId: string,
          mentioned?: string[],
          tenantId?: string
        ) => Promise<void>;
        streamLlmResponse: () => Promise<string>;
      };
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue('reply');

      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-1'], TENANT);

      expect(messagesMetered()).toHaveLength(2);
    });
  });
});
