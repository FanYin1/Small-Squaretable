import type { ModelMeta } from '../../types/llm';
import { resolveGenerationParameters } from '../services/generation-parameters';
/**
 * WebSocket Route
 *
 * 处理 WebSocket 连接和消息路由
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createHash } from 'node:crypto';
import type { Server } from 'http';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAccessToken } from '../../core/jwt';
import { logger } from '../services/logger.service';
import { db } from '../../db';
import { chats } from '../../db/schema/chats';

const wsLogger = logger.child({ module: 'websocket' });
import { websocketService } from '../services/websocket.service';
import { llmService } from '../services/llm.service';
import { AnthropicApiError } from '../services/anthropic-api-error';
import { getDefaultModel, getModelMeta } from '../config/llm.config';
import { config } from '../../core/config';
import { chatService, getChatModel } from '../services/chat.service';
import { contextManager, type LLMMessage } from '../services/context-manager.service';
import { ContextBudgetError, assertContextBudget, estimateContextMessages, estimateContextTokens } from '../services/context-budget';
import { getStorySummaries } from '../services/story-summary.service';
import { addStorySummaries } from '../services/story-summary-context';
import { AppError, NotFoundError } from '../../core/errors';
import { chatRepository } from '../../db/repositories/chat.repository';
import { resolveStoryCharacter, loadStoryContent } from '../services/story-content.service';
import { storyAudienceSchema, storyAudienceExtra, storyKnowledgeVisible, type StoryAudience } from '../../types/story-knowledge';
import { storyIntentVisiblePrefix, storyIntentPresentation, type StoryTurnDiagnostics } from '../../types/story-intent';
import { prepareStoryTurn, commitStoryTurn, type PreparedStoryTurn } from '../services/story-state.service';
import { appendStoryTurnContext, projectOpeningModeSourcePrompt } from '../services/story-turn-prompt';
import { storyActionRequestSchema, availableStoryActions } from '../../types/story-state';
import { messageRepository } from '../../db/repositories/message.repository';
import { generationRequestRepository } from '../../db/repositories/generation-request.repository';
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';
import { groupChatService } from '../services/group-chat.service';
import { applyRegexScripts, getRegexScripts, RegexPlacement } from '../services/regex-scripts.service';
import { formatMessagesWithTemplate } from '../config/prompt-templates';
import { applyLegacyVariables, saveLegacyAssistantMessage } from '../services/legacy-variables.service';
import { featureService } from '../services/feature.service';
import {
  meterUsage,
  meterLlmTokens,
  readOpenAiUsage,
  readOllamaUsage,
  estimateInjectedTokens,
  type ProviderUsage,
} from '../services/usage-meter';
import { countTokens } from '../utils/tokens';
import {
  assertCreditsAvailable,
  reserveForGeneration,
  settleGeneration,
  releaseGeneration,
} from '../services/credit-generation';
import { DEFAULT_MAX_OUTPUT_TOKENS, InsufficientCreditsError, type CreditHold } from '../services/credit-billing.service';
import {
  WSMessageType,
  type WSMessageUnion,
  type WSUserMessage,
  type WSChatControlMessage,
  type WSPingMessage,
  type WSTypingMessage,
  type WSEmotionChangeEvent,
  type WSMemoryRetrievalEvent,
  type WSMemoryExtractionEvent,
  type WSPromptBuildEvent,
  type WSAbortGenerationMessage,
  type WSChatReadMessage,
} from '../../types/websocket';
import { acquireChatOperation } from '../services/chat-operation';
import { nanoid } from 'nanoid';

/** 一次流式生成的结果：完整文本 + provider 在流末尾返回的真实 usage（拿不到为 null） */
interface StreamedLlmResult {
  content: string;
  usage: ProviderUsage | null;
  outputTruncated?: boolean;
  streamIncomplete?: boolean;
  finishReason?: StoryTurnDiagnostics['finishReason'];
}

function normalizeFinishReason(value: unknown): StoryTurnDiagnostics['finishReason'] {
  if (value == null) return undefined;
  return value === 'stop' || value === 'length' || value === 'content_filter' || value === 'tool_calls' ? value : 'other';
}

function assertNotTruncated(result: StreamedLlmResult): void {
  if (result.streamIncomplete) throw new AppError('模型回复传输未完整结束，已保留收到的片段，本轮未提交状态变化。',
    502, 'GENERATION_STREAM_INCOMPLETE');
  if (result.outputTruncated) throw new AppError('The response reached its output limit and was interrupted. Review the text before continuing.',
    502, 'GENERATION_OUTPUT_TRUNCATED');
}

/**
 * 流式生成的实时进度。流中途抛错或被中断时，调用方靠它知道「provider 已经连上了吗、
 * 已经产生了多少内容」，从而决定结算已产生的部分（started）还是直接释放预扣（未连上）。
 */
interface StreamProgress extends StreamedLlmResult {
  started: boolean;
  firstChunkAt?: number;
  firstVisibleAt?: number;
  modelRequestedAt?: number;
}

function newStreamProgress(): StreamProgress {
  return { started: false, content: '', usage: null };
}

/**
 * 生成失败时收尾预扣：provider 已连上就按已产生的内容结算（输入 token 已被计费），
 * 没连上就整笔释放。点数模式之外 hold 为 null，什么都不做。永不抛出。
 */
async function closeFailedGeneration(
  hold: CreditHold | null,
  progress: StreamProgress,
  estimatedPromptTokens: number,
  chatId: string
): Promise<void> {
  if (!hold) return;
  if (progress.started) {
    await settleGeneration(hold, {
      providerUsage: progress.usage,
      estimatedPromptTokens,
      outputText: progress.content,
      chatId,
    });
    return;
  }
  await releaseGeneration(hold);
}

export class WebSocketHandler {
  private wss: WebSocketServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private activeGenerations = new Map<string, {
    controller: AbortController;
    userId: string;
    tenantId: string;
    requestId: string;
    commitStarted?: boolean;
    stopAfterCommit?: boolean;
  }>();

