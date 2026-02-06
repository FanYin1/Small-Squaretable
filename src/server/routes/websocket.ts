/**
 * WebSocket Route
 *
 * 处理 WebSocket 连接和消息路由
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { verifyAccessToken } from '../../core/jwt';
import { websocketService } from '../services/websocket.service';
import { llmService } from '../services/llm.service';
import { getDefaultModel } from '../config/llm.config';
import { chatService } from '../services/chat.service';
import { chatRepository } from '../../db/repositories/chat.repository';
import { characterRepository } from '../../db/repositories/character.repository';
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

    console.log('✅ WebSocket server initialized on /ws');
  }

  /**
   * 处理新连接
   */
  private async handleConnection(ws: WebSocket, request: { url: string; headers: { host: string } }): Promise<void> {
    console.log('[WebSocket] New connection attempt from:', request.headers.host);
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
          console.error('Error handling message:', err);
          this.sendError(ws, 'MESSAGE_ERROR', 'Failed to process message');
        });
      });

      // 设置关闭处理器
      ws.on('close', () => {
        websocketService.unregisterClient(clientId);
      });

      // 设置错误处理器
      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
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
      console.log('[WebSocket] Received message type:', message.type);

      switch (message.type) {
        case WSMessageType.USER_MESSAGE:
          console.log('[WebSocket] Processing USER_MESSAGE');
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
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  /**
   * 处理用户消息
   */
  private async handleUserMessage(clientId: string, message: WSUserMessage): Promise<void> {
    console.log('[WebSocket] handleUserMessage called');
    const clientInfo = websocketService.getClientInfo(clientId);
    if (!clientInfo) {
      console.log('[WebSocket] No client info found');
      return;
    }

    const { chatId, content } = message.data;
    console.log('[WebSocket] Processing message for chat:', chatId, 'content:', content.substring(0, 50));

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

      // 获取聊天和角色信息
      const chat = await chatRepository.findById(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const character = chat.characterId
        ? await characterRepository.findById(chat.characterId)
        : null;

      // 获取聊天上下文
      const messages = await chatService.getMessages(chatId);

      // 构建消息数组，包含智能系统增强的 system prompt
      const llmMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

      if (character) {
        // 使用智能系统构建增强的 system prompt
        const enhancedPrompt = await chatService.buildEnhancedSystemPrompt({
          character,
          characterId: character.id,
          userId: clientInfo.userId,
          chatId,
          userMessage: content,
        });
        llmMessages.push({ role: 'system', content: enhancedPrompt });

        // 更新情感状态
        await chatService.updateEmotionFromMessage(
          character.id,
          clientInfo.userId,
          chatId,
          content,
          userMessage.id
        );
      }

      // 添加历史消息
      for (const m of messages) {
        llmMessages.push({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        });
      }

      // 调用 LLM 生成回复（流式）
      const assistantMessageId = nanoid();
      const response = await llmService.streamChatCompletion({
        messages: llmMessages,
        model: getDefaultModel() || 'glm-4.5-air',
        temperature: 0.7,
        n: 1,
        stream: true,
        presence_penalty: 0,
        frequency_penalty: 0,
      });

      // 处理流式响应
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

                  // 广播消息块
                  websocketService.broadcastToChat(chatId, {
                    type: WSMessageType.ASSISTANT_MESSAGE_CHUNK,
                    timestamp: new Date().toISOString(),
                    data: {
                      chatId,
                      messageId: assistantMessageId,
                      chunk: content,
                      index: chunkIndex++,
                    },
                  });
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
      }

      // 保存助手消息到数据库
      const assistantMessage = await chatService.addMessage(chatId, {
        role: 'assistant',
        content: fullContent,
      });

      // 广播消息完成
      websocketService.broadcastToChat(chatId, {
        type: WSMessageType.ASSISTANT_MESSAGE_DONE,
        timestamp: new Date().toISOString(),
        data: {
          chatId,
          messageId: assistantMessage.id.toString(),
        },
      });

      // 智能系统: 提取记忆 (每 5 条消息)
      if (character) {
        const allMessages = await chatService.getMessages(chatId);
        await chatService.checkAndExtractMemories(
          chatId,
          character.id,
          clientInfo.userId,
          allMessages
        );

        // 更新情感状态 (基于助手回复)
        await chatService.updateEmotionFromMessage(
          character.id,
          clientInfo.userId,
          chatId,
          fullContent,
          assistantMessage.id
        );
      }
    } catch (error) {
      console.error('Error handling user message:', error);
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
        console.log(`Cleaned up ${cleaned} stale connections`);
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
