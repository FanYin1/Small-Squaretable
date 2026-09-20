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
import { contextManager } from '../services/context-manager.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { characterRepository } from '../../db/repositories/character.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { characterGrowthRepository } from '../../db/repositories/character-growth.repository';
import { groupChatService } from '../services/group-chat.service';
import { applyRegexScripts, getRegexScripts, RegexPlacement } from '../services/regex-scripts.service';
import { formatMessagesWithTemplate } from '../config/prompt-templates';
import { extractVariableInserts, extractVariableEdits, extractVariableDeletes } from '../utils/variable-insert';
import { chatVariableStore } from '../services/chat-variable.service';
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
      // 保存用户消息到数据库
      const userMessage = await chatService.addMessage(chatId, {
        role: 'user',
        content,
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
        await this.handleGroupChatResponse(chatId, content, clientInfo.userId, mentionedCharacterIds);
      } else {
        // --- Single-character path (unchanged) ---
        await this.handleSingleCharacterResponse(chatId, content, clientInfo.userId, userMessage.id);
      }
    } catch (error) {
      wsLogger.error('Error handling user message', { error: (error as Error).message, stack: (error as Error).stack });
      websocketService.sendToClient(clientId, {
        type: WSMessageType.ERROR,
        timestamp: new Date().toISOString(),
        data: {
          code: 'MESSAGE_ERROR',
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
    userMessageId: number
  ): Promise<void> {
    const chat = await chatRepository.findById(chatId);
    if (!chat) throw new Error('Chat not found');

    const character = chat.characterId
      ? await characterRepository.findById(chat.characterId)
      : null;

    const chatMetadata = (chat.metadata as Record<string, unknown>) || {};
    const activeBranchLeaf = chatMetadata.activeBranchLeafId as number | undefined;

    let chatMessages;
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
    const contextResult = contextManager.buildContext(systemPrompt, chatMessages, model);

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

    let fullContent: string;
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

        // Use text completion API
        fullContent = await this.streamTextCompletion(
          chatId,
          assistantMessageId,
          formattedPrompt,
          model,
          abortController.signal
        );
      } else {
        // Use standard chat completion for default template
        fullContent = await this.streamLlmResponse(
          chatId,
          assistantMessageId,
          contextResult.messages,
          undefined,
          undefined,
          model,
          abortController.signal
        );
      }
    } finally {
      this.activeGenerations.delete(chatId);
    }

    // Don't save empty message if aborted before any content was generated
    if (!fullContent) return;

    // Apply regex_scripts post-processing on AI output (skip markdownOnly scripts — those run client-side)
    if (character) {
      const scripts = getRegexScripts(character.cardData as Record<string, unknown>);
      fullContent = applyRegexScripts(fullContent, scripts, RegexPlacement.AI_OUTPUT, false);
    }

    const assistantMessage = await chatService.addMessage(chatId, {
      role: 'assistant',
      content: fullContent,
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
    mentionedCharacterIds?: string[]
  ): Promise<void> {
    // Load chat to determine model
    const chat = await chatRepository.findById(chatId);
    const model = (chat ? getChatModel(chat) : null) || getDefaultModel() || 'glm-4.5-air';

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
    let chatMessages = recentMessages.map(m => ({
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
      const contextResult = contextManager.buildContext(enhancedPrompt.systemPrompt, chatMessages, model);
      // Inject depth entries for this character
      contextResult.messages = contextManager.injectAtDepth(contextResult.messages, enhancedPrompt.atDepthEntries);

      // Stream LLM response with character identification
      const tempMessageId = nanoid();
      const abortController = new AbortController();
      this.activeGenerations.set(chatId, abortController);

      let fullContent: string;
      try {
        fullContent = await this.streamLlmResponse(
          chatId, tempMessageId, contextResult.messages, character.id, character.name, model, abortController.signal
        );
      } finally {
        this.activeGenerations.delete(chatId);
      }

      // Don't save empty message if aborted before any content was generated
      if (!fullContent) break;

      // Apply regex_scripts post-processing on AI output (skip markdownOnly — those run client-side)
      const scripts = getRegexScripts(character.cardData as Record<string, unknown>);
      fullContent = applyRegexScripts(fullContent, scripts, RegexPlacement.AI_OUTPUT, false);

      // Save message with characterId
      const savedMessage = await messageRepository.create({
        chatId,
        role: 'assistant',
        content: fullContent,
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
    signal?: AbortSignal
  ): Promise<string> {
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
    }, signal);

    let fullContent = '';
    let chunkIndex = 0;
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Check if aborted between chunks
          if (signal?.aborted) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((line) => line.trim() !== '');

          for (const line of lines) {
            // Handle OpenAI-style SSE format (data: {...})
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                  fullContent += content;

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
                }
              } catch (e) {
                wsLogger.error('Error parsing SSE data', e as Error);
              }
            } else {
              // Handle Ollama native format (plain JSON per line)
              try {
                const parsed = JSON.parse(line);
                // Ollama native API format: message.content
                const content = parsed.message?.content;

                if (content) {
                  fullContent += content;

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
                }
              } catch (e) {
                // Not JSON, skip this line
              }
            }
          }
        }
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

    return fullContent;
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
  ): Promise<string> {
    const selectedModel = model || getDefaultModel() || 'glm-4.5-air';
    const meta = getModelMeta(selectedModel);

    // Note: Most LLM providers don't support streaming for text completion
    // We'll use non-streaming completion and send the full response
    const response = await llmService.completion({
      prompt,
      model: selectedModel,
      temperature: meta.defaultTemperature,
      max_tokens: 2048,
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

    return fullContent;
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
