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
import type { WSUserMessage, WSAbortGenerationMessage } from '../../types/websocket';
import type { PreparedStoryTurn } from '../services/story-state.service';
import { saveLegacyAssistantMessage } from '../services/legacy-variables.service';

vi.mock('../services/legacy-variables.service', async importOriginal => ({
  ...await importOriginal<typeof import('../services/legacy-variables.service')>(),
  saveLegacyAssistantMessage: vi.fn(async ({ chatId, ...data }) => data.characterId
    ? messageRepository.create({ chatId, ...data })
    : chatService.addMessage(chatId, data)),
}));

vi.mock('../services/story-state.service', () => ({
  prepareStoryTurn: vi.fn().mockResolvedValue(null),
  commitStoryTurn: vi.fn().mockResolvedValue({ id: 12 }),
}));

vi.mock('../services/story-content.service', () => ({
  resolveStoryCharacter: vi.fn().mockResolvedValue(null),
}));

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

vi.mock('../services/spend-breaker.service', () => ({
  spendBreaker: { record: vi.fn(), assertAllowed: vi.fn() },
}));

vi.mock('../config/llm.config', () => ({
  getDefaultModel: vi.fn().mockReturnValue('glm-4.5-air'),
  getModelMeta: vi.fn().mockReturnValue({ defaultTemperature: 0.7, contextWindow: 128000, maxOutputTokens: 4096 }),
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
import { AppError } from '../../core/errors';
import { prepareStoryTurn, commitStoryTurn } from '../services/story-state.service';
import { resolveStoryCharacter } from '../services/story-content.service';
import { chatVariableStore } from '../services/chat-variable.service';
import { generationRequestRepository } from '../../db/repositories/generation-request.repository';
import { contextManager } from '../services/context-manager.service';
import { getModelMeta } from '../config/llm.config';
import { ContextBudgetError, estimateContextMessages } from '../services/context-budget';
import { llmService } from '../services/llm.service';
import { convertGeminiStream } from '../services/gemini-adapter';

const CLIENT_ID = 'client-1';
const TENANT = 'tenant-1';
const USER = 'user-1';
const CHAT = 'chat-1';

const HOLD = { id: 'hold-1', tenantId: TENANT, tokens: 6000, maxOutputTokens: 4096 };
const VARIABLE_OUTPUT = '<VariableInsert>{"coins":999}</VariableInsert><VariableEdit>{"location":"tower"}</VariableEdit><VariableDelete>["pass"]</VariableDelete>';

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
  handleAbortGeneration: (clientId: string, message: WSAbortGenerationMessage) => Promise<void>;
  handleUserMessage: (c: string, m: WSUserMessage) => Promise<void>;
  handleSingleCharacterResponse: (
    chatId: string,
    content: string,
    userId: string,
    userMessageId: number,
    tenantId?: string,
    signal?: AbortSignal,
    preparedStory?: PreparedStoryTurn | null,
    requestId?: string
  ) => Promise<void>;
  handleGroupChatResponse: (
    chatId: string,
    content: string,
    userId: string,
    mentioned?: string[],
    tenantId?: string,
    signal?: AbortSignal,
    userMessageId?: number,
    requestId?: string
  ) => Promise<void>;
  streamLlmResponse: (...args: unknown[]) => Promise<unknown>;
  streamTextCompletion: (...args: unknown[]) => Promise<unknown>;
}

describe('WebSocket chat - prepaid credits', () => {
  let handler: WebSocketHandler;
  let h: HandlerInternals;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contextManager.buildContext).mockReset().mockImplementation(() => ({
      messages: [{ role: 'user', content: 'Hello' }], totalTokens: 1000, truncated: false, truncatedCount: 0,
    }));
    vi.mocked(contextManager.injectAtDepth).mockReset().mockImplementation(messages => messages);
    vi.mocked(getModelMeta).mockReturnValue({ id: 'glm-4.5-air', provider: 'test', defaultTemperature: 0.7, contextWindow: 128000, maxOutputTokens: 4096 });
    vi.mocked(prepareStoryTurn).mockReset().mockResolvedValue(null);
    vi.mocked(commitStoryTurn).mockReset().mockResolvedValue({ id: 12 } as never);
    vi.mocked(resolveStoryCharacter).mockReset().mockResolvedValue(null);
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
    vi.mocked(chatRepository.findById).mockResolvedValue({ id: CHAT, userId: USER, tenantId: TENANT } as never);
    vi.mocked(groupChatService.isGroupChat).mockResolvedValue(false);
    vi.mocked(assertCreditsAvailable).mockResolvedValue(undefined);
    vi.mocked(reserveForGeneration).mockResolvedValue(HOLD as never);
    vi.mocked(settleGeneration).mockResolvedValue(undefined);
    vi.mocked(releaseGeneration).mockResolvedValue(undefined);
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
  });

  describe('precheck', () => {
    it.each(['STORY_STATE_CONFLICT', 'STORY_ACTION_UNAVAILABLE', 'STORY_ACTION_PRECONDITION'])(
      'requires a new action confirmation after %s without charging or accepting the request', async code => {
        vi.mocked(prepareStoryTurn).mockRejectedValueOnce(new AppError('Review the latest state', 409, code));
        await h.handleUserMessage(CLIENT_ID, userMessage());
        expect(generationRequestRepository.claim).not.toHaveBeenCalled();
        expect(chatService.addMessage).not.toHaveBeenCalled();
        expect(reserveForGeneration).not.toHaveBeenCalled();
        expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
          type: WSMessageType.GENERATION_FINISHED,
          data: expect.objectContaining({ status: 'failed', retryable: false }),
        }));
      }
    );
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

    it('forwards the point details so the client alert can show required / available', async () => {
      vi.mocked(assertCreditsAvailable).mockRejectedValue(
        new InsufficientCreditsError({ requiredTokens: 6000, availableTokens: 100 })
      );

      await h.handleUserMessage(CLIENT_ID, userMessage());

      const sent = vi.mocked(websocketService.sendToClient).mock.calls[0][1] as { data: Record<string, unknown> };
      expect(sent.data.details).toEqual(
        expect.objectContaining({ requiredTokens: 6000, availableTokens: 100 })
      );
      expect(sent.data.details).toHaveProperty('requiredPoints');
      expect(sent.data.details).toHaveProperty('availablePoints');
    });

    it('does not forward details of other app errors', async () => {
      vi.mocked(assertCreditsAvailable).mockRejectedValue(
        new AppError('Nope', 400, 'SOMETHING_ELSE', { internal: 'secret' })
      );

      await h.handleUserMessage(CLIENT_ID, userMessage());

      const sent = vi.mocked(websocketService.sendToClient).mock.calls[0][1] as { data: Record<string, unknown> };
      expect(sent.data.code).toBe('SOMETHING_ELSE');
      expect(sent.data).not.toHaveProperty('details');
    });

    it('checks the tenant of the connected client', async () => {
      vi.spyOn(h, 'handleSingleCharacterResponse').mockResolvedValue(undefined);

      await h.handleUserMessage(CLIENT_ID, userMessage());

      expect(assertCreditsAvailable).toHaveBeenCalledWith(TENANT);
    });
  });

  describe('single character reply', () => {
    it('retains native Gemini output truncation across split SSE chunks and usage frames', async () => {
      const body = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '还没说完' }] }, finishReason: 'MAX_TOKENS' }] })}\n\n`
        + `data: ${JSON.stringify({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } })}\n\n`;
      const bytes = new TextEncoder().encode(body);
      const native = new Response(new ReadableStream({ start(controller) {
        controller.enqueue(bytes.slice(0, 19)); controller.enqueue(bytes.slice(19)); controller.close();
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
      vi.mocked(llmService.streamChatCompletion).mockResolvedValue(convertGeminiStream(native, 'test-gemini'));
      await expect(h.streamLlmResponse(CHAT, 'fragment', [{ role: 'user', content: 'hello' }])).resolves
        .toMatchObject({ content: '还没说完', outputTruncated: true });
    });

    it('retains output truncation from an Ollama terminal frame', async () => {
      vi.mocked(llmService.streamChatCompletion).mockResolvedValue(new Response(
        JSON.stringify({ message: { content: 'unfinished' }, done: true, done_reason: 'length' }) + '\n'
      ));
      await expect(h.streamLlmResponse(CHAT, 'fragment', [{ role: 'user', content: 'hello' }])).resolves
        .toMatchObject({ content: 'unfinished', outputTruncated: true });
    });

    it.each([true, false])('saves a length-limited reply as interrupted and settles once (versioned: %s)', async versioned => {
      const character = { id: 'char-1', name: 'Alice', cardData: {} };
      vi.mocked(resolveStoryCharacter).mockResolvedValue(character as never);
      vi.mocked(chatRepository.findById).mockResolvedValue({ id: CHAT, userId: USER,
        characterId: character.id, contentSnapshotVersion: versioned ? 1 : null } as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({ systemPrompt: 'sys', atDepthEntries: [] } as never);
      const prepared = versioned ? { prompt: 'saved state' } as PreparedStoryTurn : null;
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: VARIABLE_OUTPUT, usage: null, outputTruncated: true });
      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT, undefined, prepared, 'turn-1'))
        .rejects.toMatchObject({ code: 'GENERATION_OUTPUT_TRUNCATED' });
      if (versioned) expect(commitStoryTurn).toHaveBeenCalledWith(prepared, 1, 'turn-1', VARIABLE_OUTPUT, true, expect.anything(), undefined, VARIABLE_OUTPUT);
      else expect(chatService.addMessage).toHaveBeenCalledWith(CHAT, expect.objectContaining({ extra: { stateStatus: 'interrupted' } }));
      expect(chatVariableStore.setChatVar).not.toHaveBeenCalled();
      expect(chatVariableStore.deleteChatVar).not.toHaveBeenCalled();
      expect(chatService.checkAndExtractMemories).not.toHaveBeenCalled();
      expect(chatService.updateEmotionFromMessage).toHaveBeenCalledTimes(1);
      expect(chatService.updateEmotionFromMessage).toHaveBeenCalledWith(character.id, USER, CHAT, 'Hello', 1);
      expect(settleGeneration).toHaveBeenCalledOnce();
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it.each(['partial', ''])('reports truncated output without replaying the accepted request: %s', async content => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content, usage: null, outputTruncated: true });
      await h.handleUserMessage(CLIENT_ID, userMessage());
      expect(generationRequestRepository.finish).toHaveBeenCalledWith('generation-1', 'failed', 'GENERATION_OUTPUT_TRUNCATED');
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED, data: expect.objectContaining({ status: 'failed', retryable: false }),
      }));
      expect(settleGeneration).toHaveBeenCalledOnce();
    });

    it('preserves truncation from a text-completion template', async () => {
      vi.mocked(llmService.completion).mockResolvedValue({ choices: [{ text: 'unfinished', finish_reason: 'length' }] } as never);
      await expect(h.streamTextCompletion(CHAT, 'template-fragment', 'prompt')).resolves.toMatchObject({
        content: 'unfinished', outputTruncated: true,
      });
    });

    it('rejects oversized final payload before any generation credit hold or provider call', async () => {
      vi.mocked(contextManager.injectAtDepth).mockReturnValueOnce([{ role: 'system', content: 'PRIVATE_STORY_SENTINEL'.repeat(30000) }]);
      const stream = vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'must not run', usage: null });
      await h.handleUserMessage(CLIENT_ID, userMessage());
      expect(reserveForGeneration).not.toHaveBeenCalled();
      expect(stream).not.toHaveBeenCalled();
      expect(settleGeneration).not.toHaveBeenCalled();
      expect(commitStoryTurn).not.toHaveBeenCalled();
      expect(chatService.addMessage).toHaveBeenCalledTimes(1);
      const sent = vi.mocked(websocketService.sendToClient).mock.calls.find(call => call[1].type === WSMessageType.ERROR)?.[1];
      expect(sent).toMatchObject({ data: { code: 'CONTEXT_BUDGET_EXCEEDED', details: { reason: 'payload', contextWindow: 128000 } } });
      expect(JSON.stringify(sent)).not.toContain('PRIVATE_STORY_SENTINEL');
      expect(generationRequestRepository.finish).toHaveBeenCalledWith('generation-1', 'failed', 'CONTEXT_BUDGET_EXCEEDED');
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED, data: expect.objectContaining({ status: 'failed', retryable: false }),
      }));
    });

    it('reserves every depth entry including author instructions before trimming', async () => {
      const entries = [{ depth: 0, role: 'system' as const, content: '世界书'.repeat(80) },
        { depth: 1, role: 'system' as const, content: '风格'.repeat(50) }];
      vi.mocked(resolveStoryCharacter).mockResolvedValue({ id: 'char-1', name: 'Alice', cardData: {} } as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({ systemPrompt: 'sys', atDepthEntries: entries, reservedTokens: 10 });
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'reply', usage: null });
      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);
      expect(contextManager.buildContext).toHaveBeenCalledWith('sys', expect.any(Array), 'glm-4.5-air', estimateContextMessages(entries));
    });

    it('propagates mandatory-context overflow without reserving credits', async () => {
      vi.mocked(contextManager.buildContext).mockImplementationOnce(() => {
        throw new ContextBudgetError({ reason: 'critical', requiredTokens: 900, availableTokens: 700, contextWindow: 1000, outputTokens: 200 });
      });
      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT)).rejects.toMatchObject({ code: 'CONTEXT_BUDGET_EXCEEDED' });
      expect(reserveForGeneration).not.toHaveBeenCalled();
    });

    it('checks formatted template capacity with its actual output allowance', async () => {
      vi.mocked(getModelMeta).mockReturnValue({ id: 'small', provider: 'test', contextWindow: 2500, maxOutputTokens: 100, defaultTemperature: 0.7 });
      vi.mocked(resolveStoryCharacter).mockResolvedValue({ id: 'char-1', cardData: { extensions: { promptTemplate: 'alpaca' } } } as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({ systemPrompt: 'sys', atDepthEntries: [] });
      vi.mocked(contextManager.buildContext).mockReturnValueOnce({ messages: [{ role: 'system', content: 'sys' },
        { role: 'user', content: 'story '.repeat(300) }], totalTokens: 600, truncated: false, truncatedCount: 0 });
      const stream = vi.spyOn(h, 'streamTextCompletion').mockResolvedValue({ content: 'must not run', usage: null });
      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT)).rejects.toMatchObject({
        code: 'CONTEXT_BUDGET_EXCEEDED', details: { reason: 'template', outputTokens: 2048 },
      });
      expect(reserveForGeneration).not.toHaveBeenCalled();
      expect(stream).not.toHaveBeenCalled();
    });

    it('includes the system prompt once when formatting a text-completion template', async () => {
      vi.mocked(resolveStoryCharacter).mockResolvedValue({ id: 'char-1', cardData: { extensions: { promptTemplate: 'alpaca' } } } as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({ systemPrompt: 'SYSTEM_ONLY_ONCE', atDepthEntries: [] });
      vi.mocked(contextManager.buildContext).mockReturnValueOnce({ messages: [{ role: 'system', content: 'SYSTEM_ONLY_ONCE' },
        { role: 'user', content: 'Hello' }], totalTokens: 20, truncated: false, truncatedCount: 0 });
      const stream = vi.spyOn(h, 'streamTextCompletion').mockResolvedValue({ content: 'reply', usage: null });
      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);
      expect(String(stream.mock.calls[0][2]).split('SYSTEM_ONLY_ONCE')).toHaveLength(2);
    });
    it.each([
      { versioned: true, interrupted: false },
      { versioned: true, interrupted: true },
      { versioned: false, interrupted: true },
      { versioned: false, interrupted: false },
    ])('bounds variables and derived updates for $versioned versioned / $interrupted interrupted', async ({ versioned, interrupted }) => {
      const controller = new AbortController();
      const character = { id: 'char-1', name: 'Alice', cardData: {} };
      vi.mocked(resolveStoryCharacter).mockResolvedValue(character as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({ systemPrompt: 'sys', atDepthEntries: [] } as never);
      vi.mocked(chatRepository.findById).mockResolvedValue({ id: CHAT, userId: USER, characterId: character.id, contentSnapshotVersion: versioned ? 1 : null } as never);
      const prepared = versioned ? { prompt: 'saved state' } as PreparedStoryTurn : null;
      vi.spyOn(h, 'streamLlmResponse').mockImplementation(async () => {
        if (interrupted) controller.abort();
        return { content: VARIABLE_OUTPUT, usage: null };
      });
      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT, controller.signal, prepared, 'turn-1');
      expect(settleGeneration).toHaveBeenCalledOnce();
      expect(saveLegacyAssistantMessage).toHaveBeenCalledTimes(!versioned && !interrupted ? 1 : 0);
      expect(chatVariableStore.setChatVar).not.toHaveBeenCalled();
      expect(chatVariableStore.deleteChatVar).not.toHaveBeenCalled();
      expect(chatService.checkAndExtractMemories).toHaveBeenCalledTimes(versioned || interrupted ? 0 : 1);
      expect(chatService.updateEmotionFromMessage).toHaveBeenCalledTimes(interrupted ? 1 : 2);
      if (versioned) expect(commitStoryTurn).toHaveBeenCalledWith(prepared, 1, 'turn-1', expect.any(String), interrupted, expect.anything(), undefined, VARIABLE_OUTPUT);
      else if (interrupted) expect(chatService.addMessage).toHaveBeenCalledWith(CHAT, expect.objectContaining({ extra: { stateStatus: 'interrupted' } }));
    });

    it('does not apply secondary writes when the story commit fails', async () => {
      vi.mocked(commitStoryTurn).mockRejectedValueOnce(new AppError('Version changed', 409, 'STORY_STATE_CONFLICT'));
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: VARIABLE_OUTPUT, usage: null });
      await expect(h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT, undefined, { prompt: 'saved state' } as PreparedStoryTurn, 'turn-1')).rejects.toThrow('Version changed');
      expect(settleGeneration).toHaveBeenCalledWith(HOLD, expect.objectContaining({ messageId: null }));
      expect(chatVariableStore.setChatVar).not.toHaveBeenCalled();
      expect(chatVariableStore.deleteChatVar).not.toHaveBeenCalled();
      expect(chatService.checkAndExtractMemories).not.toHaveBeenCalled();
    });

    it('does not reinterpret a committed response as interrupted by a late abort', async () => {
      const controller = new AbortController();
      vi.mocked(resolveStoryCharacter).mockResolvedValue({ id: 'char-1', name: 'Alice', cardData: {} } as never);
      vi.mocked(chatService.buildEnhancedSystemPrompt).mockResolvedValue({ systemPrompt: 'sys', atDepthEntries: [] } as never);
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'Confirmed response', usage: null });
      vi.mocked(commitStoryTurn).mockImplementationOnce(async () => {
        controller.abort();
        return { id: 12 } as never;
      });
      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT, controller.signal, { prompt: 'saved state' } as PreparedStoryTurn, 'turn-1');
      expect(commitStoryTurn).toHaveBeenCalledWith(expect.anything(), 1, 'turn-1', 'Confirmed response', false, expect.anything(), undefined, 'Confirmed response');
      expect(chatService.checkAndExtractMemories).not.toHaveBeenCalled();
      expect(settleGeneration).toHaveBeenCalledWith(HOLD, expect.objectContaining({ messageId: 12 }));
    });
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

    it('uses the request limit rather than the declared 64K model capability', async () => {
      vi.mocked(getModelMeta).mockReturnValue({ id: 'custom-model', provider: 'custom', contextWindow: 1000000,
        maxOutputTokens: 2048, outputCapabilityTokens: 64000, defaultTemperature: 0.7 });
      vi.mocked(reserveForGeneration).mockResolvedValueOnce({ ...HOLD, maxOutputTokens: 2048 });
      const stream = vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'Hi', usage: null });
      await h.handleSingleCharacterResponse(CHAT, 'Hello', USER, 1, TENANT);
      expect(reserveForGeneration).toHaveBeenCalledWith(expect.objectContaining({ requestedMaxTokens: 2048 }));
      expect((stream.mock.calls[0][7] as StreamOptions).maxTokens).toBe(2048);
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
      expect(options.maxTokens).toBe(4096);
      expect(settleGeneration).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 2 }));
    });
  });

  describe('group chat reply', () => {
    beforeEach(() => {
      vi.mocked(resolveStoryCharacter).mockResolvedValue({ id: 'char-1', name: 'Alice', cardData: {} } as never);
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

    it.each([true, false])('stops after a truncated group fragment without undoing earlier replies (versioned: %s)', async versioned => {
      vi.mocked(chatRepository.findById).mockResolvedValue({ id: CHAT, userId: USER, contentSnapshotVersion: versioned ? 1 : null } as never);
      vi.mocked(prepareStoryTurn).mockResolvedValue(versioned ? { prompt: 'saved state' } as PreparedStoryTurn : null);
      const stream = vi.spyOn(h, 'streamLlmResponse')
        .mockResolvedValueOnce({ content: 'first completed reply', usage: null })
        .mockResolvedValueOnce({ content: VARIABLE_OUTPUT, usage: null, outputTruncated: true });
      await expect(h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-2', 'char-3'], TENANT, undefined, 1, 'group-request'))
        .rejects.toMatchObject({ code: 'GENERATION_OUTPUT_TRUNCATED' });
      expect(stream).toHaveBeenCalledTimes(2);
      expect(settleGeneration).toHaveBeenCalledTimes(2);
      if (versioned) {
        expect(vi.mocked(commitStoryTurn).mock.calls.map(call => call[4])).toEqual([false, true]);
      } else {
        expect(messageRepository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ extra: { stateStatus: 'interrupted' } }));
      }
      expect(chatVariableStore.setChatVar).not.toHaveBeenCalled();
      expect(chatService.updateEmotionFromMessage).toHaveBeenCalledTimes(2);
      expect(chatService.checkAndExtractMemories).toHaveBeenCalledTimes(versioned ? 0 : 1);
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

    it('stops an oversized later group reply without reversing an already committed reply', async () => {
      vi.mocked(prepareStoryTurn).mockResolvedValue({ prompt: 'saved state' } as PreparedStoryTurn);
      vi.mocked(contextManager.injectAtDepth)
        .mockReturnValueOnce([{ role: 'user', content: 'Hello' }])
        .mockReturnValueOnce([{ role: 'system', content: '大段世界书'.repeat(30000) }]);
      const stream = vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'first completed reply', usage: null });
      await expect(h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-2'], TENANT, undefined, 1, 'group-request'))
        .rejects.toMatchObject({ code: 'CONTEXT_BUDGET_EXCEEDED' });
      expect(stream).toHaveBeenCalledOnce();
      expect(reserveForGeneration).toHaveBeenCalledOnce();
      expect(settleGeneration).toHaveBeenCalledOnce();
      expect(commitStoryTurn).toHaveBeenCalledOnce();
      expect(releaseGeneration).not.toHaveBeenCalled();
    });

    it.each([true, false])('does not apply legacy variables in a versioned group (interrupted: %s)', async interrupted => {
      const controller = new AbortController();
      vi.mocked(chatRepository.findById).mockResolvedValue({ id: CHAT, userId: USER, contentSnapshotVersion: 1 } as never);
      vi.mocked(prepareStoryTurn).mockResolvedValue({ prompt: 'saved state' } as PreparedStoryTurn);
      vi.spyOn(h, 'streamLlmResponse').mockImplementation(async () => {
        if (interrupted) controller.abort();
        return { content: VARIABLE_OUTPUT, usage: null };
      });
      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1'], TENANT, controller.signal, 1, 'group-turn');
      expect(commitStoryTurn).toHaveBeenCalledOnce();
      expect(settleGeneration).toHaveBeenCalledOnce();
      expect(chatVariableStore.setChatVar).not.toHaveBeenCalled();
      expect(chatVariableStore.deleteChatVar).not.toHaveBeenCalled();
      expect(chatService.checkAndExtractMemories).not.toHaveBeenCalled();
      expect(chatService.updateEmotionFromMessage).toHaveBeenCalledTimes(interrupted ? 0 : 2);
    });

    it('retains an interrupted legacy group fragment without variable or memory effects', async () => {
      const controller = new AbortController();
      vi.spyOn(h, 'streamLlmResponse').mockImplementation(async () => {
        controller.abort();
        return { content: VARIABLE_OUTPUT, usage: null };
      });
      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-2'], TENANT, controller.signal);
      expect(messageRepository.create).toHaveBeenCalledOnce();
      expect(messageRepository.create).toHaveBeenCalledWith(expect.objectContaining({ extra: { stateStatus: 'interrupted' } }));
      expect(chatVariableStore.setChatVar).not.toHaveBeenCalled();
      expect(chatVariableStore.deleteChatVar).not.toHaveBeenCalled();
      expect(chatService.checkAndExtractMemories).not.toHaveBeenCalled();
      expect(chatService.updateEmotionFromMessage).not.toHaveBeenCalled();
    });

    it('retains legacy variable support after a complete group response', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: VARIABLE_OUTPUT, usage: null });
      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1'], TENANT);
      expect(saveLegacyAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({ chatId: CHAT, content: VARIABLE_OUTPUT, characterId: 'char-1' }), undefined);
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.ASSISTANT_MESSAGE_DONE, data: expect.objectContaining({ variablesChanged: true }),
      }));
      expect(chatService.checkAndExtractMemories).toHaveBeenCalledOnce();
    });

    it('continues a saved group round when derived memory fails', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: 'Confirmed reply', usage: null });
      vi.mocked(chatService.checkAndExtractMemories).mockRejectedValueOnce(new Error('embedding unavailable'));
      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-2'], TENANT);
      expect(messageRepository.create).toHaveBeenCalledTimes(2);
      expect(settleGeneration).toHaveBeenCalledTimes(2);
      expect(websocketService.broadcastToChat).toHaveBeenCalledTimes(2);
    });

    it('honors stop during a legacy commit before starting the next character', async () => {
      vi.mocked(groupChatService.isGroupChat).mockResolvedValue(true);
      vi.mocked(groupChatService.selectRespondents).mockResolvedValue(['char-1', 'char-2']);
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: VARIABLE_OUTPUT, usage: null });
      vi.mocked(saveLegacyAssistantMessage).mockImplementationOnce(async data => {
        await h.handleAbortGeneration(CLIENT_ID, { type: WSMessageType.ABORT_GENERATION, timestamp: '', data: { chatId: CHAT } });
        return messageRepository.create(data);
      });
      await h.handleUserMessage(CLIENT_ID, userMessage());
      expect(saveLegacyAssistantMessage).toHaveBeenCalledOnce();
      expect(reserveForGeneration).toHaveBeenCalledOnce();
      expect(settleGeneration).toHaveBeenCalledWith(HOLD, expect.objectContaining({ messageId: 9 }));
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED, data: expect.objectContaining({ status: 'stopped' }),
      }));
    });

    it('keeps a final committed response completed when stop arrives during commit', async () => {
      vi.mocked(groupChatService.isGroupChat).mockResolvedValue(true);
      vi.mocked(groupChatService.selectRespondents).mockResolvedValue(['char-1']);
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: VARIABLE_OUTPUT, usage: null });
      vi.mocked(saveLegacyAssistantMessage).mockImplementationOnce(async data => {
        await h.handleAbortGeneration(CLIENT_ID, { type: WSMessageType.ABORT_GENERATION, timestamp: '', data: { chatId: CHAT } });
        return messageRepository.create(data);
      });
      await h.handleUserMessage(CLIENT_ID, userMessage());
      expect(saveLegacyAssistantMessage).toHaveBeenCalledOnce();
      expect(websocketService.broadcastToChat).toHaveBeenCalledWith(CHAT, expect.objectContaining({
        type: WSMessageType.GENERATION_FINISHED, data: expect.objectContaining({ status: 'completed' }),
      }));
    });

    it('does not acknowledge a failed legacy transaction or start another character', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: VARIABLE_OUTPUT, usage: null });
      vi.mocked(saveLegacyAssistantMessage).mockRejectedValueOnce(new Error('transaction rolled back'));
      await expect(h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-2'], TENANT)).rejects.toThrow('transaction rolled back');
      expect(saveLegacyAssistantMessage).toHaveBeenCalledOnce();
      expect(settleGeneration).toHaveBeenCalledWith(HOLD, expect.objectContaining({ messageId: null }));
      expect(websocketService.broadcastToChat).not.toHaveBeenCalled();
      expect(chatService.checkAndExtractMemories).not.toHaveBeenCalled();
    });

    it('settles an aborted (empty) group reply and stops the round', async () => {
      vi.spyOn(h, 'streamLlmResponse').mockResolvedValue({ content: '', usage: null });

      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-1'], TENANT);

      expect(reserveForGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledWith(HOLD, expect.objectContaining({ messageId: null }));
      expect(messageRepository.create).not.toHaveBeenCalled();
    });

    it('shares one abort signal across the group round', async () => {
      const controller = new AbortController();
      vi.spyOn(h, 'streamLlmResponse').mockImplementation(async (...args: unknown[]) => {
        expect(args[6]).toBe(controller.signal);
        controller.abort();
        return { content: '', usage: null };
      });

      await h.handleGroupChatResponse(CHAT, 'Hello', USER, ['char-1', 'char-1'], TENANT, controller.signal);

      expect(reserveForGeneration).toHaveBeenCalledTimes(1);
      expect(settleGeneration).toHaveBeenCalledTimes(1);
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
