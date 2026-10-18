/**
 * WebSocket Route
 *
 * 处理 WebSocket 连接和消息路由
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAccessToken } from '../../core/jwt';
import { logger } from '../services/logger.service';
import { db } from '../../db';
import { chats } from '../../db/schema/chats';

const wsLogger = logger.child({ module: 'websocket' });
import { websocketService } from '../services/websocket.service';
import { llmService } from '../services/llm.service';
import { getDefaultModel, getModelMeta } from '../config/llm.config';
import { chatService, getChatModel } from '../services/chat.service';
import { contextManager, type LLMMessage } from '../services/context-manager.service';
import { AppError, NotFoundError } from '../../core/errors';
import { chatRepository } from '../../db/repositories/chat.repository';
import { characterRepository } from '../../db/repositories/character.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';
import { groupChatService } from '../services/group-chat.service';
import { applyRegexScripts, getRegexScripts, RegexPlacement } from '../services/regex-scripts.service';
import { formatMessagesWithTemplate } from '../config/prompt-templates';
import { extractVariableInserts, extractVariableEdits, extractVariableDeletes } from '../utils/variable-insert';
import { chatVariableStore } from '../services/chat-variable.service';
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
import type { CreditHold } from '../services/credit-billing.service';
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
import { nanoid } from 'nanoid';

/** 提示词模板路径（text completion）的固定输出上限；点数预扣按同一个数算 */
const TEMPLATE_COMPLETION_MAX_TOKENS = 2048;

/** 一次流式生成的结果：完整文本 + provider 在流末尾返回的真实 usage（拿不到为 null） */
interface StreamedLlmResult {
  content: string;
  usage: ProviderUsage | null;
}

/**
 * 流式生成的实时进度。流中途抛错或被中断时，调用方靠它知道「provider 已经连上了吗、
 * 已经产生了多少内容」，从而决定结算已产生的部分（started）还是直接释放预扣（未连上）。
 */