  /**
   * 初始化 WebSocket 服务器
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });

    this.wss.on('connection', this.handleConnection.bind(this));

    // 启动心跳检查
    this.startHeartbeat();

    wsLogger.info('WebSocket server initialized on /ws');
  }

  /**
   * 处理新连接
   */
  private async handleConnection(ws: WebSocket, request: { url: string; headers: { host: string } }): Promise<void> {
    wsLogger.info('New connection attempt', { host: request.headers.host });
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    // 验证 token
    if (!token) {
      wsLogger.warn('WebSocket authentication rejected', { reason: 'missing_token' });
      this.sendError(ws, 'UNAUTHORIZED', 'Authentication token required');
      ws.close();
      return;
    }

    try {
      const payload = await verifyAccessToken(token);
      const clientId = websocketService.registerClient(ws, payload.userId, payload.tenantId);
      wsLogger.info('WebSocket connection authenticated');

      // 发送连接成功消息
      this.sendMessage(ws, {
        type: WSMessageType.CONNECTED,
        timestamp: new Date().toISOString(),
        data: {
          userId: payload.userId,
          tenantId: payload.tenantId,
        },
      });

      // 设置消息处理器
      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, data).catch((err) => {
          wsLogger.error('Error handling message', err as Error);
          this.sendError(ws, 'MESSAGE_ERROR', 'Failed to process message');
        });
      });

      // 设置关闭处理器
      ws.on('close', () => {
        websocketService.unregisterClient(clientId);
      });

      // 设置错误处理器
      ws.on('error', (err) => {
        wsLogger.error('WebSocket error', err as Error);
        websocketService.unregisterClient(clientId);
      });
    } catch (err) {
      wsLogger.warn('WebSocket authentication rejected', { reason: 'invalid_token' });
      this.sendError(ws, 'UNAUTHORIZED', 'Invalid authentication token');
      ws.close();
    }
  }

  /**
   * 处理消息
   */
  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    try {
      const message: WSMessageUnion = JSON.parse(data.toString());
      wsLogger.debug('Received message', { type: message.type });

      switch (message.type) {
        case WSMessageType.USER_MESSAGE:
          wsLogger.debug('Processing USER_MESSAGE');
          await this.handleUserMessage(clientId, message as WSUserMessage);
          break;

        case WSMessageType.JOIN_CHAT:
          await this.handleJoinChat(clientId, message as WSChatControlMessage);
          break;

        case WSMessageType.LEAVE_CHAT:
          await this.handleLeaveChat(clientId, message as WSChatControlMessage);
          break;

        case WSMessageType.TYPING_START:
        case WSMessageType.TYPING_STOP:
          await this.handleTyping(clientId, message as WSTypingMessage);
          break;

        case WSMessageType.PING:
          await this.handlePing(clientId, message as WSPingMessage);
          break;

        case WSMessageType.ABORT_GENERATION:
          await this.handleAbortGeneration(clientId, message as WSAbortGenerationMessage);
          break;

        case WSMessageType.CHAT_READ:
          await this.handleChatRead(clientId, message as WSChatReadMessage);
          break;

        default:
          wsLogger.warn('Unknown message type', { type: message.type });
      }
    } catch (error) {
      wsLogger.error('Error parsing message', error as Error);
    }
  }

  /**
   * 处理用户消息
   */
  private async handleUserMessage(clientId: string, message: WSUserMessage): Promise<void> {
    wsLogger.debug('handleUserMessage called');
    const clientInfo = websocketService.getClientInfo(clientId);
    if (!clientInfo) {
      wsLogger.warn('No client info found', { clientId });
      return;
    }

    const { chatId, content, mentionedCharacterIds } = message.data;
    const clientMessageId = message.data.clientMessageId || message.data.messageId;
    wsLogger.debug('Processing message', { chatId, contentPreview: content.substring(0, 50) });
    const requestId = clientMessageId || nanoid();
    if (this.activeGenerations.has(chatId)) {
      websocketService.sendToClient(clientId, {
        type: WSMessageType.ERROR,
        timestamp: new Date().toISOString(),
        data: { code: 'GENERATION_BUSY', message: 'A reply is already being generated', chatId, requestId },
      });
      return;
    }
    const releaseOperation = acquireChatOperation(chatId);
    if (!releaseOperation) {
      websocketService.sendToClient(clientId, { type: WSMessageType.ERROR, timestamp: new Date().toISOString(),
        data: { code: 'GENERATION_BUSY', message: '请等待当前操作完成后再发送。', chatId, requestId } });
      return;
    }
    const turn = { controller: new AbortController(), userId: clientInfo.userId, tenantId: clientInfo.tenantId, requestId };
    this.activeGenerations.set(chatId, turn);
    let status: 'completed' | 'stopped' | 'failed' = 'completed';
    let authorized = false;
    let retryable = false;
    let generationId: string | undefined;
    let errorCode: string | undefined;
    let duplicateRequest = false;

    try {
      const chat = await chatRepository.findById(chatId);
      if (!chat) {
        throw new NotFoundError('Chat');
      }
      if (chat.userId !== clientInfo.userId || chat.tenantId !== clientInfo.tenantId) {
        throw new AppError('You do not have access to this chat', 403, 'FORBIDDEN');
      }
      authorized = true;
      const selectedModel = getChatModel(chat) || getDefaultModel() || 'glm-4.5-air';
      if (turn.controller.signal.aborted) return;
      if (typeof requestId !== 'string' || requestId.length > 200) {
        throw new AppError('Invalid generation request id', 400, 'INVALID_REQUEST_ID');
      }
      const payloadHash = createHash('sha256')
        .update(JSON.stringify({ content, mentionedCharacterIds: mentionedCharacterIds ?? [], ...(message.data.storyAction ? { storyAction: message.data.storyAction } : {}),
          ...(message.data.storyAudience ? { storyAudience: message.data.storyAudience } : {}) }))
        .digest('hex');
      const existingGeneration = await generationRequestRepository.findByRequest(chatId, requestId);
      if (existingGeneration && existingGeneration.payloadHash !== payloadHash) {
        duplicateRequest = true;
        throw new AppError('This request id is already associated with different input', 409, 'IDEMPOTENCY_CONFLICT');
      }
      const existingUserMessage = clientMessageId
        ? await messageRepository.findByClientMessageId(chatId, clientMessageId)
        : null;
      if (existingUserMessage) {
        duplicateRequest = true;
        if (existingUserMessage.role !== 'user' || existingUserMessage.content !== content) {
          throw new AppError('This message id is already associated with different content', 409, 'IDEMPOTENCY_CONFLICT');
        }
        websocketService.sendToClient(clientId, {
          type: WSMessageType.USER_MESSAGE,
          timestamp: new Date().toISOString(),
          data: { chatId, content, messageId: existingUserMessage.id.toString(), clientMessageId },
        });
        throw new AppError('This request was already accepted. Check the saved story and balance before continuing.', 409, 'GENERATION_ALREADY_ACCEPTED');
      }
      if (existingGeneration) {
        duplicateRequest = true;
        throw new AppError('This request was already accepted. Check the saved story and balance before continuing.', 409, 'GENERATION_ALREADY_ACCEPTED');
      }
      const storyAction = message.data.storyAction == null ? undefined : storyActionRequestSchema.parse(message.data.storyAction);
      const audience = message.data.storyAudience === undefined ? undefined : storyAudienceSchema.parse(message.data.storyAudience).sort();
      if (audience) {
        if (chat.contentSnapshotVersion !== 1 || !(await groupChatService.isGroupChat(chatId))) {
          throw new AppError('Private story conversations require a versioned group story.', 400, 'STORY_AUDIENCE_UNSUPPORTED');
        }
        const snapshot = await loadStoryContent(chatId, clientInfo.userId);
        if (audience.some(id => !snapshot.characters.some(character => character.id === id)) ||
          mentionedCharacterIds?.some(id => !audience.includes(id))) {
          throw new AppError('The selected listener is not in this story conversation.', 400, 'STORY_AUDIENCE_INVALID');
        }
      }
      const preparedStory = await prepareStoryTurn(chat, content, storyAction, db,
        audience ? { characterId: audience[0], audience } : undefined);
      retryable = true;
      // 配额检查必须在这里做一次：WebSocket 不经过 Hono 中间件链，
      // HTTP 那边的 requireQuota('messages') 对这条链路完全无效，
      // 而客户端只要连上 WebSocket 就默认走这里。
      const quota = await featureService.checkQuota(clientInfo.tenantId, 'messages');
      if (!quota.allowed) {
        status = 'failed';
        websocketService.sendToClient(clientId, {
          type: WSMessageType.ERROR,
          timestamp: new Date().toISOString(),
          data: {
            code: 'QUOTA_EXCEEDED',
            chatId,
            requestId,
            message: `Message quota exceeded (${quota.currentUsage}/${quota.limit})`,
          },
        });
        return;
      }

      // 预付点数模式：余额为 0 时在保存用户消息之前就拒绝（订阅模式为空操作）。
      // 真正的并发安全由每次生成前的 reserve 保证，这里只是避免明显的「消息已落库、生成被拒」
      await assertCreditsAvailable(clientInfo.tenantId);
      if (turn.controller.signal.aborted) return;

      retryable = false;
      const claim = await generationRequestRepository.claim(chatId, requestId, payloadHash);
      if (!claim.claimed) {
        duplicateRequest = true;
        if (claim.request.payloadHash !== payloadHash) {
          throw new AppError('This request id is already associated with different input', 409, 'IDEMPOTENCY_CONFLICT');
        }
        throw new AppError('This request was already accepted. Check the saved story and balance before continuing.', 409, 'GENERATION_ALREADY_ACCEPTED');
      }
      generationId = claim.request.id;
      if (turn.controller.signal.aborted) return;
      const userMessage = await chatService.addMessage(chatId, {
        role: 'user',
        content,
        extra: { ...(clientMessageId ? { clientMessageId } : {}), ...storyAudienceExtra(audience) },
      });

      await generationRequestRepository.markRunning(generationId, userMessage.id);

      await meterUsage(clientInfo.tenantId, 'messages', 1, {
        transport: 'websocket',
        chatId,
        role: 'user',
      });

      websocketService.broadcastToChat(chatId, {
        type: WSMessageType.USER_MESSAGE,
        timestamp: new Date().toISOString(),
        data: {
          chatId,
          content,
          messageId: userMessage.id.toString(),
          clientMessageId,
          ...storyAudienceExtra(audience),
        },
      });
      // Check if this is a group chat (multiple characters)
      const isGroup = await groupChatService.isGroupChat(chatId);
      if (turn.controller.signal.aborted) return;

      if (isGroup) {
        // --- Group chat: multi-character response loop ---
        await this.handleGroupChatResponse(
          chatId,
          content,
          clientInfo.userId,
          mentionedCharacterIds,
          clientInfo.tenantId,
          turn.controller.signal,
          userMessage.id,
          requestId,
          audience
        );
      } else {
        // --- Single-character path (unchanged) ---
        const result = await this.handleSingleCharacterResponse(
          chatId,
          content,
          clientInfo.userId,
          userMessage.id,
          clientInfo.tenantId,
          turn.controller.signal,
          preparedStory,
          requestId,
          selectedModel
        );
        if (result?.validationError) {
          status = 'failed'; errorCode = result.validationError; retryable = false;
        }
      }
    } catch (error) {
      if (turn.controller.signal.aborted && error instanceof Error && error.name === 'AbortError') {
        status = 'stopped';
        return;
      }
      status = 'failed';
      errorCode = error instanceof AppError ? error.code : 'MESSAGE_ERROR';
      if (error instanceof ContextBudgetError || errorCode === 'GENERATION_OUTPUT_TRUNCATED' || errorCode === 'GENERATION_STREAM_INCOMPLETE') retryable = false;
      if (error instanceof AnthropicApiError && !error.retryable) retryable = false;
      wsLogger.error('Error handling user message', error instanceof AnthropicApiError ? error : undefined, {
        chatId, requestId, errorCode,
        ...(error instanceof AppError ? { statusCode: error.statusCode } : {}),
        ...(error instanceof AnthropicApiError ? { provider: 'anthropic', category: error.category, bodyState: error.bodyState } : {}),
      });
      websocketService.sendToClient(clientId, {
        type: WSMessageType.ERROR,
        timestamp: new Date().toISOString(),
        data: {
          // AppError（例如 P0-7 的 PLATFORM_SPEND_LIMIT）带着面向用户的可读信息和稳定错误码，
          // 原样透传，客户端才能区分「平台限流」和普通失败
          code: error instanceof AppError ? error.code : 'MESSAGE_ERROR',
          chatId,
          requestId,
          message: error instanceof Error ? error.message : 'Failed to process message',
          // 点数不足（P3-1）带上点数明细，客户端报警弹窗据此显示「需要 X 点 / 可用 Y 点」。
          // 其它 AppError 的 details 不下发
          ...(error instanceof InsufficientCreditsError || error instanceof ContextBudgetError ? { details: error.details } : {}),
        },
      });
    } finally {
      if (status === 'completed' && turn.controller.signal.aborted) status = 'stopped';
      if (generationId) {
        try {
          await generationRequestRepository.finish(generationId, status, errorCode);
        } catch (error) {
          wsLogger.error('Failed to persist generation outcome', { chatId, requestId, generationId, error: (error as Error).message });
        }
      }
      if (this.activeGenerations.get(chatId) === turn) this.activeGenerations.delete(chatId);
      releaseOperation();
      const finished = {
        type: WSMessageType.GENERATION_FINISHED as const,
        timestamp: new Date().toISOString(),
        data: { chatId, requestId, retryable: status === 'failed' && retryable, status, ...(errorCode ? { errorCode } : {}) },
      };
      if (authorized && !duplicateRequest) websocketService.broadcastToChat(chatId, finished);
      else websocketService.sendToClient(clientId, finished);
    }
  }

  /**
   * Single-character response (original behavior, unchanged)
   */
  private async handleSingleCharacterResponse(
    chatId: string,
    content: string,
    userId: string,
    userMessageId: number,
    tenantId?: string,
    signal?: AbortSignal,
    preparedStory?: PreparedStoryTurn | null,
    requestId?: string,
    selectedModel?: string
  ): Promise<{ validationError?: string } | void> {
    if (signal?.aborted) return;
    const turnStartedAt = performance.now();
    const chat = await chatRepository.findById(chatId);
    if (!chat) throw new Error('Chat not found');

    const character = await resolveStoryCharacter(chat, chat.characterId);
    const interpretation = preparedStory?.intentProtocol && !preparedStory.action && !preparedStory.confirmedIntent
      ? { input: content, direct: preparedStory.directResponse, actionIds: availableStoryActions(preparedStory.rules, preparedStory.values, preparedStory.completedActions).map(action => action.id) }
      : undefined;

    const chatMetadata = (chat.metadata as Record<string, unknown>) || {};
    const activeBranchLeaf = chatMetadata.activeBranchLeafId as number | undefined;

    let chatMessages: LLMMessage[];
    const historyReadStartedAt = performance.now();
    if (activeBranchLeaf) {
      chatMessages = (await messageRepository.findBranch(chatId, activeBranchLeaf)).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        pinned: m.pinned,
        importance: m.importance,
        messageId: m.id,
      }));
    } else {
      const messages = await chatService.getContextMessages(chatId);
      chatMessages = messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        pinned: m.pinned,
        importance: m.importance,
        messageId: m.id,
      }));
    }
    const historyReadMs = Math.round(performance.now() - historyReadStartedAt);

    // Determine model from chat metadata or default
    const model = selectedModel || getChatModel(chat) || getDefaultModel() || 'glm-4.5-air';
    const generationLimits = resolveGenerationParameters(getModelMeta(model));

    let systemPrompt = '';
    let atDepthEntries: Array<{ depth: number; content: string; role: 'system' | 'user' | 'assistant' }> = [];
    // cache_friendly 布局下变动块在截断之后才注入，预算要预先扣掉它（P3-3）
    let reservedTokens = 0;
    const promptBuildStartedAt = performance.now();
    if (character) {
      const enhancedPrompt = await chatService.buildEnhancedSystemPrompt({
        character,
        characterId: character.id,
        userId,
        chatId,
        userMessage: content,
        messages: chat.worldbookSnapshotVersion != null ? chatMessages : undefined,
        worldbookSnapshotVersion: chat.worldbookSnapshotVersion,
        contentSnapshotVersion: chat.contentSnapshotVersion,
        isolateKnowledge: chat.contentSnapshotVersion === 1,
        personaId: chat.personaId || undefined,
        identitySnapshot: chat.identitySnapshot,
      });
      systemPrompt = enhancedPrompt.systemPrompt;
      atDepthEntries = enhancedPrompt.atDepthEntries;
      reservedTokens = enhancedPrompt.reservedTokens ?? 0;

      // Isolated stories do not consume generic emotion in their prompt. Derive it
      // after the saved reply, so sentiment inference cannot delay the first word.
      if (chat.contentSnapshotVersion !== 1) {
        await chatService.updateEmotionFromMessage(
          character.id, userId, chatId, content, userMessageId
        );
      }
    }
    const promptBuildMs = Math.round(performance.now() - promptBuildStartedAt);

    systemPrompt = projectOpeningModeSourcePrompt(systemPrompt, preparedStory?.ruleScope);
    atDepthEntries = appendStoryTurnContext(atDepthEntries.map(entry => ({ ...entry,
      content: projectOpeningModeSourcePrompt(entry.content, preparedStory?.ruleScope),
    })), preparedStory?.prompt);

    // Fix: Ensure AI continues the greeting scene
    // Based on SillyTavern best practices: use Author's Note at depth 0
    wsLogger.info('Checking greeting continuity', {
      chatMessagesLength: chatMessages.length,
      firstRole: chatMessages[0]?.role,
      chatId
    });

    if (chatMessages.length === 2 && chatMessages[0].role === 'assistant') {
      wsLogger.info('✅ Applying greeting continuity fix', { chatId });

      // Extract scene context from greeting
      const greetingContent = chatMessages[0].content;
      const scenePreview = greetingContent.substring(0, 400);

      // SillyTavern approach: Insert Author's Note at depth 0 (before the last user message)
      // This ensures the LLM sees the instruction right before generating the response
      const authorNote = {
        role: 'system' as const,
        content: `[Author's Note: You are continuing the roleplay scene you established. Your previous message set this scene: "${scenePreview}..." - Continue naturally from where you left off. Do not restart or give a generic greeting.]`
      };

      // Insert at depth 0: right before the last message (user's input)
      // chatMessages = [assistant_greeting, user_input]
      // After insertion: [assistant_greeting, author_note, user_input]
      chatMessages.splice(chatMessages.length - 1, 0, authorNote);

      wsLogger.info('Inserted Author\'s Note at depth 0', {
        totalMessages: chatMessages.length,
        roles: chatMessages.map(m => m.role)
      });
    }

    // Use context manager to fit within token budget
    const promptTemplate = (character?.cardData as { extensions?: { promptTemplate?: string } } | null)?.extensions?.promptTemplate || 'default';
    const depthBudget = Math.max(reservedTokens, estimateContextMessages(atDepthEntries));
    const contextBuildStartedAt = performance.now();
    let contextResult = contextManager.buildContext(systemPrompt, chatMessages, model, depthBudget, generationLimits);
    if (chat.contentSnapshotVersion === 1 && character && promptTemplate === 'default' && contextResult.truncated) {
      contextResult = addStorySummaries(systemPrompt, chatMessages, model, depthBudget, contextResult,
        await getStorySummaries(chatId, userId, chat.tenantId, character.id), generationLimits);
    }
    const contextBuildMs = Math.round(performance.now() - contextBuildStartedAt);

    // Debug: Log what's actually being sent to LLM
    if (config.nodeEnv !== 'production' && chatMessages.length <= 3) {
      wsLogger.info('🔍 DEBUG: Messages sent to LLM', {
        chatId,
        systemPromptLength: systemPrompt.length,
        systemPromptPreview: systemPrompt.substring(0, 200) + '...',
        messageCount: contextResult.messages.length,
        messages: contextResult.messages.map((m, i) => ({
          index: i,
          role: m.role,
          contentLength: m.content.length,
          contentPreview: m.content.substring(0, 150) + '...'
        }))
      });
    }

    // Inject depth entries (depth_prompt, world book atDepth) into the message array
    contextResult.messages = contextManager.injectAtDepth(contextResult.messages, atDepthEntries);
    assertContextBudget(estimateContextMessages(contextResult.messages) + 2, generationLimits);


    const assistantMessageId = nanoid();
    if (signal?.aborted) return;

    let generated: StreamedLlmResult;
    // 输入 token 估算：context-manager 的 totalTokens 不含之后注入的 atDepth 条目，这里补上
    let estimatedPromptTokens =
      contextResult.totalTokens + estimateInjectedTokens(atDepthEntries);
    // 所有模板复用流式路径，在本调用方记录平台花费
    // 预付点数模式下的预扣；订阅模式恒为 null
    let hold: CreditHold | null = null;
    const progress = newStreamProgress();
    const modelStartedAt = performance.now();
    try {
      if (promptTemplate !== 'default') {
        // Use text completion with formatted prompt for non-default templates
        wsLogger.info('Using prompt template', { chatId, template: promptTemplate });

        // Build full message array with system prompt
        // Format messages using the template
        const formattedPrompt = formatMessagesWithTemplate(contextResult.messages, promptTemplate);
        assertContextBudget(estimateContextTokens(formattedPrompt), generationLimits, 'template', generationLimits.maxOutputTokens);

        // 模板路径实际发给 provider 的是格式化后的整段 prompt，按它估算输入
        estimatedPromptTokens = countTokens(formattedPrompt);

        // 模板和普通聊天共用已解析的模型额度，预扣与请求一致
        hold = await reserveForGeneration({
          tenantId,
          chatId,
          estimatedPromptTokens,
          requestedMaxTokens: generationLimits.maxOutputTokens,
          metadata: { transport: 'websocket', model, template: promptTemplate },
        });

        // Use text completion API
        generated = await this.streamTextCompletion(
          chatId,
          assistantMessageId,
          formattedPrompt,
          model,
          signal,
          preparedStory?.intentProtocol,
          interpretation,
          { limits: generationLimits, progress }
        );
      } else {
        hold = await reserveForGeneration({
          tenantId,
          chatId,
          estimatedPromptTokens,
          requestedMaxTokens: generationLimits.maxOutputTokens,
          metadata: { transport: 'websocket', model },
        });

        // Use standard chat completion for default template
        generated = await this.streamLlmResponse(
          chatId,
          assistantMessageId,
          contextResult.messages,
          undefined,
          undefined,
          model,
          signal,
          { maxTokens: hold?.maxOutputTokens ?? generationLimits.maxOutputTokens, limits: generationLimits, progress, storyIntent: preparedStory?.intentProtocol, interpretation }
        );
      }
    } catch (error) {
      // 连接前失败 -> 释放；流中途失败 -> 结算已产生的部分。不留悬空预扣
      await closeFailedGeneration(hold, progress, estimatedPromptTokens, chatId);
      throw error;
    }
    let fullContent = generated.content;
    wsLogger.info('WebSocket generation performance', {
      chatId,
      historyReadMs,
      promptBuildMs,
      contextBuildMs,
      preparationMs: Math.round(modelStartedAt - turnStartedAt),
      firstTokenMs: progress.firstChunkAt == null ? null : Math.round(progress.firstChunkAt - (progress.modelRequestedAt ?? modelStartedAt)),
      firstVisibleMs: progress.firstVisibleAt == null ? null : Math.round(progress.firstVisibleAt - turnStartedAt),
      modelTotalMs: Math.round(performance.now() - modelStartedAt),
      generationTotalMs: Math.round(performance.now() - turnStartedAt),
      contextMessageCount: contextResult.messages.length,
      truncatedMessageCount: contextResult.truncatedCount,
    });

    // llm_tokens 计「输入 + 输出」（P0-1）：provider 的真实 usage 优先，拿不到才估算。
    // 放在空内容判断之前：被中断的请求，provider 也已经为输入收了费。
    // 历史上这里只算输出，长上下文的真实成本几乎没被计到。
    await meterLlmTokens(
      tenantId,
      { providerUsage: generated.usage, estimatedPromptTokens, outputText: fullContent },
      { transport: 'websocket', chatId, model },
      { recordPlatformSpend: true }
    );

    // 结算在保存助手消息之后做，这样流水能记下 messageId；
    // 空内容（中断）/ 保存失败 / 后处理抛错时 finally 仍会结算（不带 messageId），不会留悬空预扣
    let assistantMessage: Awaited<ReturnType<typeof chatService.addMessage>>;
    let savedMessageId: number | null = null;
    const interrupted = Boolean(signal?.aborted || generated.outputTruncated || generated.streamIncomplete);
    try {
      // A stopped empty request has no fragment to save. A normally completed
      // empty story reply must still be diagnosed instead of reporting success.
      if (!fullContent && (interrupted || !preparedStory?.intentProtocol)) { assertNotTruncated(generated); return; }

      if (preparedStory?.intentProtocol) fullContent = interpretation
        ? storyIntentPresentation(generated.content, interpretation.input, interpretation.actionIds, interrupted, interpretation.direct)
        : storyIntentVisiblePrefix(generated.content, !interrupted);

      // Apply regex_scripts post-processing on AI output (skip markdownOnly scripts — those run client-side)
      if (character) {
        const scripts = getRegexScripts(character.cardData as Record<string, unknown>);
        fullContent = applyRegexScripts(fullContent, scripts, RegexPlacement.AI_OUTPUT, false);
      }

      const activeTurn = this.activeGenerations.get(chatId);
      if (!interrupted && activeTurn) activeTurn.commitStarted = true;
      assistantMessage = preparedStory && requestId
        ? await commitStoryTurn(preparedStory, userMessageId, requestId, fullContent, interrupted, db, undefined, generated.content, { model, finishReason: generated.finishReason,
          ...(generated.streamIncomplete ? { streamIncomplete: true } : {}) })
        : chat.contentSnapshotVersion == null && !interrupted
        ? await saveLegacyAssistantMessage({ chatId, role: 'assistant', content: fullContent }, requestId)
        : await chatService.addMessage(chatId, {
        role: 'assistant',
        content: fullContent,
        ...(interrupted ? { extra: { stateStatus: 'interrupted' } } : {}),
      });
      savedMessageId = assistantMessage.id;
      fullContent = assistantMessage.content;
    } finally {
      await settleGeneration(hold, {
        providerUsage: generated.usage,
        estimatedPromptTokens,
        outputText: generated.content,
        chatId,
        messageId: savedMessageId,
      });
    }

    const diagnostic = (assistantMessage.extra as { storyDiagnostics?: StoryTurnDiagnostics } | null)?.storyDiagnostics;
    const validationFailed = (assistantMessage.extra as Record<string, unknown> | null)?.storyIntentInvalid === true;
    if (diagnostic) wsLogger[validationFailed ? 'warn' : 'info']('Story turn validation', {
      chatId, requestId, messageId: assistantMessage.id, ...diagnostic,
    });

    // 助手消息同样计入 messages：HTTP 回退路径下用户消息和助手消息
    // 是两次独立请求、各记一条，这里少记的话同样的对话在两条通道上
    // 会得出不同的用量。
    await meterUsage(tenantId, 'messages', 1, {
      transport: 'websocket',
      chatId,
      role: 'assistant',
    });

    const hasVarChanges = chat.contentSnapshotVersion == null && !interrupted && applyLegacyVariables(fullContent, {}).changed;

    // After saving assistant message, increment character growth
    if (character && !interrupted && (!preparedStory?.directResponse || (assistantMessage.extra as Record<string, unknown> | null)?.stateStatus === 'confirmed')) {
      characterGrowthRepository.getOrCreate(character.id, userId)
        .then((growth) => characterGrowthRepository.incrementMessages(growth.id))
        .catch((err) => wsLogger.warn('Failed to increment message growth', { error: err }));
    }

    // Increment unread count
    await db.update(chats)
      .set({ unreadCount: sql`${chats.unreadCount} + 1` })
      .where(eq(chats.id, chatId));

    websocketService.broadcastToChat(chatId, {
      type: WSMessageType.ASSISTANT_MESSAGE_DONE,
      timestamp: new Date().toISOString(),
      data: {
        chatId,
        messageId: assistantMessage.id.toString(),
        content: fullContent,
        requestId: this.activeGenerations.get(chatId)?.requestId,
        variablesChanged: hasVarChanges,
        ...(diagnostic ? { storyDiagnostics: diagnostic } : {}),
        stateStatus: (assistantMessage.extra as { stateStatus?: 'confirmed' | 'interrupted' | 'proposed' } | null)?.stateStatus,
        ...((assistantMessage.extra as Record<string, unknown> | null)?.storyExecutedIntent ? { storyExecutedIntent: (assistantMessage.extra as Record<string, unknown>).storyExecutedIntent as import('../../types/story-intent').StoryIntent } : {}),
        ...((assistantMessage.extra as Record<string, unknown> | null)?.storyIntent ? { storyIntent: (assistantMessage.extra as Record<string, unknown>).storyIntent as import('../../types/story-intent').StoredStoryIntent } : {}),
        ...((assistantMessage.extra as Record<string, unknown> | null)?.storyConfirmedIntent ? { storyConfirmedIntent: (assistantMessage.extra as Record<string, unknown>).storyConfirmedIntent as import('../../types/story-intent').StoryIntent } : {}),
        ...((assistantMessage.extra as Record<string, unknown> | null)?.storyIntentInvalid ? { storyIntentInvalid: true } : {}),
        ...((assistantMessage.extra as Record<string, unknown> | null)?.storyRecommendations
          ? { storyRecommendations: (assistantMessage.extra as Record<string, unknown>).storyRecommendations as Array<{ label: string; input: string }> } : {}),
        ...((assistantMessage.extra as Record<string, unknown> | null)?.storyRecommendationsSource
          ? { storyRecommendationsSource: (assistantMessage.extra as Record<string, unknown>).storyRecommendationsSource as import('../../types/story-recommendations').StoryRecommendationsSource } : {}),
        ...((assistantMessage.extra as Record<string, unknown> | null)?.storyRecommendationsLead
          ? { storyRecommendationsLead: (assistantMessage.extra as Record<string, unknown>).storyRecommendationsLead as string } : {}),
      },
    });

    assertNotTruncated(generated);
    if (character && !interrupted && (!preparedStory?.directResponse ||
      (assistantMessage.extra as Record<string, unknown> | null)?.stateStatus === 'confirmed')) {
      try {
        if (!preparedStory) {
          await chatService.checkAndExtractMemories(chatId, character.id, userId);
        }
        if (chat.contentSnapshotVersion === 1) {
          await chatService.updateEmotionFromMessage(character.id, userId, chatId, content, userMessageId);
        }
        await chatService.updateEmotionFromMessage(character.id, userId, chatId, fullContent, assistantMessage.id);
      } catch (error) {
        wsLogger.warn('Derived memory update failed after the response was saved', { chatId, error: (error as Error).message });
      }
    }
    if (validationFailed) return { validationError: `STORY_${(diagnostic?.code ?? 'VALIDATION_FAILED').toUpperCase()}` };
  }

  /**
   * Group chat: sequentially generate responses for each responding character
   */
  private async handleGroupChatResponse(
    chatId: string,
    userContent: string,
    userId: string,
    mentionedCharacterIds?: string[],
    tenantId?: string,
    signal?: AbortSignal,
    userMessageId?: number,
    requestId?: string,
    audience?: StoryAudience
  ): Promise<void> {
    if (signal?.aborted) return;
    // Load chat to determine model
    const chat = await chatRepository.findById(chatId);
    if (!chat) {
      // 由 handleUserMessage 的 catch 转成 WS ERROR 消息发给客户端
      throw new NotFoundError('Chat');
    }
    const model = getChatModel(chat) || getDefaultModel() || 'glm-4.5-air';

    // Determine who responded last to feed round-robin
    const recentMessages = await chatService.getMessages(chatId);
    let lastResponderId: string | undefined;
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      if (recentMessages[i].role === 'assistant' && recentMessages[i].characterId) {
        lastResponderId = recentMessages[i].characterId!;
        break;
      }
    }

    const strategy = await groupChatService.getStrategy(chatId);

    // If @mentions are present, override strategy and only respond with mentioned characters
    let respondentIds: string[];
    if (audience) {
      respondentIds = mentionedCharacterIds?.length ? mentionedCharacterIds : audience;
    } else if (mentionedCharacterIds && mentionedCharacterIds.length > 0) {
      respondentIds = mentionedCharacterIds;
    } else {
      respondentIds = await groupChatService.selectRespondents(
        chatId, strategy, lastResponderId
      );
    }

    // Fetch messages once before the loop; append each new reply in-memory
    const sharedHistory = [...recentMessages];
    const toPromptMessage = (m: (typeof recentMessages)[number]): LLMMessage => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      pinned: m.pinned,
      importance: m.importance,
      messageId: m.id,
    });

    for (const charId of respondentIds) {
      if (signal?.aborted) break;
      const character = await resolveStoryCharacter(chat, charId);
      if (!character) {
        wsLogger.warn('Group chat character not found, skipping', { charId });
        continue;
      }
      const chatMessages = sharedHistory.filter(item => chat.contentSnapshotVersion == null ||
        storyKnowledgeVisible(item.extra, charId, audience)).map(toPromptMessage);

      // Build system prompt for this character
      const enhancedPrompt = await chatService.buildEnhancedSystemPrompt({
        character,
        characterId: character.id,
        userId,
        chatId,
        userMessage: userContent,
        messages: chat.worldbookSnapshotVersion != null ? chatMessages : undefined,
        worldbookSnapshotVersion: chat.worldbookSnapshotVersion,
        contentSnapshotVersion: chat.contentSnapshotVersion,
        isolateKnowledge: chat.contentSnapshotVersion === 1,
        storyAudience: audience,
        personaId: chat.personaId || undefined,
        identitySnapshot: chat.identitySnapshot,
      });

      const storyTurn = await prepareStoryTurn(chat, userContent, undefined, db, { characterId: charId, audience });

      // Use the in-memory message array (no re-fetch)
      const systemPrompt = enhancedPrompt.systemPrompt + (storyTurn ? `\n\n${storyTurn.prompt}` : '');
      const depthBudget = Math.max(enhancedPrompt.reservedTokens ?? 0, estimateContextMessages(enhancedPrompt.atDepthEntries));
      let contextResult = contextManager.buildContext(systemPrompt, chatMessages, model, depthBudget);
      if (chat.contentSnapshotVersion === 1 && contextResult.truncated) {
        contextResult = addStorySummaries(systemPrompt, chatMessages, model, depthBudget, contextResult,
          await getStorySummaries(chatId, userId, chat.tenantId, character.id, db, audience));
      }
      // Inject depth entries for this character
      contextResult.messages = contextManager.injectAtDepth(contextResult.messages, enhancedPrompt.atDepthEntries);
      assertContextBudget(estimateContextMessages(contextResult.messages) + 2, getModelMeta(model));

      // Stream LLM response with character identification
      const tempMessageId = nanoid();
      if (signal?.aborted) break;

      const estimatedPromptTokens =
        contextResult.totalTokens + estimateInjectedTokens(enhancedPrompt.atDepthEntries);

      let generated: StreamedLlmResult;
      // 群聊每个发言角色是一次独立生成，各自预扣、各自结算
      let hold: CreditHold | null = null;
      const progress = newStreamProgress();
      try {
        hold = await reserveForGeneration({
          tenantId,
          chatId,
          estimatedPromptTokens,
          requestedMaxTokens: Math.min(getModelMeta(model).maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS),
          metadata: { transport: 'websocket', model, characterId: character.id, group: true },
        });
        generated = await this.streamLlmResponse(
          chatId, tempMessageId, contextResult.messages, character.id, character.name, model, signal,
          { maxTokens: hold?.maxOutputTokens ?? getModelMeta(model).maxOutputTokens, progress }
        );
      } catch (error) {
        await closeFailedGeneration(hold, progress, estimatedPromptTokens, chatId);
        throw error;
      }
      let fullContent = generated.content;

      // 群聊每个发言角色是一次独立的 LLM 调用，各自按「输入 + 输出」计量。
      // 在空内容判断之前计：被中断的请求，provider 也已经为输入收了费。
      await meterLlmTokens(
        tenantId,
        {
          providerUsage: generated.usage,
          estimatedPromptTokens,
          outputText: fullContent,
        },
        { transport: 'websocket', chatId, model, characterId: character.id }
      );

      // 结算在保存之后（流水要记 messageId）；空内容 / 保存失败时 finally 仍会结算（不带 messageId）
      let savedMessage: Awaited<ReturnType<typeof messageRepository.create>>;
      let savedMessageId: number | null = null;
      const interrupted = Boolean(signal?.aborted || generated.outputTruncated || generated.streamIncomplete);
      try {
        // Don't save empty message if aborted before any content was generated
        if (!fullContent) { assertNotTruncated(generated); break; }

        // Apply regex_scripts post-processing on AI output (skip markdownOnly — those run client-side)
        const scripts = getRegexScripts(character.cardData as Record<string, unknown>);
        fullContent = applyRegexScripts(fullContent, scripts, RegexPlacement.AI_OUTPUT, false);

        // Save message with characterId
        const activeTurn = this.activeGenerations.get(chatId);
        if (!interrupted && activeTurn) activeTurn.commitStarted = true;
        savedMessage = storyTurn && userMessageId && requestId
          ? await commitStoryTurn(storyTurn, userMessageId, createHash('sha256').update(`${requestId}:${charId}`).digest('hex'), fullContent, interrupted, db, charId)
          : chat.contentSnapshotVersion == null && !interrupted
          ? await saveLegacyAssistantMessage({ chatId, role: 'assistant', content: fullContent, characterId: character.id }, requestId)
          : await messageRepository.create({
          chatId,
          role: 'assistant',
          content: fullContent,
          characterId: character.id,
          ...(interrupted ? { extra: { stateStatus: 'interrupted' } } : {}),
        });
        savedMessageId = savedMessage.id;
      } finally {
        await settleGeneration(hold, {
          providerUsage: generated.usage,
          estimatedPromptTokens,
          outputText: generated.content,
          chatId,
          messageId: savedMessageId,
        });
      }

      // 群聊每个发言角色各算一条消息：一轮群聊的真实成本就是 N 次生成，
      // 按轮计费会让 team 计划的大群聊几乎免费。
      await meterUsage(tenantId, 'messages', 1, {
        transport: 'websocket',
        chatId,
        role: 'assistant',
        characterId: character.id,
      });

      // Append to in-memory array so next character sees this reply
      sharedHistory.push(savedMessage);

      // Increment growth for this character
      if (!interrupted) characterGrowthRepository.getOrCreate(character.id, userId)
        .then((growth) => characterGrowthRepository.incrementMessages(growth.id))
        .catch((err) => wsLogger.warn('Failed to increment group message growth', { error: err }));

      // Increment unread count (same as single-character path)
      await db.update(chats)
        .set({ unreadCount: sql`${chats.unreadCount} + 1` })
        .where(eq(chats.id, chatId));

      websocketService.broadcastToChat(chatId, {
        type: WSMessageType.ASSISTANT_MESSAGE_DONE,
        timestamp: new Date().toISOString(),
        data: {
          chatId,
          messageId: savedMessage.id.toString(),
          requestId: this.activeGenerations.get(chatId)?.requestId,
          characterId: character.id,
          characterName: character.name,
          variablesChanged: chat.contentSnapshotVersion == null && !interrupted && applyLegacyVariables(fullContent, {}).changed,
          stateStatus: (savedMessage.extra as { stateStatus?: 'confirmed' | 'interrupted' | 'proposed' } | null)?.stateStatus,
          ...storyAudienceExtra(audience),
        },
      });

      assertNotTruncated(generated);
      // Emotion update + memory extraction (same as single-character path)
      if (!interrupted) {
        try {
          await chatService.updateEmotionFromMessage(
            character.id, userId, chatId, userContent, savedMessage.id
          );
          await chatService.updateEmotionFromMessage(
            character.id, userId, chatId, fullContent, savedMessage.id
          );
          if (!storyTurn) {
            await chatService.checkAndExtractMemories(chatId, character.id, userId);
          }
        } catch (error) {
          wsLogger.warn('Derived group memory update failed after the response was saved', { chatId, characterId: character.id, error: (error as Error).message });
        }
      }
      const activeTurn = this.activeGenerations.get(chatId);
      if (activeTurn) {
        activeTurn.commitStarted = false;
        if (activeTurn.stopAfterCommit && charId !== respondentIds.at(-1)) activeTurn.controller.abort();
      }
    }
  }

  /**
   * Shared helper: call LLM and stream chunks to the chat room.
   * Returns the full accumulated content.
   */
  private async streamLlmResponse(
    chatId: string,
    messageId: string,
    llmMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    characterId?: string,
    characterName?: string,
    model?: string,
    signal?: AbortSignal,
    options?: {
      /** 本轮已解析的输出上限，与上下文预留和点数预扣保持一致 */
      maxTokens?: number;
      limits?: ModelMeta;
      templatePrompt?: string;
      /** 实时进度，调用方在失败/中断时据此结算或释放预扣 */
      progress?: StreamProgress;
      storyIntent?: boolean;
      interpretation?: { input: string; actionIds: string[]; direct?: boolean };
    }
  ): Promise<StreamedLlmResult> {
    signal?.throwIfAborted();
    const selectedModel = model || getDefaultModel() || 'glm-4.5-air';
    const meta = resolveGenerationParameters(options?.limits ?? getModelMeta(selectedModel), options?.maxTokens);
    const maxTokens = meta.maxOutputTokens;
    assertContextBudget(options?.templatePrompt === undefined ? estimateContextMessages(llmMessages) + 2
      : estimateContextTokens(options.templatePrompt), meta, 'payload', maxTokens);
    const streamState: StreamProgress = options?.progress ?? newStreamProgress();
    streamState.modelRequestedAt = performance.now();
    const response = await llmService.streamChatCompletion({
      messages: llmMessages,
      model: selectedModel,
      temperature: meta.defaultTemperature,
      n: 1,
      stream: true,
      presence_penalty: 0,
      frequency_penalty: 0,
      max_tokens: maxTokens,
    }, signal, { chatId, limits: meta, templatePrompt: options?.templatePrompt });

    // progress 同时承载累积内容与 usage（用对象，避免闭包内赋值被 TS 控制流收窄成 null）
    streamState.started = true;
    let chunkIndex = 0;
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    let displayed = '';
    let controlStartedAt: number | undefined;
    let finishedAt: number | undefined;
    const sendPhase = (phase: 'control' | 'validating'): void => {
      if (!options?.interpretation?.direct) return;
      websocketService.broadcastToChat(chatId, {
        type: WSMessageType.ASSISTANT_MESSAGE_CHUNK, timestamp: new Date().toISOString(),
        data: { chatId, messageId, requestId: this.activeGenerations.get(chatId)?.requestId,
          chunk: '', index: chunkIndex++, provisional: true, phase,
          ...(characterId && { characterId }), ...(characterName && { characterName }),
        },
      });
    };
    const sendVisible = (content: string): void => {
      if (!content) return;
      streamState.firstVisibleAt ??= performance.now();
      websocketService.broadcastToChat(chatId, {
        type: WSMessageType.ASSISTANT_MESSAGE_CHUNK,
        timestamp: new Date().toISOString(),
        data: {
          chatId,
          messageId,
          requestId: this.activeGenerations.get(chatId)?.requestId,
          chunk: content,
          index: chunkIndex++,
          ...(options?.interpretation?.direct ? { provisional: true } : {}),
          ...(characterId && { characterId }),
          ...(characterName && { characterName }),
        },
      });
    };
    const emitChunk = (content: string): void => {
      streamState.firstChunkAt ??= performance.now();
      streamState.content += content;
      // Legacy action review still waits for interpretation. Direct replies can
      // show narrative immediately, without publishing protocol or committing state.
      if (options?.interpretation && !options.interpretation.direct) return;
      const visible = options?.storyIntent || options?.interpretation?.direct
        ? storyIntentVisiblePrefix(streamState.content) : streamState.content;
      sendVisible(visible.slice(displayed.length));
      displayed = visible;
      if (controlStartedAt === undefined && (options?.storyIntent || options?.interpretation?.direct)
        && streamState.content.includes('<story-intent>')) {
        controlStartedAt = performance.now();
        sendPhase('control');
      }
    };

    let protocolError = false, transportError = false, terminal = false;
    let eventData: string[] = [];
    let eventSize = 0;
    const consumeFrame = (data: string, native: boolean): void => {
      if (!native && data.trim() === '[DONE]') { terminal = true; return; }
      try {
        const parsed = JSON.parse(data);
        if (!parsed || typeof parsed !== 'object' || parsed.error) { protocolError = true; return; }
        const choice = parsed.choices?.[0];
        const content = native ? (parsed.message?.content ?? parsed.response) : (choice?.delta?.content ?? (options?.templatePrompt !== undefined ? choice?.text : undefined));
        if (content != null && typeof content !== 'string') { protocolError = true; return; }
        if (content) {
          // A terminal/finish frame may be followed by usage, never new text.
          if (terminal || streamState.finishReason) { protocolError = true; return; }
          emitChunk(content);
        }
        if (native && parsed.done === true) {
          streamState.finishReason = normalizeFinishReason(parsed.done_reason ?? 'stop');
          terminal = true;
        } else if (!native && choice?.finish_reason != null) {
          const reason = normalizeFinishReason(choice.finish_reason);
          if (typeof choice.finish_reason !== 'string' || !choice.finish_reason ||
            (streamState.finishReason && streamState.finishReason !== reason)) protocolError = true;
          else streamState.finishReason = reason;
        }
        if (streamState.finishReason === 'length') streamState.outputTruncated = true;
        if (streamState.finishReason && finishedAt === undefined) {
          finishedAt = performance.now();
          sendPhase('validating');
        }
        streamState.usage = (native ? readOllamaUsage(parsed) : readOpenAiUsage(parsed.usage)) ?? streamState.usage;
      } catch {
        // JSON errors can quote private text. Store a fixed failure category only.
        protocolError = true;
      }
    };
    const flushEvent = (): void => {
      if (eventData.length) consumeFrame(eventData.join('\n'), false);
      eventData = []; eventSize = 0;
    };
    const handleLine = (raw: string): void => {
      const line = raw.replace(/\r$/, '');
      if (!line) { flushEvent(); return; }
      if (line.startsWith('data:')) {
        const data = line.slice(5).replace(/^ /, '');
        eventSize += data.length;
        if (eventSize > 1024 * 1024) { protocolError = true; eventData = []; return; }
        eventData.push(data);
      } else if (line.startsWith('{')) {
        flushEvent(); consumeFrame(line, true);
      }
      // SSE comments/event/id/retry fields are metadata, not JSON payloads.
    };

    if (reader) {
      let pending = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || signal?.aborted) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          for (const line of lines) handleLine(line);
          // [DONE] (or native done:true) ends this response. Do not wait for
          // a gateway to close its HTTP connection after the terminal event.
          // Consume the whole received chunk first so extra text is rejected.
          if (terminal) break;
          if (pending.length > 1024 * 1024) { protocolError = true; break; }
        }
        if (!signal?.aborted) {
          pending += decoder.decode();
          if (pending) handleLine(pending);
          flushEvent();
        }
      } catch {
        // Keep partial text for display/settlement but never confirm it. An
        // upstream read failure is not a user cancellation unless our signal is set.
        if (!signal?.aborted) transportError = true;
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    // EOF and [DONE] alone do not prove the model finished its text. OpenAI
    // finish_reason is required; native Ollama's done:true is its equivalent.
    // A finish frame without [DONE] is accepted for compatible gateways.
    if (!signal?.aborted && (protocolError || transportError || !streamState.finishReason)) {
      streamState.streamIncomplete = true;
      wsLogger.warn('LLM stream incomplete', { chatId, model: selectedModel,
        reason: protocolError ? 'protocol' : transportError ? 'transport' : 'missing_finish_reason',
        contentCharacters: streamState.content.length, finishReason: streamState.finishReason });
    }
    const interrupted = Boolean(signal?.aborted || streamState.outputTruncated || streamState.streamIncomplete);
    wsLogger.info('LLM stream completion', {
      chatId, model: selectedModel, maxOutputTokens: maxTokens,
      finishReason: streamState.finishReason,
      outputTruncated: streamState.outputTruncated === true,
      streamIncomplete: streamState.streamIncomplete === true,
      contentCharacters: streamState.content.length,
      providerOutputTokens: streamState.usage?.completionTokens ?? null,
      controlTailMs: controlStartedAt === undefined ? null : Math.round((finishedAt ?? performance.now()) - controlStartedAt),
      finishToReleaseMs: finishedAt === undefined ? null : Math.round(performance.now() - finishedAt),
    });

    const finalVisible = options?.interpretation
      ? storyIntentPresentation(streamState.content, options.interpretation.input, options.interpretation.actionIds, interrupted, options.interpretation.direct)
      : options?.storyIntent ? storyIntentVisiblePrefix(streamState.content, !interrupted) : streamState.content;
    if (!options?.interpretation?.direct) sendVisible(finalVisible.slice(displayed.length));
    else sendVisible(storyIntentVisiblePrefix(streamState.content, !interrupted).slice(displayed.length));
    return { content: streamState.content, usage: streamState.usage, finishReason: streamState.finishReason,
      ...(streamState.outputTruncated ? { outputTruncated: true } : {}),
      ...(streamState.streamIncomplete ? { streamIncomplete: true } : {}) };
  }

  /**
   * Stream text completion (for prompt templates)
   */
  private async streamTextCompletion(
    chatId: string,
    messageId: string,
    prompt: string,
    model?: string,
    signal?: AbortSignal,
    storyIntent?: boolean,
    interpretation?: { input: string; actionIds: string[]; direct?: boolean },
    options?: { limits?: ModelMeta; progress?: StreamProgress }
  ): Promise<StreamedLlmResult> {
    return this.streamLlmResponse(chatId, messageId, [{ role: 'user', content: prompt }],
      undefined, undefined, model, signal, { ...options, templatePrompt: prompt, storyIntent, interpretation });
  }

  /**
   * 处理中止生成
   */
  private async handleAbortGeneration(clientId: string, message: WSAbortGenerationMessage): Promise<void> {
    const { chatId, requestId } = message.data;
    const client = websocketService.getClientInfo(clientId);
    const turn = this.activeGenerations.get(chatId);
    if (client && turn && turn.userId === client.userId && turn.tenantId === client.tenantId
      && (!requestId || requestId === turn.requestId)) {
      if (turn.commitStarted) {
        turn.stopAfterCommit = true;
        return;
      }
      wsLogger.info('Aborting generation', { chatId });
      turn.controller.abort();
    }
  }

  /**
   * 处理加入聊天
   */
  private async handleJoinChat(
    clientId: string,
    message: WSChatControlMessage
  ): Promise<void> {
    const { chatId } = message.data;

    // Verify the client owns this chat before allowing them to join
    const clientInfo = websocketService.getClientInfo(clientId);
    if (!clientInfo) {
      return;
    }

    const chat = await chatRepository.findById(chatId);
    if (!chat || chat.userId !== clientInfo.userId || chat.tenantId !== clientInfo.tenantId) {
      websocketService.sendToClient(clientId, {
        type: WSMessageType.ERROR,
        timestamp: new Date().toISOString(),
        data: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this chat',
        },
      });
      return;
    }

    websocketService.joinChat(clientId, chatId);

    const turn = this.activeGenerations.get(chatId);
    websocketService.sendToClient(clientId, {
      type: WSMessageType.GENERATION_STATE,
      timestamp: new Date().toISOString(),
      data: {
        chatId,
        status: turn ? 'running' : 'idle',
        ...(turn ? { requestId: turn.requestId } : {}),
      },
    });
  }

  /**
   * 处理离开聊天
   */
  private async handleLeaveChat(
    clientId: string,
    _message: WSChatControlMessage
  ): Promise<void> {
    websocketService.leaveChat(clientId);
  }

  /**
   * 处理打字状态
   */
  private async handleTyping(clientId: string, parsed: WSTypingMessage): Promise<void> {
    const clientInfo = websocketService.getClientInfo(clientId);
    if (!clientInfo || !clientInfo.chatId) return;

    // 广播打字状态到聊天室（排除自己）
    websocketService.broadcastToChat(
      clientInfo.chatId,
      {
        type: WSMessageType.USER_TYPING,
        timestamp: new Date().toISOString(),
        data: {
          chatId: clientInfo.chatId,
          userId: clientInfo.userId,
          userName: clientInfo.displayName || 'User',
          isTyping: parsed.type === WSMessageType.TYPING_START,
        },
      },
      clientId
    );
  }

  /**
   * 处理已读回执
   */
  private async handleChatRead(clientId: string, message: WSChatReadMessage): Promise<void> {
    const { chatId, lastReadMessageId } = message.data;
    const clientInfo = websocketService.getClientInfo(clientId);
    if (!clientInfo) return;

    // Update read state in DB
    await db.update(chats)
      .set({
        lastReadMessageId: Number(lastReadMessageId),
        unreadCount: 0,
      })
      .where(and(eq(chats.id, chatId), eq(chats.userId, clientInfo.userId)));

    // Broadcast to user's other devices
    websocketService.sendToUser(clientInfo.userId, {
      type: WSMessageType.CHAT_READ,
      timestamp: new Date().toISOString(),
      data: { chatId, lastReadMessageId },
    });
  }

  /**
   * 处理心跳
   */
  private async handlePing(clientId: string, _message: WSPingMessage): Promise<void> {
    websocketService.updateHeartbeat(clientId);
    websocketService.sendToClient(clientId, {
      type: WSMessageType.PONG,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送消息
   */
  private sendMessage(ws: WebSocket, message: WSMessageUnion): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    this.sendMessage(ws, {
      type: WSMessageType.ERROR,
      timestamp: new Date().toISOString(),
      data: { code, message },
    });
  }

  /**
   * 启动心跳检查
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const cleaned = websocketService.cleanupStaleConnections(60000);
      if (cleaned > 0) {
        wsLogger.info('Cleaned up stale connections', { count: cleaned });
      }
    }, 30000); // 每 30 秒检查一次
  }

  /**
   * 发送情感变化事件
   */
  emitEmotionChange(
    ws: WebSocket,
    data: WSEmotionChangeEvent['data']
  ): void {
    this.sendMessage(ws, {
      type: WSMessageType.INTELLIGENCE_EMOTION_CHANGE,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  /**
   * 发送记忆检索事件
   */
  emitMemoryRetrieval(
    ws: WebSocket,
    data: WSMemoryRetrievalEvent['data']
  ): void {
    this.sendMessage(ws, {
      type: WSMessageType.INTELLIGENCE_MEMORY_RETRIEVAL,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  /**
   * 发送记忆提取事件
   */
  emitMemoryExtraction(
    ws: WebSocket,
    data: WSMemoryExtractionEvent['data']
  ): void {
    this.sendMessage(ws, {
      type: WSMessageType.INTELLIGENCE_MEMORY_EXTRACTION,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  /**
   * 发送提示词构建事件
   */
  emitPromptBuild(
    ws: WebSocket,
    data: WSPromptBuildEvent['data']
  ): void {
    this.sendMessage(ws, {
      type: WSMessageType.INTELLIGENCE_PROMPT_BUILD,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  /**
   * 广播情感变化事件到聊天室
   */
  broadcastEmotionChange(
    chatId: string,
    data: Omit<WSEmotionChangeEvent['data'], 'chatId'>
  ): void {
    websocketService.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_EMOTION_CHANGE,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        chatId,
      },
    });
  }

  /**
   * 广播记忆检索事件到聊天室
   */
  broadcastMemoryRetrieval(
    chatId: string,
    data: Omit<WSMemoryRetrievalEvent['data'], 'chatId'>
  ): void {
    websocketService.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_MEMORY_RETRIEVAL,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        chatId,
      },
    });
  }

  /**
   * 广播记忆提取事件到聊天室
   */
  broadcastMemoryExtraction(
    chatId: string,
    data: Omit<WSMemoryExtractionEvent['data'], 'chatId'>
  ): void {
    websocketService.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_MEMORY_EXTRACTION,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        chatId,
      },
    });
  }

  /**
   * 广播提示词构建事件到聊天室
   */
  broadcastPromptBuild(
    chatId: string,
    data: Omit<WSPromptBuildEvent['data'], 'chatId'>
  ): void {
    websocketService.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_PROMPT_BUILD,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        chatId,
      },
    });
  }

  /**
   * 关闭 WebSocket 服务器
   */
  close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    websocketService.close();
  }
}

export const websocketHandler = new WebSocketHandler();
