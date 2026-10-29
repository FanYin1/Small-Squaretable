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

vi.mock('../../db/repositories/generation-request.repository', () => ({
  generationRequestRepository: {
    findByRequest: vi.fn().mockResolvedValue(null),
    claim: vi.fn().mockResolvedValue({ claimed: true, request: { id: 'generation-1' } }),
    markRunning: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
  },
}));

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
  messageRepository: { create: vi.fn(), findBranch: vi.fn(), findByClientMessageId: vi.fn().mockResolvedValue(null) },
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

const { mockSpendRecord } = vi.hoisted(() => ({ mockSpendRecord: vi.fn() }));
vi.mock('../services/spend-breaker.service', () => ({
  spendBreaker: { record: mockSpendRecord, assertAllowed: vi.fn() },
}));

vi.mock('../config/llm.config', () => ({
  getDefaultModel: vi.fn().mockReturnValue('glm-4.5-air'),
  getModelMeta: vi.fn().mockReturnValue({ defaultTemperature: 0.7, contextWindow: 128000, maxOutputTokens: 4096 }),
}));

vi.mock('../../db', () => ({
  db: {
    transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => callback({})),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../db/schema/chats', () => ({ chats: { id: 'id', unreadCount: 'unreadCount' } }));
vi.mock('../services/chat-variable.service', () => ({
  chatVariableStore: { setChatVar: vi.fn(), deleteChatVar: vi.fn() },
}));
vi.mock('../services/legacy-variables.service', async importOriginal => ({
  ...await importOriginal<typeof import('../services/legacy-variables.service')>(),
  saveLegacyAssistantMessage: vi.fn(async ({ chatId, ...data }) => data.characterId
    ? messageRepository.create({ chatId, ...data })
    : chatService.addMessage(chatId, data)),
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
import { contextManager } from '../services/context-manager.service';
import { AppError } from '../../core/errors';
import { generationRequestRepository } from '../../db/repositories/generation-request.repository';
import { db } from '../../db';

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
    vi.mocked(db.transaction).mockReset().mockImplementation(async callback => callback({} as never));
    vi.mocked(generationRequestRepository.findByRequest).mockReset().mockResolvedValue(null);
    vi.mocked(generationRequestRepository.claim).mockReset().mockResolvedValue({ claimed: true, request: { id: 'generation-1' } } as never);
    vi.mocked(generationRequestRepository.markRunning).mockReset().mockResolvedValue(undefined);
    vi.mocked(generationRequestRepository.finish).mockReset().mockResolvedValue(undefined);
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
    vi.mocked(messageRepository.findByClientMessageId).mockResolvedValue(null);
    vi.mocked(chatRepository.findById).mockResolvedValue({ id: CHAT, userId: USER, tenantId: TENANT } as never);
    vi.mocked(groupChatService.isGroupChat).mockResolvedValue(false);
    // 隔离出 handleUserMessage：回复生成本身在别的用例里单独测
    vi.spyOn(handler as never as { handleSingleCharacterResponse: () => Promise<void> }, 'handleSingleCharacterResponse')
      .mockResolvedValue(undefined);
  });

  describe('user message', () => {
    it('reads the actual legacy story preparation inside a read-only repeatable transaction before metering', async () => {
      await (handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());
      expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'repeatable read', accessMode: 'read only',
      });
      expect(vi.mocked(db.transaction).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(featureService.checkQuota).mock.invocationCallOrder[0]
      );
      expect(messagesMetered()).toHaveLength(1);
    });

    it('does not claim, persist, meter or generate when reading the story transaction fails', async () => {
      vi.mocked(db.transaction).mockRejectedValueOnce(new Error('story snapshot unavailable'));
      const dispatch = handler as unknown as {
        handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void>;
        handleSingleCharacterResponse: () => Promise<void>;
      };
      await dispatch.handleUserMessage(CLIENT_ID, userMessage());
      expect(featureService.checkQuota).not.toHaveBeenCalled();
      expect(generationRequestRepository.claim).not.toHaveBeenCalled();
      expect(generationRequestRepository.finish).not.toHaveBeenCalled();
      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(usageService.trackUsage).not.toHaveBeenCalled();
      expect(dispatch.handleSingleCharacterResponse).not.toHaveBeenCalled();
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.ERROR,
        data: expect.objectContaining({ code: 'MESSAGE_ERROR' }),
      }));
      await dispatch.handleUserMessage(CLIENT_ID, userMessage('After recovery'));
      expect(chatService.addMessage).toHaveBeenCalledTimes(1);
      expect(messagesMetered()).toHaveLength(1);
      expect(dispatch.handleSingleCharacterResponse).toHaveBeenCalledTimes(1);
    });

    it('keeps the real legacy action guard before quota and request acceptance', async () => {
      const message = userMessage();
      message.data.storyAction = { actionId: 'invented-action', expectedVersion: 0 };
      await (handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, message);
      expect(db.transaction).toHaveBeenCalledOnce();
      expect(featureService.checkQuota).not.toHaveBeenCalled();
      expect(generationRequestRepository.claim).not.toHaveBeenCalled();
      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(usageService.trackUsage).not.toHaveBeenCalled();
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.ERROR,
        data: expect.objectContaining({ code: 'STORY_ACTION_UNAVAILABLE' }),
      }));
    });

    it('returns the client request identity with the persisted message', async () => {
      const message = userMessage();
      message.data.messageId = 'temp-story-request';
      await (handler as never as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, message);
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(message.data.chatId, expect.objectContaining({
        type: WSMessageType.USER_MESSAGE,
        data: expect.objectContaining({ messageId: '1', clientMessageId: 'temp-story-request' }),
      }));
    });

    it('acknowledges but never regenerates an already accepted request after restart', async () => {
      const message = userMessage();
      message.data.messageId = 'retry-request';
      vi.mocked(messageRepository.findByClientMessageId).mockResolvedValue({
        id: 7,
        role: 'user',
        content: message.data.content,
      } as never);

      await (handler as never as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, message);

      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(messagesMetered()).toHaveLength(0);
      expect(featureService.checkQuota).not.toHaveBeenCalled();
      expect(groupChatService.isGroupChat).not.toHaveBeenCalled();
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.USER_MESSAGE,
        data: expect.objectContaining({ messageId: '7', clientMessageId: 'retry-request' }),
      }));
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED,
        data: expect.objectContaining({ status: 'failed', retryable: false }),
      }));
      expect(websocketService.broadcastToChat).not.toHaveBeenCalledWith(
        CHAT,
        expect.objectContaining({ type: WSMessageType.USER_MESSAGE })
      );
    });

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
      expect(generationRequestRepository.markRunning).toHaveBeenCalledWith('generation-1', 1);
      expect(generationRequestRepository.finish).toHaveBeenCalledWith('generation-1', 'completed', undefined);
    });

    it('allows only one of two handler instances to generate the same request', async () => {
      type Dispatch = {
        handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void>;
        handleSingleCharacterResponse: () => Promise<void>;
      };
      const first = handler as unknown as Dispatch;
      const second = new WebSocketHandler() as unknown as Dispatch;
      const secondGeneration = vi.spyOn(second, 'handleSingleCharacterResponse').mockResolvedValue(undefined);
      let releaseGeneration!: () => void;
      let generationStarted!: () => void;
      const started = new Promise<void>((resolve) => { generationStarted = resolve; });
      vi.mocked(first.handleSingleCharacterResponse).mockImplementation(async () => {
        generationStarted();
        await new Promise<void>((resolve) => { releaseGeneration = resolve; });
      });
      let claimed = false;
      vi.mocked(generationRequestRepository.claim).mockImplementation(async (chatId, requestId, payloadHash) => {
        const result = { claimed: !claimed, request: { id: 'winner', chatId, requestId, payloadHash } };
        claimed = true;
        return result as never;
      });
      const message = userMessage();
      message.data.clientMessageId = 'shared-request';
      const firstTurn = first.handleUserMessage(CLIENT_ID, message);
      await started;
      try {
        await second.handleUserMessage('other-client', message);
        expect(chatService.addMessage).toHaveBeenCalledTimes(1);
        expect(messagesMetered()).toHaveLength(1);
        expect(secondGeneration).not.toHaveBeenCalled();
        expect(generationRequestRepository.finish).not.toHaveBeenCalled();
        expect(websocketService.broadcastToChat).not.toHaveBeenCalledWith(CHAT, expect.objectContaining({
          type: WSMessageType.GENERATION_FINISHED,
        }));
        expect(websocketService.sendToClient).toHaveBeenCalledWith('other-client', expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({ code: 'GENERATION_ALREADY_ACCEPTED' }),
        }));
      } finally {
        releaseGeneration();
        await firstTurn;
      }
      expect(generationRequestRepository.finish).toHaveBeenCalledTimes(1);
      expect(generationRequestRepository.finish).toHaveBeenCalledWith('winner', 'completed', undefined);
    });

    it.each(['accepted', 'running', 'completed', 'stopped', 'failed'])(
      'never reclaims a durable %s request even if its user message is missing', async (status) => {
        const dispatch = handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> };
        const message = userMessage();
        message.data.clientMessageId = 'durable-request';
        await dispatch.handleUserMessage(CLIENT_ID, message);
        const payloadHash = vi.mocked(generationRequestRepository.claim).mock.calls[0][2];
        vi.mocked(generationRequestRepository.findByRequest).mockResolvedValue({
          id: 'generation-1', status, payloadHash, userMessageId: null,
        } as never);
        vi.clearAllMocks();
        await dispatch.handleUserMessage(CLIENT_ID, message);
        expect(chatService.addMessage).not.toHaveBeenCalled();
        expect(featureService.checkQuota).not.toHaveBeenCalled();
        expect(generationRequestRepository.claim).not.toHaveBeenCalled();
        expect(generationRequestRepository.finish).not.toHaveBeenCalled();
        expect(websocketService.broadcastToChat).not.toHaveBeenCalled();
        expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({ code: 'GENERATION_ALREADY_ACCEPTED' }),
        }));
      }
    );

    it('includes mentioned characters in the request identity', async () => {
      const dispatch = handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> };
      const message = userMessage();
      message.data.clientMessageId = 'character-request';
      message.data.mentionedCharacterIds = ['character-1'];
      await dispatch.handleUserMessage(CLIENT_ID, message);
      const payloadHash = vi.mocked(generationRequestRepository.claim).mock.calls[0][2];
      vi.mocked(generationRequestRepository.findByRequest).mockResolvedValue({ payloadHash } as never);
      message.data.mentionedCharacterIds = ['character-2'];
      await dispatch.handleUserMessage(CLIENT_ID, message);
      expect(chatService.addMessage).toHaveBeenCalledTimes(1);
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.ERROR,
        data: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
      }));
    });

    it('fails closed when claiming a request has an unknown outcome', async () => {
      vi.mocked(generationRequestRepository.claim).mockRejectedValueOnce(new Error('lost claim acknowledgement'));
      await (handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());
      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(generationRequestRepository.finish).not.toHaveBeenCalled();
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED,
        data: expect.objectContaining({ status: 'failed', retryable: false }),
      }));
    });

    it('rejects a conflicting payload found during atomic claim', async () => {
      vi.mocked(generationRequestRepository.claim).mockResolvedValueOnce({
        claimed: false, request: { id: 'another-owner', payloadHash: 'different' },
      } as never);
      await (handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());
      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(generationRequestRepository.finish).not.toHaveBeenCalled();
      expect(websocketService.broadcastToChat).not.toHaveBeenCalled();
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.ERROR,
        data: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
      }));
    });

    it('persists cancellation after claiming and before saving the message', async () => {
      const dispatch = handler as unknown as {
        handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void>;
        activeGenerations: Map<string, { controller: AbortController }>;
      };
      vi.mocked(generationRequestRepository.claim).mockImplementationOnce(async () => {
        dispatch.activeGenerations.get(CHAT)!.controller.abort();
        return { claimed: true, request: { id: 'cancelled-request' } } as never;
      });
      await dispatch.handleUserMessage(CLIENT_ID, userMessage());
      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(generationRequestRepository.finish).toHaveBeenCalledWith('cancelled-request', 'stopped', undefined);
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED,
        data: expect.objectContaining({ status: 'stopped', retryable: false }),
      }));
    });

    it('records a failed turn and does not call the model if linking the user message fails', async () => {
      vi.mocked(generationRequestRepository.markRunning).mockRejectedValueOnce(new Error('lost status acknowledgement'));
      await (handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());
      expect(chatService.addMessage).toHaveBeenCalledTimes(1);
      expect(groupChatService.isGroupChat).not.toHaveBeenCalled();
      expect(generationRequestRepository.finish).toHaveBeenCalledWith('generation-1', 'failed', 'MESSAGE_ERROR');
    });

    it('still releases the local turn when persisting the final status fails', async () => {
      vi.mocked(generationRequestRepository.finish).mockRejectedValueOnce(new Error('database unavailable'));
      const dispatch = handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> };
      await dispatch.handleUserMessage(CLIENT_ID, userMessage());
      await dispatch.handleUserMessage(CLIENT_ID, userMessage('Next turn'));
      expect(chatService.addMessage).toHaveBeenCalledTimes(2);
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED,
        data: expect.objectContaining({ status: 'completed', retryable: false }),
      }));
    });

    it('only allows retry before persistence, not after a write with an unknown outcome', async () => {
      const dispatch = handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> };
      vi.mocked(featureService.checkQuota).mockResolvedValueOnce({ allowed: false, currentUsage: 100, limit: 100, remaining: 0 });
      await dispatch.handleUserMessage(CLIENT_ID, userMessage());
      expect(websocketService.broadcastToChat).toHaveBeenLastCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED,
        data: expect.objectContaining({ status: 'failed', retryable: true }),
      }));

      vi.mocked(chatService.addMessage).mockRejectedValueOnce(new Error('write acknowledgement lost'));
      await dispatch.handleUserMessage(CLIENT_ID, userMessage());
      expect(websocketService.broadcastToChat).toHaveBeenLastCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED,
        data: expect.objectContaining({ status: 'failed', retryable: false }),
      }));
    });

    it('does not restart a partially failed group turn', async () => {
      const dispatch = handler as unknown as {
        handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void>;
        handleGroupChatResponse: () => Promise<void>;
      };
      vi.mocked(groupChatService.isGroupChat).mockResolvedValue(true);
      const groupResponse = vi.spyOn(dispatch, 'handleGroupChatResponse').mockRejectedValue(new Error('second character failed'));
      const message = userMessage();
      message.data.clientMessageId = 'group-turn';
      await dispatch.handleUserMessage(CLIENT_ID, message);
      vi.mocked(messageRepository.findByClientMessageId).mockResolvedValueOnce({ id: 1, role: 'user', content: 'Hello' } as never);
      await dispatch.handleUserMessage(CLIENT_ID, message);
      expect(groupResponse).toHaveBeenCalledTimes(1);
      expect(generationRequestRepository.finish).toHaveBeenCalledTimes(1);
      expect(generationRequestRepository.finish).toHaveBeenCalledWith('generation-1', 'failed', 'MESSAGE_ERROR');
      expect(chatService.addMessage).toHaveBeenCalledTimes(1);
      expect(messagesMetered()).toHaveLength(1);
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.ERROR,
        data: expect.objectContaining({ code: 'GENERATION_ALREADY_ACCEPTED', requestId: 'group-turn' }),
      }));
    });

    it('rejects conflicting content and checks ownership before request lookup', async () => {
      const dispatch = handler as unknown as { handleUserMessage: (clientId: string, message: WSUserMessage) => Promise<void> };
      const message = userMessage();
      message.data.clientMessageId = 'request-identity';
      vi.mocked(messageRepository.findByClientMessageId).mockResolvedValueOnce({ id: 1, role: 'user', content: 'Different' } as never);
      await dispatch.handleUserMessage(CLIENT_ID, message);
      expect(websocketService.sendToClient).toHaveBeenCalledWith(CLIENT_ID, expect.objectContaining({
        type: WSMessageType.ERROR,
        data: expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }),
      }));
      vi.mocked(messageRepository.findByClientMessageId).mockClear();
      vi.mocked(generationRequestRepository.findByRequest).mockClear();
      vi.mocked(chatRepository.findById).mockResolvedValueOnce({ id: CHAT, userId: USER, tenantId: 'other-tenant' } as never);
      await dispatch.handleUserMessage(CLIENT_ID, message);
      expect(messageRepository.findByClientMessageId).not.toHaveBeenCalled();
      expect(generationRequestRepository.findByRequest).not.toHaveBeenCalled();
      expect(chatService.addMessage).not.toHaveBeenCalled();
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
      expect(generationRequestRepository.claim).not.toHaveBeenCalled();
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
      expect(websocketService.sendToClient).not.toHaveBeenCalledWith(
        CLIENT_ID,
        expect.objectContaining({ type: WSMessageType.ERROR })
      );
    });
  });

  describe('assistant reply (single character)', () => {
    beforeEach(() => {
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: CHAT,
        userId: USER,
        tenantId: TENANT,
        characterId: null,
        personaId: null,
        metadata: {},
      } as never);
      vi.mocked(chatService.getMessages).mockResolvedValue([
        { id: 1, role: 'user', content: 'Hello', pinned: false, importance: 0 },
      ] as never);
      vi.mocked(chatService.addMessage).mockResolvedValue({ id: 2 } as never);
    });

    async function runReply(
      content = 'Generated reply',
      usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null = null
    ) {
      const h = handler as never as {
        handleSingleCharacterResponse: (
          chatId: string,
          content: string,
          userId: string,
          userMessageId: number,
          tenantId?: string
        ) => Promise<void>;
        streamLlmResponse: () => Promise<unknown>;
      };
      vi.spyOn(h, 'handleSingleCharacterResponse').mockRestore();
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content, usage });
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
    it('awaits a rejected reader cancellation after an aborted stream', async () => {
      const { llmService } = await import('../services/llm.service');
      const aborted = new DOMException('Stopped', 'AbortError');
      const cancel = vi.fn().mockRejectedValue(aborted);
      vi.mocked(llmService.streamChatCompletion).mockResolvedValue({
        body: { getReader: () => ({ read: vi.fn().mockRejectedValue(aborted), cancel }) },
      } as never);
      const streamer = handler as unknown as { streamLlmResponse: (chatId: string, messageId: string, messages: unknown[]) => Promise<{ content: string }> };
      await expect(streamer.streamLlmResponse(CHAT, 'partial', [])).resolves.toMatchObject({ content: '' });
      expect(cancel).toHaveBeenCalledOnce();
      expect(llmService.streamChatCompletion).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 4096 }), undefined, { chatId: CHAT });
    });

    it('meters the llm tokens produced by the stream', async () => {
      await runReply('a'.repeat(400));

      expect(tokensMetered()).toHaveLength(1);
      const [, , amount, metadata] = tokensMetered()[0];
      expect(amount).toBeGreaterThan(0);
      expect(metadata).toEqual(expect.objectContaining({ transport: 'websocket' }));
    });

    // P0-1：计费口径 = 输入 + 输出。此前这里只算输出
    it('counts the prompt (context) tokens as well as the output', async () => {
      await runReply('Hi');

      const [, , amount, metadata] = tokensMetered()[0];
      expect(amount).toBeGreaterThanOrEqual(1000);
      expect(metadata).toEqual(expect.objectContaining({ promptTokens: 1000, tokenSource: 'estimate' }));
    });

    it('meters a larger context as more tokens than a smaller one for the same reply', async () => {
      vi.mocked(contextManager.buildContext).mockReturnValueOnce({
        messages: [{ role: 'user', content: 'Hello' }],
        totalTokens: 500,
      } as never);
      await runReply('same reply');
      const small = tokensMetered()[0][2];

      vi.mocked(usageService.trackUsage).mockClear();
      vi.mocked(contextManager.buildContext).mockReturnValueOnce({
        messages: [{ role: 'user', content: 'Hello' }],
        totalTokens: 20000,
      } as never);
      await runReply('same reply');
      const large = tokensMetered()[0][2];

      expect(large).toBeGreaterThan(small);
    });

    it('adds the depth-injected entries that the context total does not include', async () => {
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: CHAT, userId: USER, tenantId: TENANT, characterId: 'char-1', personaId: null, metadata: {},
      } as never);
      const { characterRepository } = await import('../../db/repositories/character.repository');
      vi.mocked(characterRepository.findById).mockResolvedValue({ id: 'char-1', name: 'Alice', cardData: {} } as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({
        systemPrompt: 'sys',
        atDepthEntries: [{ depth: 0, role: 'system', content: 'Stay in character at all times.' }],
      } as never);

      await runReply('Hi');

      const [, , , metadata] = tokensMetered()[0];
      expect((metadata as { promptTokens: number }).promptTokens).toBeGreaterThan(1000);
    });

    // P3-3：cache_friendly 布局的变动块在截断之后才注入，预算要预先扣掉
    it('reserves the dynamic-block tokens in the context budget', async () => {
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: CHAT, userId: USER, tenantId: TENANT, characterId: 'char-1', personaId: null, metadata: {},
      } as never);
      const { characterRepository } = await import('../../db/repositories/character.repository');
      vi.mocked(characterRepository.findById).mockResolvedValue({ id: 'char-1', name: 'Alice', cardData: {} } as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({
        systemPrompt: 'sys',
        atDepthEntries: [{ depth: 1, role: 'system', content: 'memories...' }],
        reservedTokens: 321,
      } as never);

      await runReply('Hi');

      expect(contextManager.buildContext).toHaveBeenCalledWith('sys', expect.any(Array), 'glm-4.5-air', 321);
    });

    it('prefers the provider usage over the estimate', async () => {
      await runReply('Hi', { promptTokens: 4321, completionTokens: 12 });

      const [, , amount, metadata] = tokensMetered()[0];
      expect(amount).toBe(4333);
      expect(metadata).toEqual(expect.objectContaining({ tokenSource: 'provider' }));
    });

    it('feeds the same number to the platform spend breaker', async () => {
      await runReply('Hi', { promptTokens: 4321, completionTokens: 12 });

      expect(mockSpendRecord).toHaveBeenCalledWith(4333);
    });

    // 输入 token 在请求发出时就已经被 provider 计费，中断也不例外
    it('still meters the prompt when generation produced no content, but saves no message', async () => {
      await runReply('');

      expect(messagesMetered()).toHaveLength(0);
      expect(chatService.addMessage).not.toHaveBeenCalled();
      expect(tokensMetered()).toHaveLength(1);
      expect(tokensMetered()[0][2]).toBe(1000);
    });
  });

  describe('assistant replies (group chat)', () => {
    it('meters one message per responding character', async () => {
      vi.mocked(chatRepository.findById).mockResolvedValue({
        id: CHAT,
        userId: USER,
        tenantId: TENANT,
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
        streamLlmResponse: () => Promise<unknown>;
      };
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'reply', usage: null });

      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-1'], TENANT);

      expect(messagesMetered()).toHaveLength(2);
      // 群聊每个角色的生成都是一次独立的 LLM 调用，各自按输入 + 输出计量
      expect(tokensMetered()).toHaveLength(2);
      for (const call of tokensMetered()) {
        expect(call[2]).toBeGreaterThanOrEqual(1000);
        expect(call[3]).toEqual(expect.objectContaining({ characterId: 'char-1' }));
      }
    });

    it('rejects with Chat not found when the chat no longer exists', async () => {
      vi.mocked(chatRepository.findById).mockResolvedValue(null as never);
      vi.mocked(chatService.getMessages).mockResolvedValue([]);
      vi.mocked(groupChatService.getStrategy).mockResolvedValue('round_robin' as never);

      const h = handler as never as {
        handleGroupChatResponse: (chatId: string, content: string, userId: string, mentioned?: string[], tenantId?: string) => Promise<void>;
        streamLlmResponse: () => Promise<unknown>;
      };
      const stream = vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'reply', usage: null });

      await expect(
        h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1'], TENANT)
      ).rejects.toThrow('Chat not found');

      expect(stream).not.toHaveBeenCalled();
      expect(messagesMetered()).toHaveLength(0);
    });

    // P0-7：熔断触发时客户端应看到可读的原因和错误码，而不是笼统的 MESSAGE_ERROR
    it('forwards the platform spend limit code and message to the client', async () => {
      const single = vi.spyOn(
        handler as never as { handleSingleCharacterResponse: () => Promise<void> },
        'handleSingleCharacterResponse'
      );
      single.mockRejectedValue(
        new AppError('The platform has reached its daily usage limit. Please try again tomorrow.', 503, 'PLATFORM_SPEND_LIMIT')
      );

      await (handler as never as { handleUserMessage: (c: string, m: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());

      expect(websocketService.sendToClient).toHaveBeenCalledWith(
        CLIENT_ID,
        expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({
            code: 'PLATFORM_SPEND_LIMIT',
            message: 'The platform has reached its daily usage limit. Please try again tomorrow.',
          }),
        })
      );
    });

    it('sends an ERROR message to the client when the group chat is missing', async () => {
      vi.mocked(groupChatService.isGroupChat).mockResolvedValue(true);
      vi.mocked(chatRepository.findById).mockResolvedValue(null as never);
      vi.mocked(chatService.getMessages).mockResolvedValue([]);
      vi.mocked(groupChatService.getStrategy).mockResolvedValue('round_robin' as never);

      await (handler as never as { handleUserMessage: (c: string, m: WSUserMessage) => Promise<void> })
        .handleUserMessage(CLIENT_ID, userMessage());

      expect(websocketService.sendToClient).toHaveBeenCalledWith(
        CLIENT_ID,
        expect.objectContaining({
          type: WSMessageType.ERROR,
          data: expect.objectContaining({ message: 'Chat not found' }),
        })
      );
    });
  });
});
