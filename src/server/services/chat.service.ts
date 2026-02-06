/**
 * 聊天服务
 *
 * 处理聊天的 CRUD 操作和消息管理
 */

import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { NotFoundError } from '../../core/errors';
import type { CreateChatInput, UpdateChatInput, CreateMessageInput } from '../../types/chat';
import type { PaginationParams, PaginatedResponse } from '../../types/api';
import type { Chat, Message } from '../../db/schema/chats';
import type { MessagePagination } from '../../db/repositories/message.repository';
import { memoryService } from './memory.service';
import { emotionService } from './emotion.service';
import { websocketService } from './websocket.service';
import { intelligenceDebugService } from './intelligence-debug.service';
import type { Character } from '../../db/schema/characters';

export interface EnhancedPromptParams {
  character: Character;
  characterId: string;
  userId: string;
  chatId: string;
  userMessage: string;
}

export class ChatService {
  // Message counter for batch extraction
  private messageCounters: Map<string, number> = new Map();

  constructor(
    private chatRepo = chatRepository,
    private messageRepo = messageRepository
  ) {}

  async create(userId: string, tenantId: string, data: CreateChatInput): Promise<Chat> {
    return await this.chatRepo.create({
      ...data,
      tenantId,
      userId,
    });
  }

  async getById(chatId: string, userId: string, tenantId: string): Promise<Chat> {
    const chat = await this.chatRepo.findByIdAndTenant(chatId, tenantId);
    if (!chat) {
      throw new NotFoundError('Chat');
    }
    return chat;
  }

