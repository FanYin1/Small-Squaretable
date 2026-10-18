/**
 * WebSocket 聊天链路的预付点数（credits）计费测试（P3-1）
 *
 * 覆盖：生成前预扣并把输出上限交给 provider、保存助手消息后带 messageId 结算、
 * 中断 / 空内容 / 保存失败 / 流中途失败 / 连接前失败 各自的收尾（结算已产生的部分或整笔释放），
 * 点数不足时拒绝并把 INSUFFICIENT_CREDITS 转给客户端，以及群聊每个角色各自预扣结算。
 *
 * 订阅模式下的行为由 websocket-metering.spec.ts 守住（这里的 credit-generation 被整体替换）。
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
    buildContext: vi.fn().mockReturnValue({
      messages: [{ role: 'user', content: 'Hello' }],
      totalTokens: 1000,
    }),
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

vi.mock('../services/spend-breaker.service', () => ({
  spendBreaker: { record: vi.fn(), assertAllowed: vi.fn() },
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

// 点数计费封装整体替换：这里只验证 websocket.ts 如何调用它
vi.mock('../services/credit-generation', () => ({
  assertCreditsAvailable: vi.fn().mockResolvedValue(undefined),
  reserveForGeneration: vi.fn(),
  settleGeneration: vi.fn().mockResolvedValue(undefined),
  releaseGeneration: vi.fn().mockResolvedValue(undefined),
}));

import { WebSocketHandler } from './websocket';
import { websocketService } from '../services/websocket.service';
import { usageService } from '../services/usage.service';
import { featureService } from '../services/feature.service';
import { chatService } from '../services/chat.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { characterRepository } from '../../db/repositories/character.repository';
import { groupChatService } from '../services/group-chat.service';
import { messageRepository } from '../../db/repositories/message.repository';
import {
  assertCreditsAvailable,
  reserveForGeneration,
  settleGeneration,
  releaseGeneration,
} from '../services/credit-generation';
import { InsufficientCreditsError } from '../services/credit-billing.service';

const CLIENT_ID = 'client-1';
const TENANT = 'tenant-1';
const USER = 'user-1';
const CHAT = 'chat-1';

const HOLD = { id: 'hold-1', tenantId: TENANT, tokens: 6000, maxOutputTokens: 4096 };

function userMessage(content = 'Hello'): WSUserMessage {
  return {
    type: WSMessageType.USER_MESSAGE,
    timestamp: new Date().toISOString(),
    data: { chatId: CHAT, content },
  };
}

type StreamOptions = {
  maxTokens?: number;
  progress?: { started: boolean; content: string; usage: unknown };
};

interface HandlerInternals {
  handleUserMessage: (c: string, m: WSUserMessage) => Promise<void>;
  handleSingleCharacterResponse: (
    chatId: string,
    content: string,
    userId: string,
    userMessageId: number,
    tenantId?: string
  ) => Promise<void>;
  handleGroupChatResponse: (
    chatId: string,
    content: string,
    userId: string,
    mentioned?: string[],
    tenantId?: string
  ) => Promise<void>;
  streamLlmResponse: (...args: unknown[]) => Promise<unknown>;
}

describe('WebSocket chat - prepaid credits', () => {
  let handler: WebSocketHandler;
  let h: HandlerInternals;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new WebSocketHandler();
    h = handler as never as HandlerInternals;

    vi.mocked(websocketService.getClientInfo).mockReturnValue({
      id: CLIENT_ID,
      userId: USER,
      tenantId: TENANT,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    } as never);
    vi.mocked(featureService.checkQuota).mockResolvedValue({
      allowed: true,
      currentUsage: 0,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
    });
    vi.mocked(usageService.trackUsage).mockResolvedValue({} as never);
    vi.mocked(chatService.addMessage).mockResolvedValue({ id: 2 } as never);
    vi.mocked(groupChatService.isGroupChat).mockResolvedValue(false);
    vi.mocked(assertCreditsAvailable).mockResolvedValue(undefined);
    vi.mocked(reserveForGeneration).mockResolvedValue(HOLD as never);
    vi.mocked(settleGeneration).mockResolvedValue(undefined);
    vi.mocked(releaseGeneration).mockResolvedValue(undefined);
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
  });

  describe('precheck', () => {
    it('refuses before saving the user message when there are no credits, and forwards the code', async () => {
      vi.mocked(assertCreditsAvailable).mockRejectedValue(
        new InsufficientCreditsError({ requiredTokens: 1, availableTokens: 0 })
      );
      const single = vi.spyOn(h, 'handleSingleCharacterResponse').mockResolvedValue(undefined);

      await h.handleUserMessage(CLIENT_ID, userMessage());

      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(single).not.toHaveBeenCalled();
      expect(websocketService.sendToClient).toHaveBeenCalledWith(
        CLIENT_ID,
        expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({ code: 'INSUFFICIENT_CREDITS' }),
        })
      );
    });

    it('checks the tenant of the connected client', async () => {
      vi.spyOn(h, 'handleSingleCharacterResponse').mockResolvedValue(undefined);

      await h.handleUserMessage(CLIENT_ID, userMessage());

      expect(assertCreditsAvailable).toHaveBeenCalledWith(TENANT);
    });
  });

  describe('single character reply', () => {
    it('reserves before generating and hands the output cap to the provider', async () => {
      const stream = vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'Hi', usage: null });

      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);

      expect(reserveForGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT, chatId: CHAT, estimatedPromptTokens: 1000 })
      );
      const options = stream.mock.calls[0][7] as StreamOptions;
      expect(options.maxTokens).toBe(HOLD.maxOutputTokens);
      expect(reserveForGeneration.mock.invocationCallOrder[0]).toBeLessThan(
        stream.mock.invocationCallOrder[0]
      );
    });

    it('settles after the assistant message is saved, tracing it to chat and message', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({
        content: 'Hi',
        usage: { promptTokens: 900, completionTokens: 20, totalTokens: 920 },
      });

      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);

      expect(settleGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledWith(
        HOLD,
        expect.objectContaining({
          chatId: CHAT,
          messageId: 2,
          estimatedPromptTokens: 1000,
          outputText: 'Hi',
          providerUsage: { promptTokens: 900, completionTokens: 20, totalTokens: 920 },
        })
      );
      expect(vi.mocked(chatService.addMessage).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(settleGeneration).mock.invocationCallOrder[0]
      );
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it('does not generate or save anything when the reservation is refused', async () => {
      vi.mocked(reserveForGeneration).mockRejectedValue(
        new InsufficientCreditsError({ requiredTokens: 6000, availableTokens: 100 })
      );
      const stream = vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'Hi', usage: null });

      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT)).rejects.toMatchObject({
        code: 'INSUFFICIENT_CREDITS',
      });

      expect(stream).not.toHaveBeenCalled();
      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(settleGeneration).not.toHaveBeenCalled();
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    // 中断：provider 已经为输入收了费，必须结算（只收输入），不能留着冻结
    it('settles what was consumed when generation was aborted before any output', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: '', usage: null });

      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);

      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(settleGeneration).toHaveBeenCalledWith(
        HOLD,
        expect.objectContaining({ outputText: '', messageId: null })
      );
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it('still settles (without a message id) when saving the assistant message fails', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'Hi', usage: null });
      vi.mocked(chatService.addMessage).mockRejectedValue(new Error('db down'));

      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT)).rejects.toThrow('db down');

      expect(settleGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledWith(
        HOLD,
        expect.objectContaining({ outputText: 'Hi', messageId: null })
      );
    });

    it('settles the partial output when the stream fails halfway', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockImplementation(async (...args: unknown[]) => {
        const progress = (args[7] as StreamOptions).progress!;
        progress.started = true;
        progress.content = 'partial';
        throw new Error('provider reset');
      });

      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT)).rejects.toThrow(
        'provider reset'
      );

      expect(settleGeneration).toHaveBeenCalledWith(
        HOLD,
        expect.objectContaining({ outputText: 'partial', estimatedPromptTokens: 1000, chatId: CHAT })
      );
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it('releases the whole hold when the provider cannot be reached at all', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockRejectedValue(new Error('connect refused'));

      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT)).rejects.toThrow(
        'connect refused'
      );

      expect(releaseGeneration).toHaveBeenCalledWith(HOLD);
      expect(settleGeneration).not.toHaveBeenCalled();
    });

    it('passes a null hold through untouched in subscription mode', async () => {
      vi.mocked(reserveForGeneration).mockResolvedValue(null);
      const stream = vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'Hi', usage: null });

      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);

      const options = stream.mock.calls[0][7] as StreamOptions;
      expect(options.maxTokens).toBeUndefined();
      expect(settleGeneration).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 2 }));
    });
  });

  describe('group chat reply', () => {
    beforeEach(() => {
      vi.mocked(groupChatService.getStrategy).mockResolvedValue('round_robin' as never);
      vi.mocked(chatService.getMessages).mockResolvedValue([]);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({
        systemPrompt: 'sys',
        atDepthEntries: [],
      } as never);
      vi.mocked(messageRepository.create).mockResolvedValue({ id: 9 } as never);
      vi.mocked(characterRepository.findById).mockResolvedValue({
        id: 'char-1',
        name: 'Alice',
        cardData: {},
      } as never);
    });

    it('reserves and settles once per responding character', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'reply', usage: null });

      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-1'], TENANT);

      expect(reserveForGeneration).toHaveBeenCalledTimes(2);
      expect(settleGeneration).toHaveBeenCalledTimes(2);
      for (const call of vi.mocked(settleGeneration).mock.calls) {
        expect(call[1]).toEqual(expect.objectContaining({ chatId: CHAT, messageId: 9, outputText: 'reply' }));
      }
    });

    it('settles an aborted (empty) group reply and stops the round', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: '', usage: null });

      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-1'], TENANT);

      expect(reserveForGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledWith(HOLD, expect.objectContaining({ messageId: null }));
      expect(messageRepository.create).not.toHaveBeenCalled();
    });

    it('releases the hold when the provider cannot be reached', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockRejectedValue(new Error('connect refused'));

      await expect(
        h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1'], TENANT)
      ).rejects.toThrow('connect refused');

      expect(releaseGeneration).toHaveBeenCalledWith(HOLD);
      expect(settleGeneration).not.toHaveBeenCalled();
    });
  });
});
