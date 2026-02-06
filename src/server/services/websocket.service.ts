/**
 * WebSocket Service
 *
 * 管理 WebSocket 连接、房间和消息广播
 */

import type { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import type { WSClientInfo, WSMessageUnion } from '../../types/websocket';
import { WSMessageType } from '../../types/websocket';

export class WebSocketService {
  private clients: Map<string, { ws: WebSocket; info: WSClientInfo }> = new Map();
  private chatRooms: Map<string, Set<string>> = new Map(); // chatId -> Set<clientId>

  /**
   * 注册新客户端
   */
  registerClient(ws: WebSocket, userId: string, tenantId: string): string {
    const clientId = nanoid();
    const now = new Date();

    this.clients.set(clientId, {
      ws,
      info: {
        id: clientId,
        userId,
        tenantId,
        connectedAt: now,
        lastHeartbeat: now,
      },
    });

    return clientId;
  }

  /**
   * 注销客户端
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // 从所有聊天室中移除
    if (client.info.chatId) {
      this.leaveChat(clientId);
    }

    this.clients.delete(clientId);
  }

  /**
   * 获取客户端信息
   */
  getClientInfo(clientId: string): WSClientInfo | undefined {
    return this.clients.get(clientId)?.info;
  }

  /**
   * 加入聊天室
   */
  joinChat(clientId: string, chatId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // 如果已在其他聊天室，先离开
    if (client.info.chatId) {
      this.leaveChat(clientId);
    }

    // 加入新聊天室
    client.info.chatId = chatId;

    if (!this.chatRooms.has(chatId)) {
      this.chatRooms.set(chatId, new Set());
    }
    this.chatRooms.get(chatId)!.add(clientId);
  }

  /**
   * 离开聊天室
   */
  leaveChat(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.info.chatId) return;

    const chatId = client.info.chatId;
    const room = this.chatRooms.get(chatId);

    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.chatRooms.delete(chatId);
      }
    }

    client.info.chatId = undefined;
  }

  /**
   * 获取聊天室中的所有客户端
   */
  getChatClients(chatId: string): string[] {
    const room = this.chatRooms.get(chatId);
    return room ? Array.from(room) : [];
  }

  /**
   * 向特定客户端发送消息
   */
  sendToClient(clientId: string, message: WSMessageUnion): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // 检查连接状态 (1 = OPEN)
    if (client.ws.readyState !== 1) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Failed to send message to client ${clientId}:`, error);
    }
  }

  /**
   * 向聊天室广播消息
   */
  broadcastToChat(chatId: string, message: WSMessageUnion, excludeClientId?: string): void {
    const clientIds = this.getChatClients(chatId);

    for (const clientId of clientIds) {
      if (clientId === excludeClientId) continue;
      this.sendToClient(clientId, message);
    }
  }

  /**
   * 向租户的所有客户端广播消息
   */
  broadcastToTenant(tenantId: string, message: WSMessageUnion): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.info.tenantId === tenantId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  /**
   * 更新心跳时间戳
   */
  updateHeartbeat(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.info.lastHeartbeat = new Date();
    }
  }

  /**
   * 清理超时的连接
   */
  cleanupStaleConnections(timeoutMs: number = 60000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [clientId, client] of this.clients.entries()) {
      const lastHeartbeat = client.info.lastHeartbeat.getTime();
      if (now - lastHeartbeat > timeoutMs) {
        this.unregisterClient(clientId);
        client.ws.close();
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      totalChatRooms: this.chatRooms.size,
      clientsPerRoom: Array.from(this.chatRooms.entries()).map(([chatId, clients]) => ({
        chatId,
        clientCount: clients.size,
      })),
    };
  }

  /**
   * 关闭所有连接
   */
  close(): void {
    for (const [clientId, client] of this.clients.entries()) {
      client.ws.close();
      this.unregisterClient(clientId);
    }
    this.clients.clear();
    this.chatRooms.clear();
  }

  /**
   * 发送情感变化事件
   */
  emitEmotionChange(
    chatId: string,
    characterId: string,
    previous: { valence: number; arousal: number; label: string } | null,
    current: { valence: number; arousal: number; label: string },
    trigger: string
  ): void {
    this.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_EMOTION_CHANGE,
      timestamp: new Date().toISOString(),
      data: { chatId, characterId, previous, current, trigger },
    });
  }

  /**
   * 发送记忆检索事件
   */
  emitMemoryRetrieval(
    chatId: string,
    query: string,
    results: Array<{ id: string; content: string; score: number }>,
    latencyMs: number
  ): void {
    this.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_MEMORY_RETRIEVAL,
      timestamp: new Date().toISOString(),
      data: { chatId, query, results, latencyMs },
    });
  }

  /**
   * 发送记忆提取事件
   */
  emitMemoryExtraction(
    chatId: string,
    extracted: Array<{ type: string; content: string; importance: number }>,
    messageCount: number
  ): void {
    this.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_MEMORY_EXTRACTION,
      timestamp: new Date().toISOString(),
      data: { chatId, extracted, messageCount },
    });
  }

  /**
   * 发送提示构建事件
   */
  emitPromptBuild(
    chatId: string,
    tokenCount: number,
    memoriesIncluded: number,
    emotionIncluded: boolean,
    latencyMs: number
  ): void {
    this.broadcastToChat(chatId, {
      type: WSMessageType.INTELLIGENCE_PROMPT_BUILD,
      timestamp: new Date().toISOString(),
      data: { chatId, tokenCount, memoriesIncluded, emotionIncluded, latencyMs },
    });
  }
}

export const websocketService = new WebSocketService();