interface StreamProgress extends StreamedLlmResult {
  started: boolean;
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
  private activeGenerations = new Map<string, AbortController>();

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
      this.sendError(ws, 'UNAUTHORIZED', 'Authentication token required');
      ws.close();
      return;
    }

    try {
      const payload = await verifyAccessToken(token);
      const clientId = websocketService.registerClient(ws, payload.userId, payload.tenantId);

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
          await this.handleAbortGeneration(message as WSAbortGenerationMessage);
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
    wsLogger.debug('Processing message', { chatId, contentPreview: content.substring(0, 50) });

    try {
      // 配额检查必须在这里做一次：WebSocket 不经过 Hono 中间件链，
      // HTTP 那边的 requireQuota('messages') 对这条链路完全无效，
      // 而客户端只要连上 WebSocket 就默认走这里。
      const quota = await featureService.checkQuota(clientInfo.tenantId, 'messages');
      if (!quota.allowed) {
        websocketService.sendToClient(clientId, {
          type: WSMessageType.ERROR,
          timestamp: new Date().toISOString(),
          data: {
            code: 'QUOTA_EXCEEDED',
            message: `Message quota exceeded (${quota.currentUsage}/${quota.limit})`,
          },
        });
        return;
      }

      // 预付点数模式：余额为 0 时在保存用户消息之前就拒绝（订阅模式为空操作）。
      // 真正的并发安全由每次生成前的 reserve 保证，这里只是避免明显的「消息已落库、生成被拒」
      await assertCreditsAvailable(clientInfo.tenantId);

      // 保存用户消息到数据库
      const userMessage = await chatService.addMessage(chatId, {
        role: 'user',
        content,
      });

      // 先落库再记账：反过来的话写库失败会留下幻影用量。
      // 不 throw——消息已经存下来了，这里失败只该进日志。
      await meterUsage(clientInfo.tenantId, 'messages', 1, {
        transport: 'websocket',
        chatId,
        role: 'user',
      });

      // 广播用户消息到聊天室
      websocketService.broadcastToChat(chatId, {
        type: WSMessageType.USER_MESSAGE,
        timestamp: new Date().toISOString(),
        data: {
          chatId,
          content,
          messageId: userMessage.id.toString(),
        },
      });

      // Check if this is a group chat (multiple characters)
      const isGroup = await groupChatService.isGroupChat(chatId);

      if (isGroup) {
        // --- Group chat: multi-character response loop ---
        await this.handleGroupChatResponse(
          chatId,
          content,
          clientInfo.userId,
          mentionedCharacterIds,
          clientInfo.tenantId
        );
      } else {
        // --- Single-character path (unchanged) ---
        await this.handleSingleCharacterResponse(
          chatId,
          content,
          clientInfo.userId,
          userMessage.id,
          clientInfo.tenantId
        );
      }
    } catch (error) {
      wsLogger.error('Error handling user message', { error: (error as Error).message, stack: (error as Error).stack });
      websocketService.sendToClient(clientId, {
        type: WSMessageType.ERROR,
        timestamp: new Date().toISOString(),
        data: {
          // AppError（例如 P0-7 的 PLATFORM_SPEND_LIMIT）带着面向用户的可读信息和稳定错误码，
          // 原样透传，客户端才能区分「平台限流」和普通失败
          code: error instanceof AppError ? error.code : 'MESSAGE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to process message',
        },
      });
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
    tenantId?: string
  ): Promise<void> {
    const chat = await chatRepository.findById(chatId);
    if (!chat) throw new Error('Chat not found');

    const character = chat.characterId
      ? await characterRepository.findById(chat.characterId)
      : null;

    const chatMetadata = (chat.metadata as Record<string, unknown>) || {};
    const activeBranchLeaf = chatMetadata.activeBranchLeafId as number | undefined;

    let chatMessages: LLMMessage[];
    if (activeBranchLeaf) {
      chatMessages = (await messageRepository.findBranch(chatId, activeBranchLeaf)).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        pinned: m.pinned,
        importance: m.importance,
        messageId: m.id,
      }));
    } else {
      const messages = await chatService.getMessages(chatId);
      chatMessages = messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        pinned: m.pinned,
        importance: m.importance,
        messageId: m.id,
      }));
    }

    // Determine model from chat metadata or default
    const model = getChatModel(chat) || getDefaultModel() || 'glm-4.5-air';

    let systemPrompt = '';
    let atDepthEntries: Array<{ depth: number; content: string; role: 'system' | 'user' | 'assistant' }> = [];
    // cache_friendly 布局下变动块在截断之后才注入，预算要预先扣掉它（P3-3）
    let reservedTokens = 0;
    if (character) {
      const enhancedPrompt = await chatService.buildEnhancedSystemPrompt({
        character,
        characterId: character.id,
        userId,
        chatId,
        userMessage: content,
        personaId: chat.personaId || undefined,
      });
      systemPrompt = enhancedPrompt.systemPrompt;
      atDepthEntries = enhancedPrompt.atDepthEntries;
      reservedTokens = enhancedPrompt.reservedTokens ?? 0;

      await chatService.updateEmotionFromMessage(
        character.id, userId, chatId, content, userMessageId
      );
    }

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
    const contextResult = contextManager.buildContext(systemPrompt, chatMessages, model, reservedTokens);

    // Debug: Log what's actually being sent to LLM
    if (chatMessages.length <= 3) {
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

    // Check if character uses a custom prompt template
    const promptTemplate = character
      ? ((character.cardData as any)?.extensions?.promptTemplate || 'default')
      : 'default';

    const assistantMessageId = nanoid();
    const abortController = new AbortController();
    this.activeGenerations.set(chatId, abortController);

    let generated: StreamedLlmResult;
    // 输入 token 估算：context-manager 的 totalTokens 不含之后注入的 atDepth 条目，这里补上
    let estimatedPromptTokens =
      contextResult.totalTokens + estimateInjectedTokens(atDepthEntries);
    // 模板路径走 llmService.completion，平台花费已在 llm.service 里记过
    let platformSpendRecorded = false;
    // 预付点数模式下的预扣；订阅模式恒为 null
    let hold: CreditHold | null = null;
    const progress = newStreamProgress();
    try {
      if (promptTemplate !== 'default') {
        // Use text completion with formatted prompt for non-default templates
        wsLogger.info('Using prompt template', { chatId, template: promptTemplate });

        // Build full message array with system prompt
        const allMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...contextResult.messages
        ];

        // Format messages using the template
        const formattedPrompt = formatMessagesWithTemplate(allMessages, promptTemplate);

        // 模板路径实际发给 provider 的是格式化后的整段 prompt，按它估算输入
        estimatedPromptTokens = countTokens(formattedPrompt);
        platformSpendRecorded = true;

        // 模板路径的输出上限是固定的 2048，预扣按同一个数算
        hold = await reserveForGeneration({
          tenantId,
          chatId,
          estimatedPromptTokens,
          requestedMaxTokens: TEMPLATE_COMPLETION_MAX_TOKENS,
          metadata: { transport: 'websocket', model, template: promptTemplate },
        });

        // Use text completion API
        generated = await this.streamTextCompletion(
          chatId,
          assistantMessageId,
          formattedPrompt,
          model,
          abortController.signal
        );
      } else {
        hold = await reserveForGeneration({
          tenantId,
          chatId,
          estimatedPromptTokens,
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
          abortController.signal,
          { maxTokens: hold?.maxOutputTokens, progress }
        );
      }
    } catch (error) {
      // 连接前失败 -> 释放；流中途失败 -> 结算已产生的部分。不留悬空预扣
      await closeFailedGeneration(hold, progress, estimatedPromptTokens, chatId);
      throw error;
    } finally {
      this.activeGenerations.delete(chatId);
    }
    let fullContent = generated.content;

    // llm_tokens 计「输入 + 输出」（P0-1）：provider 的真实 usage 优先，拿不到才估算。
    // 放在空内容判断之前：被中断的请求，provider 也已经为输入收了费。
    // 历史上这里只算输出，长上下文的真实成本几乎没被计到。
    await meterLlmTokens(
      tenantId,
      { providerUsage: generated.usage, estimatedPromptTokens, outputText: fullContent },
      { transport: 'websocket', chatId, model },
      { recordPlatformSpend: !platformSpendRecorded }
    );

    // 结算在保存助手消息之后做，这样流水能记下 messageId；
    // 空内容（中断）/ 保存失败 / 后处理抛错时 finally 仍会结算（不带 messageId），不会留悬空预扣
    let assistantMessage: Awaited<ReturnType<typeof chatService.addMessage>>;
    let savedMessageId: number | null = null;
    try {
      // Don't save empty message if aborted before any content was generated
      if (!fullContent) return;

      // Apply regex_scripts post-processing on AI output (skip markdownOnly scripts — those run client-side)
      if (character) {
        const scripts = getRegexScripts(character.cardData as Record<string, unknown>);
        fullContent = applyRegexScripts(fullContent, scripts, RegexPlacement.AI_OUTPUT, false);
      }

      assistantMessage = await chatService.addMessage(chatId, {
        role: 'assistant',
        content: fullContent,
      });
      savedMessageId = assistantMessage.id;
    } finally {
      await settleGeneration(hold, {
        providerUsage: generated.usage,
        estimatedPromptTokens,
        outputText: generated.content,
        chatId,
        messageId: savedMessageId,
      });
    }

    // 助手消息同样计入 messages：HTTP 回退路径下用户消息和助手消息
    // 是两次独立请求、各记一条，这里少记的话同样的对话在两条通道上
    // 会得出不同的用量。
    await meterUsage(tenantId, 'messages', 1, {
      transport: 'websocket',
      chatId,
      role: 'assistant',
    });

    // Extract ERA VariableInsert blocks and persist to chat variables
    const extractedVars = extractVariableInserts(fullContent);
    for (const v of extractedVars) {
      await chatVariableStore.setChatVar(chatId, v.key, v.value);
    }
    // Process VariableEdit (update existing variables)
    const editedVars = extractVariableEdits(fullContent);
    for (const v of editedVars) {
      await chatVariableStore.setChatVar(chatId, v.key, v.value);
    }
    // Process VariableDelete (remove variables)
    const deletedKeys = extractVariableDeletes(fullContent);
    for (const key of deletedKeys) {
      await chatVariableStore.deleteChatVar(chatId, key);
    }

    // Load updated variables for ERA bridge notification
    const hasVarChanges = extractedVars.length > 0 || editedVars.length > 0 || deletedKeys.length > 0;

    // After saving assistant message, increment character growth
    if (character) {
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
        variablesChanged: hasVarChanges,
      },
    });

    if (character) {
      const allMessages = await chatService.getMessages(chatId);
      await chatService.checkAndExtractMemories(chatId, character.id, userId, allMessages);
      await chatService.updateEmotionFromMessage(
        character.id, userId, chatId, fullContent, assistantMessage.id
      );
    }
  }

  /**
   * Group chat: sequentially generate responses for each responding character
   */
  private async handleGroupChatResponse(
    chatId: string,
    userContent: string,
    userId: string,
    mentionedCharacterIds?: string[],
    tenantId?: string
  ): Promise<void> {
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
    if (mentionedCharacterIds && mentionedCharacterIds.length > 0) {
      respondentIds = mentionedCharacterIds;
    } else {
      respondentIds = await groupChatService.selectRespondents(
        chatId, strategy, lastResponderId
      );
    }

    // Fetch messages once before the loop; append each new reply in-memory
    let chatMessages: LLMMessage[] = recentMessages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      pinned: m.pinned,
      importance: m.importance,
      messageId: m.id,
    }));

    for (const charId of respondentIds) {
      const character = await characterRepository.findById(charId);
      if (!character) {
        wsLogger.warn('Group chat character not found, skipping', { charId });
        continue;
      }

      // Build system prompt for this character
      const enhancedPrompt = await chatService.buildEnhancedSystemPrompt({
        character,
        characterId: character.id,
        userId,
        chatId,
        userMessage: userContent,
        personaId: chat.personaId || undefined,
      });

      // Use the in-memory message array (no re-fetch)
      const contextResult = contextManager.buildContext(
        enhancedPrompt.systemPrompt, chatMessages, model, enhancedPrompt.reservedTokens ?? 0
      );
      // Inject depth entries for this character
      contextResult.messages = contextManager.injectAtDepth(contextResult.messages, enhancedPrompt.atDepthEntries);

      // Stream LLM response with character identification
      const tempMessageId = nanoid();
      const abortController = new AbortController();
      this.activeGenerations.set(chatId, abortController);

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
          metadata: { transport: 'websocket', model, characterId: character.id, group: true },
        });
        generated = await this.streamLlmResponse(
          chatId, tempMessageId, contextResult.messages, character.id, character.name, model, abortController.signal,
          { maxTokens: hold?.maxOutputTokens, progress }
        );
      } catch (error) {
        await closeFailedGeneration(hold, progress, estimatedPromptTokens, chatId);
        throw error;
      } finally {
        this.activeGenerations.delete(chatId);
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
      try {
        // Don't save empty message if aborted before any content was generated
        if (!fullContent) break;

        // Apply regex_scripts post-processing on AI output (skip markdownOnly — those run client-side)
        const scripts = getRegexScripts(character.cardData as Record<string, unknown>);
        fullContent = applyRegexScripts(fullContent, scripts, RegexPlacement.AI_OUTPUT, false);

        // Save message with characterId
        savedMessage = await messageRepository.create({
          chatId,
          role: 'assistant',
          content: fullContent,
          characterId: character.id,
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

      // Extract ERA VariableInsert blocks and persist to chat variables
      const groupExtractedVars = extractVariableInserts(fullContent);
      for (const v of groupExtractedVars) {
        await chatVariableStore.setChatVar(chatId, v.key, v.value);
      }
      const groupEditedVars = extractVariableEdits(fullContent);
      for (const v of groupEditedVars) {
        await chatVariableStore.setChatVar(chatId, v.key, v.value);
      }
      const groupDeletedKeys = extractVariableDeletes(fullContent);
      for (const key of groupDeletedKeys) {
        await chatVariableStore.deleteChatVar(chatId, key);
      }

      // Append to in-memory array so next character sees this reply
      chatMessages = [...chatMessages, { role: 'assistant' as const, content: fullContent }];

      // Increment growth for this character
      characterGrowthRepository.getOrCreate(character.id, userId)
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
          characterId: character.id,
          characterName: character.name,
        },
      });

      // Emotion update + memory extraction (same as single-character path)
      await chatService.updateEmotionFromMessage(
        character.id, userId, chatId, userContent, savedMessage.id
      );
      await chatService.updateEmotionFromMessage(
        character.id, userId, chatId, fullContent, savedMessage.id
      );
      const allMessages = await chatService.getMessages(chatId);
      await chatService.checkAndExtractMemories(chatId, character.id, userId, allMessages);
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
      /** 点数模式下预扣对应的输出上限；订阅模式不传，请求与之前完全一致 */
      maxTokens?: number;
      /** 实时进度，调用方在失败/中断时据此结算或释放预扣 */
      progress?: StreamProgress;
    }
  ): Promise<StreamedLlmResult> {
    const selectedModel = model || getDefaultModel() || 'glm-4.5-air';
    const meta = getModelMeta(selectedModel);
    const response = await llmService.streamChatCompletion({
      messages: llmMessages,
      model: selectedModel,
      temperature: meta.defaultTemperature,
      n: 1,
      stream: true,
      presence_penalty: 0,
      frequency_penalty: 0,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }, signal, { chatId });

    // progress 同时承载累积内容与 usage（用对象，避免闭包内赋值被 TS 控制流收窄成 null）
    const streamState: StreamProgress = options?.progress ?? newStreamProgress();
    streamState.started = true;
    let chunkIndex = 0;
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const emitChunk = (content: string): void => {
      streamState.content += content;

      websocketService.broadcastToChat(chatId, {
        type: WSMessageType.ASSISTANT_MESSAGE_CHUNK,
        timestamp: new Date().toISOString(),
        data: {
          chatId,
          messageId,
          chunk: content,
          index: chunkIndex++,
          ...(characterId && { characterId }),
          ...(characterName && { characterName }),
        },
      });
    };

    const handleLine = (line: string): void => {
      // Handle OpenAI-style SSE format (data: {...})
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) emitChunk(content);

          // include_usage 的最后一个 chunk：choices 为空，带真实 usage
          streamState.usage = readOpenAiUsage(parsed.usage) ?? streamState.usage;
        } catch (e) {
          wsLogger.error('Error parsing SSE data', e as Error);
        }
        return;
      }

      // Handle Ollama native format (plain JSON per line)
      try {
        const parsed = JSON.parse(line);
        // Ollama native API format: message.content
        const content = parsed.message?.content;
        if (content) emitChunk(content);

        // Ollama 的最后一行（done: true）带 prompt_eval_count / eval_count
        streamState.usage = readOllamaUsage(parsed) ?? streamState.usage;
      } catch (e) {
        // Not JSON, skip this line
      }
    };

    if (reader) {
      // SSE 行可能被网络分包切开；usage 在流的最后，丢了就只能退回估算，所以按行缓冲
      let pending = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Check if aborted between chunks
          if (signal?.aborted) break;

          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';

          for (const line of lines) {
            if (line.trim() !== '') handleLine(line);
          }
        }

        if (!signal?.aborted && pending.trim() !== '') handleLine(pending);
      } catch (e) {
        // AbortError is expected when generation is cancelled
        if ((e as Error).name !== 'AbortError') {
          throw e;
        }
        wsLogger.info('LLM stream aborted', { chatId });
      } finally {
        // Ensure the reader is released
        try { reader.cancel(); } catch { /* ignore */ }
      }
    }

    return { content: streamState.content, usage: streamState.usage };
  }

  /**
   * Stream text completion (for prompt templates)
   */
  private async streamTextCompletion(
    chatId: string,
    messageId: string,
    prompt: string,
    model?: string,
    signal?: AbortSignal
  ): Promise<StreamedLlmResult> {
    const selectedModel = model || getDefaultModel() || 'glm-4.5-air';
    const meta = getModelMeta(selectedModel);

    // Note: Most LLM providers don't support streaming for text completion
    // We'll use non-streaming completion and send the full response
    const response = await llmService.completion({
      prompt,
      model: selectedModel,
      temperature: meta.defaultTemperature,
      max_tokens: TEMPLATE_COMPLETION_MAX_TOKENS,
      n: 1,
      stream: false,
      presence_penalty: 0,
      frequency_penalty: 0,
    });

    const fullContent = response.choices?.[0]?.text || '';

    // Send the full content as a single chunk
    websocketService.broadcastToChat(chatId, {
      type: WSMessageType.ASSISTANT_MESSAGE_CHUNK,
      timestamp: new Date().toISOString(),
      data: {
        chatId,
        messageId,
        chunk: fullContent,
        index: 0,
      },
    });

    return { content: fullContent, usage: readOpenAiUsage(response.usage) };
  }

  /**
   * 处理中止生成
   */
  private async handleAbortGeneration(message: WSAbortGenerationMessage): Promise<void> {
    const { chatId } = message.data;
    const controller = this.activeGenerations.get(chatId);
    if (controller) {
      wsLogger.info('Aborting generation', { chatId });
      controller.abort();
      this.activeGenerations.delete(chatId);
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
    if (!chat || chat.userId !== clientInfo.userId) {
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