  async getByUserId(
    userId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<Chat>> {
    const chats = await this.chatRepo.findByUserId(userId, pagination);

    // Count total chats for user
    const allChats = await this.chatRepo.findByUserId(userId);
    const total = allChats.length;

    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const totalPages = Math.ceil(total / limit);

    return {
      items: chats,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async update(
    chatId: string,
    userId: string,
    tenantId: string,
    data: UpdateChatInput
  ): Promise<Chat> {
    const chat = await this.chatRepo.findByIdAndTenant(chatId, tenantId);
    if (!chat) {
      throw new NotFoundError('Chat');
    }

    const updated = await this.chatRepo.update(chatId, tenantId, data);
    if (!updated) {
      throw new NotFoundError('Chat');
    }

    return updated;
  }

  async delete(chatId: string, userId: string, tenantId: string): Promise<void> {
    const chat = await this.chatRepo.findByIdAndTenant(chatId, tenantId);
    if (!chat) {
      throw new NotFoundError('Chat');
    }

    await this.chatRepo.delete(chatId, tenantId);
  }

  async addMessage(chatId: string, data: CreateMessageInput): Promise<Message> {
    return await this.messageRepo.create({
      chatId,
      ...data,
    });
  }

  async getMessages(chatId: string, pagination?: MessagePagination): Promise<Message[]> {
    return await this.messageRepo.findByChatId(chatId, pagination);
  }

  /**
   * Build an enhanced system prompt with memories and emotion state
   */
  async buildEnhancedSystemPrompt(params: EnhancedPromptParams): Promise<string> {
    const { character, characterId, userId, chatId, userMessage } = params;
    console.log('[Intelligence] Building enhanced prompt for chat:', chatId, 'character:', characterId);
    const promptStartTime = Date.now();
    const parts: string[] = [];

    // Base character prompt
    const cardData = (character.cardData as Record<string, string>) || {};
    parts.push(`You are ${character.name}.`);
    if (character.description) {
      parts.push(character.description);
    }
    if (cardData.personality) {
      parts.push(`Personality: ${cardData.personality}`);
    }
    if (cardData.scenario) {
      parts.push(`Scenario: ${cardData.scenario}`);
    }
    if (cardData.system_prompt) {
      parts.push(cardData.system_prompt);
    }

    // Retrieve relevant memories with timing (session-isolated)
    const retrievalStartTime = Date.now();
    console.log('[Intelligence] Retrieving memories for query:', userMessage.substring(0, 50));
    const memories = await memoryService.retrieveMemories({
      characterId,
      userId,
      query: userMessage,
      chatId,  // Filter by chat session for isolation
      limit: 5,
    });
    const retrievalLatency = Date.now() - retrievalStartTime;
    console.log('[Intelligence] Retrieved', memories.length, 'memories in', retrievalLatency, 'ms');

    // Record retrieval for debug
    intelligenceDebugService.recordRetrieval(characterId, userId, chatId, {
      query: userMessage,
      results: memories.map((m) => ({
        id: m.id,
        content: m.content,
        type: m.type,
        score: m.score ?? 0,
        similarity: m.score ?? 0, // Use score as similarity proxy
        importance: 0.5, // Default importance
        recency: 0.5, // Default recency
      })),
      latencyMs: retrievalLatency,
    });
    intelligenceDebugService.recordLatency(characterId, userId, chatId, 'retrievalLatency', retrievalLatency);

    // Emit WebSocket event for memory retrieval
    websocketService.emitMemoryRetrieval(
      chatId,
      userMessage,
      memories.map((m) => ({ id: m.id, content: m.content, score: m.score ?? 0 })),
      retrievalLatency
    );

    if (memories.length > 0) {
      parts.push('\n## 关于用户的记忆');
      const memoryByType: Record<string, string[]> = {
        fact: [],
        preference: [],
        relationship: [],
        event: [],
      };

      for (const mem of memories) {
        memoryByType[mem.type]?.push(mem.content);
      }

      if (memoryByType.fact.length > 0) {
        parts.push(`【事实】${memoryByType.fact.join('；')}`);
      }
      if (memoryByType.preference.length > 0) {
        parts.push(`【偏好】${memoryByType.preference.join('；')}`);
      }
      if (memoryByType.relationship.length > 0) {
        parts.push(`【关系】${memoryByType.relationship.join('；')}`);
      }
      if (memoryByType.event.length > 0) {
        parts.push(`【事件】${memoryByType.event.join('；')}`);
      }
    }

    // Get current emotion
    const emotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);
    if (emotion) {
      parts.push(`\n## 当前情感状态`);
      parts.push(
        `当前情感: ${emotion.label}, Valence: ${emotion.valence.toFixed(2)}, Arousal: ${emotion.arousal.toFixed(2)}`
      );
    }

    // Behavior guidelines
    parts.push('\n## 行为指引');
    parts.push('- 根据记忆中的信息个性化回复');
    parts.push('- 保持情感状态的一致性，情感变化应自然过渡');
    parts.push('- 可以主动提及相关记忆，但不要生硬');
    parts.push('Stay in character at all times.');

    const fullPrompt = parts.join('\n');
    const promptBuildLatency = Date.now() - promptStartTime;

    // Record prompt build latency
    intelligenceDebugService.recordLatency(characterId, userId, chatId, 'promptBuildLatency', promptBuildLatency);

    // Emit WebSocket event for prompt build
    websocketService.emitPromptBuild(
      chatId,
      fullPrompt.length, // Approximate token count (chars as proxy)
      memories.length,
      !!emotion,
      promptBuildLatency
    );

    return fullPrompt;
  }

  /**
   * Check message count and extract memories periodically
   */
  async checkAndExtractMemories(
    chatId: string,
    characterId: string,
    userId: string,
    messages: Message[]
  ): Promise<void> {
    const key = `${chatId}`;
    const count = (this.messageCounters.get(key) ?? 0) + 1;
    this.messageCounters.set(key, count);

    // Update message counter in debug service
    intelligenceDebugService.incrementMessageCounter(characterId, userId, chatId);

    // Extract memories every 1 message (immediate extraction)
    if (count >= 1) {
      this.messageCounters.set(key, 0);
      const recentMessages = messages.slice(-2); // Get last 2 messages (user + assistant)
      const extracted = await memoryService.extractMemories(characterId, userId, recentMessages);

      for (const memory of extracted) {
        await memoryService.storeMemory(characterId, userId, memory, chatId);
      }

      // Emit WebSocket event for memory extraction
      if (extracted.length > 0) {
        websocketService.emitMemoryExtraction(
          chatId,
          extracted.map((m) => ({ type: m.type, content: m.content, importance: m.importance })),
          count
        );
      }
    }
  }

  /**
   * Update emotion state from a message
   */
  async updateEmotionFromMessage(
    characterId: string,
    userId: string,
    chatId: string,
    messageContent: string,
    messageId?: number
  ): Promise<void> {
    console.log('[Intelligence] Updating emotion for chat:', chatId, 'message:', messageContent.substring(0, 50));
    // Get previous emotion state
    const previousEmotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);

    // Analyze and update emotion
    const result = await emotionService.analyzeAndUpdate({
      characterId,
      userId,
      chatId,
      text: messageContent,
      messageId,
    });

    // Record emotion analysis latency
    intelligenceDebugService.recordLatency(characterId, userId, chatId, 'emotionAnalysisLatency', 0);

    // Emit WebSocket event for emotion change
    if (result) {
      websocketService.emitEmotionChange(
        chatId,
        characterId,
        previousEmotion
          ? { valence: previousEmotion.valence, arousal: previousEmotion.arousal, label: previousEmotion.label }
          : null,
        { valence: result.valence, arousal: result.arousal, label: result.label },
        messageContent.substring(0, 100)
      );
    }
  }
}

export const chatService = new ChatService();
