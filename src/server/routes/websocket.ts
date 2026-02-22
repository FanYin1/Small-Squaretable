/**
 * WebSocket Route
 *
 * 处理 WebSocket 连接和消息路由
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { verifyAccessToken } from '../../core/jwt';
import { logger } from '../services/logger.service';

const wsLogger = logger.child({ module: 'websocket' });
import { websocketService } from '../services/websocket.service';
import { llmService } from '../services/llm.service';
import { getDefaultModel, getModelMeta } from '../config/llm.config';
import { chatService, getChatModel } from '../services/chat.service';
import { contextManager } from '../services/context-manager.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { characterRepository } from '../../db/repositories/character.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { groupChatService } from '../services/group-chat.service';
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
} from '../../types/websocket';
import { nanoid } from 'nanoid';

export class WebSocketHandler {
  private wss: WebSocketServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

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

    const { chatId, content } = message.data;
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
        await this.handleGroupChatResponse(chatId, content, clientInfo.userId);
      } else {
        // --- Single-character path (unchanged) ---
        await this.handleSingleCharacterResponse(chatId, content, clientInfo.userId, userMessage.id);
      }
    } catch (error) {
      wsLogger.error('Error handling user message', error as Error);
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

    const messages = await chatService.getMessages(chatId);
    const chatMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    // Determine model from chat metadata or default
    const model = getChatModel(chat) || getDefaultModel() || 'glm-4.5-air';

    let systemPrompt = '';
    if (character) {
      const enhancedPrompt = await chatService.buildEnhancedSystemPrompt({
        character,
        characterId: character.id,
        userId,
        chatId,
        userMessage: content,
      });
      systemPrompt = enhancedPrompt.systemPrompt;

      await chatService.updateEmotionFromMessage(
        character.id, userId, chatId, content, userMessageId
      );
    }

    // Use context manager to fit within token budget
    const contextResult = contextManager.buildContext(systemPrompt, chatMessages, model);

    const assistantMessageId = nanoid();
    const fullContent = await this.streamLlmResponse(chatId, assistantMessageId, contextResult.messages, undefined, undefined, model);

    const assistantMessage = await chatService.addMessage(chatId, {
      role: 'assistant',
      content: fullContent,
    });

    websocketService.broadcastToChat(chatId, {
      type: WSMessageType.ASSISTANT_MESSAGE_DONE,
      timestamp: new Date().toISOString(),
      data: {
        chatId,
        messageId: assistantMessage.id.toString(),
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
    userId: string
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

    const respondentIds = await groupChatService.selectRespondents(
      chatId, 'round_robin', lastResponderId
    );

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
      });

      // Build chat messages and use context manager
      const chatMessages = (await chatService.getMessages(chatId)).map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));
      const contextResult = contextManager.buildContext(enhancedPrompt.systemPrompt, chatMessages, model);

      // Stream LLM response with character identification
      const tempMessageId = nanoid();
      const fullContent = await this.streamLlmResponse(
        chatId, tempMessageId, contextResult.messages, character.id, character.name, model
      );

      // Save message with characterId
      const savedMessage = await messageRepository.create({
        chatId,
        role: 'assistant',
        content: fullContent,
        characterId: character.id,
      });

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
    model?: string
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
    });

    let fullContent = '';
    let chunkIndex = 0;
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
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
          }
        }
      }
    }

    return fullContent;
  }

  /**
   * 处理加入聊天
   */
  private async handleJoinChat(
    clientId: string,
    message: WSChatControlMessage
  ): Promise<void> {
    const { chatId } = message.data;
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
  private async handleTyping(clientId: string, _message: WSTypingMessage): Promise<void> {
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
        },
      },
      clientId
    );
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
