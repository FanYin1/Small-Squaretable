/**
 * 聊天服务
 *
 * 处理聊天的 CRUD 操作和消息管理
 */

import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { NotFoundError, AppError } from '../../core/errors';
import { logger } from './logger.service';
import { llmService } from './llm.service';
import { getDefaultModel } from '../config/llm.config';

const chatLogger = logger.child({ module: 'chat' });
import type { CreateChatInput, UpdateChatInput, CreateMessageInput } from '../../types/chat';
import type { PaginationParams, PaginatedResponse } from '../../types/api';
import type { Chat, Message } from '../../db/schema/chats';
import type { MessagePagination } from '../../db/repositories/message.repository';
import { memoryService } from './memory.service';
import { emotionService } from './emotion.service';
import { websocketService } from './websocket.service';
import { intelligenceDebugService } from './intelligence-debug.service';
import { worldInfoEngine, type WorldInfoResult } from './worldinfo-engine.service';
import { estimateTokens } from '../utils/tokens';
import type { Character } from '../../db/schema/characters';

export interface EnhancedPromptParams {
  character: Character;
  characterId: string;
  userId: string;
  userName?: string;
  chatId: string;
  userMessage: string;
  messages?: Array<{ role: string; content: string }>;
  maxContext?: number;
}

export interface EnhancedPromptResult {
  systemPrompt: string;
  atDepthEntries: Array<{ depth: number; content: string }>;
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

  async deleteMessage(chatId: string, messageId: number, userId: string, tenantId: string): Promise<void> {
    // Verify chat ownership
    const chat = await this.chatRepo.findByIdAndTenant(chatId, tenantId);
    if (!chat || chat.userId !== userId) {
      throw new NotFoundError('Chat');
    }

    // Verify message belongs to this chat
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.chatId !== chatId) {
      throw new NotFoundError('Message');
    }

    await this.messageRepo.delete(messageId);
  }

  async editMessage(
    chatId: string,
    messageId: number,
    content: string,
    userId: string,
    tenantId: string
  ): Promise<Message> {
    const chat = await this.chatRepo.findByIdAndTenant(chatId, tenantId);
    if (!chat || chat.userId !== userId) {
      throw new NotFoundError('Chat');
    }

    const message = await this.messageRepo.findById(messageId);
    if (!message || message.chatId !== chatId) {
      throw new NotFoundError('Message');
    }

    const updated = await this.messageRepo.update(messageId, { content });
    if (!updated) {
      throw new NotFoundError('Message');
    }
    return updated;
  }

  /**
   * Generate a conversation summary using the LLM and persist it.
   */
  async generateSummary(chatId: string, userId: string): Promise<string> {
    const chat = await this.chatRepo.findById(chatId);
    if (!chat || chat.userId !== userId) {
      throw new NotFoundError('Chat');
    }

    const msgs = await this.messageRepo.findByChatId(chatId, { limit: 100 });
    if (msgs.length === 0) {
      throw new AppError('No messages to summarize', 400, 'NO_MESSAGES');
    }

    const conversationText = msgs
      .map((m) => `${m.role}: ${m.content.substring(0, 500)}`)
      .join('\n');

    const model = getDefaultModel();
    if (!model) {
      throw new AppError('No LLM provider configured', 500, 'LLM_NOT_CONFIGURED');
    }

    const response = await llmService.chatCompletion({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Summarize the following conversation in 2-3 sentences. Focus on key topics and conclusions.',
        },
        {
          role: 'user',
          content: conversationText,
        },
      ],
      stream: false,
      temperature: 0.3,
    });

    const summary =
      response.choices?.[0]?.message?.content || 'Unable to generate summary';

    await this.chatRepo.update(chatId, chat.tenantId, { summary });

    return summary;
  }

  /**
   * Build an enhanced system prompt with memories and emotion state
   */
  async buildEnhancedSystemPrompt(params: EnhancedPromptParams): Promise<EnhancedPromptResult> {
    const { character, characterId, userId, chatId, userMessage } = params;
    chatLogger.debug('Building enhanced prompt', { chatId, characterId });
    const promptStartTime = Date.now();
    const parts: string[] = [];

    // Base character prompt
    const cardData = (character.cardData as Record<string, string>) || {};

    // Build default system prompt parts (used as {{original}} replacement)
    const defaultPromptParts: string[] = [];
    defaultPromptParts.push(`You are ${character.name}.`);
    if (character.description) {
      defaultPromptParts.push(character.description);
    }
    if (cardData.personality) {
      defaultPromptParts.push(`Personality: ${cardData.personality}`);
    }
    if (cardData.scenario) {
      defaultPromptParts.push(`Scenario: ${cardData.scenario}`);
    }

    // Apply {{char}} and {{user}} macro substitution
    const userName = params.userName || 'User';
    const applyMacros = (text: string): string =>
      text.replace(/\{\{char\}\}/gi, character.name).replace(/\{\{user\}\}/gi, userName);

    if (cardData.system_prompt) {
      let systemPrompt = cardData.system_prompt;
      // Support {{original}} placeholder - replaces with the default system prompt
      if (/\{\{original\}\}/i.test(systemPrompt)) {
        systemPrompt = systemPrompt.replace(/\{\{original\}\}/gi, defaultPromptParts.join('\n'));
      } else {
        // No {{original}}, prepend default parts then append system_prompt
        parts.push(...defaultPromptParts.map(applyMacros));
      }
      parts.push(applyMacros(systemPrompt));
    } else {
      parts.push(...defaultPromptParts.map(applyMacros));
    }

    // Example dialogue
    if (cardData.mes_example) {
      const exampleBlock = this.parseExampleMessages(cardData.mes_example, character.name, userName);
      if (exampleBlock) {
        parts.push(exampleBlock);
      }
    }

    // Scan world book entries
    let worldInfo: WorldInfoResult | null = null;
    if (params.messages && params.messages.length > 0) {
      try {
        worldInfo = await worldInfoEngine.scan({
          chat: params.messages as Message[],
          characterId,
          userId,
          chatId,
          maxContext: params.maxContext ?? 4096,
        });
      } catch (error) {
        chatLogger.warn('World info scan failed', { error: (error as Error).message });
      }
    }

    // Record world info debug data
    if (worldInfo?.debugInfo) {
      intelligenceDebugService.recordWorldInfoScan(characterId, userId, chatId, {
        scannedEntries: worldInfo.debugInfo.scannedEntries,
        activatedCount: worldInfo.debugInfo.activatedCount,
        budgetUsed: worldInfo.debugInfo.budgetUsed,
        budgetLimit: worldInfo.debugInfo.budgetLimit,
        scanTimeMs: worldInfo.debugInfo.scanTimeMs,
        matches: worldInfo.debugInfo.matches,
      });
      intelligenceDebugService.recordLatency(characterId, userId, chatId, 'worldInfoScanLatency', worldInfo.debugInfo.scanTimeMs);
    }

    // Inject world info: before position
    if (worldInfo?.before) {
      parts.unshift(worldInfo.before);
    }

    // Retrieve relevant memories with timing (session-isolated)
    const retrievalStartTime = Date.now();
    chatLogger.debug('Retrieving memories', { query: userMessage.substring(0, 50) });
    const memories = await memoryService.retrieveMemories({
      characterId,
      userId,
      query: userMessage,
      chatId,  // Filter by chat session for isolation
      limit: 5,
    });
    const retrievalLatency = Date.now() - retrievalStartTime;
    chatLogger.debug('Retrieved memories', { count: memories.length, latencyMs: retrievalLatency });

    // Record retrieval for debug
    intelligenceDebugService.recordRetrieval(characterId, userId, chatId, {
      query: userMessage,
      results: memories.map((m) => ({
        id: m.id,
        content: m.content,
        type: m.type,
        score: m.score ?? 0,
        similarity: m.similarity ?? 0,
        importance: m.importanceScore ?? 0.5,
        recency: m.recencyScore ?? 0.5,
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

    // Inject world info: EMTop position
    if (worldInfo?.EMTop) {
      parts.push(worldInfo.EMTop);
    }

    // Get current emotion
    const emotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);
    if (emotion) {
      parts.push(`\n## 当前情感状态`);
      parts.push(
        `当前情感: ${emotion.label}, Valence: ${emotion.valence.toFixed(2)}, Arousal: ${emotion.arousal.toFixed(2)}`
      );

      // Emotion-specific behavior guidelines
      const emotionGuidelines: Record<string, string> = {
        angry: '回复更简短直接，可能提及不满的原因，语气较冲',
        sad: '语气低沉，可能回忆过去的事情，表达需要安慰',
        happy: '语气轻快积极，乐于分享和交流，可能开玩笑',
        excited: '语气热情高涨，说话可能更快更多，充满活力',
        loving: '语气温柔亲密，表达关心和爱意，用词更柔和',
        calm: '语气平和稳定，回复从容不迫，思路清晰',
        curious: '多提问，表现出对话题的兴趣，积极探索',
        surprised: '表达惊讶，可能追问细节，语气中带有意外感',
        confused: '表达困惑，可能请求澄清，语气不确定',
        bored: '回复较简短，缺乏热情，可能试图转换话题',
        fearful: '语气紧张不安，可能表达担忧，寻求安全感',
        disgusted: '表达反感，可能回避某些话题，语气中带有排斥',
      };

      const guideline = emotionGuidelines[emotion.label];
      if (guideline) {
        parts.push(`情感表现指引: ${guideline}`);
      }
    }

    // Inject world info: EMBottom position
    if (worldInfo?.EMBottom) {
      parts.push(worldInfo.EMBottom);
    }

    // Inject world info: ANTop position
    if (worldInfo?.ANTop) {
      parts.push(worldInfo.ANTop);
    }

    // Behavior guidelines
    parts.push('\n## 行为指引');
    parts.push('- 根据记忆中的信息个性化回复');
    parts.push('- 保持情感状态的一致性，情感变化应自然过渡');
    parts.push('- 可以主动提及相关记忆，但不要生硬');
    parts.push('Stay in character at all times.');

    // Inject world info: ANBottom position
    if (worldInfo?.ANBottom) {
      parts.push(worldInfo.ANBottom);
    }

    // Inject world info: after position
    if (worldInfo?.after) {
      parts.push(worldInfo.after);
    }

    // Collect atDepth entries (world info + post_history_instructions)
    const atDepthEntries: Array<{ depth: number; content: string }> = [
      ...(worldInfo?.atDepth ?? []),
    ];

    // post_history_instructions: inject at depth in chat history (like SillyTavern's jailbreak/PHI)
    if (cardData.post_history_instructions) {
      const phi = applyMacros(cardData.post_history_instructions);
      // Default depth 1 = just before the last message. Can be overridden via extensions.depth_prompt
      const phiDepth = (character.cardData as any)?.extensions?.depth_prompt?.depth ?? 1;
      atDepthEntries.push({ depth: phiDepth, content: phi });
    }

    const fullPrompt = parts.join('\n');
    const promptBuildLatency = Date.now() - promptStartTime;

    // Record prompt build latency
    intelligenceDebugService.recordLatency(characterId, userId, chatId, 'promptBuildLatency', promptBuildLatency);

    // Emit WebSocket event for prompt build
    websocketService.emitPromptBuild(
      chatId,
      estimateTokens(fullPrompt),
      memories.length,
      !!emotion,
      promptBuildLatency
    );

    return {
      systemPrompt: fullPrompt,
      atDepthEntries,
    };
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

    // Extract memories every 5 messages (batch extraction to reduce LLM cost)
    if (count >= 5) {
      this.messageCounters.set(key, 0);
      const recentMessages = messages.slice(-2); // Get last 2 messages (user + assistant)
      const extracted = await memoryService.extractMemories(characterId, userId, recentMessages);

      // Memory-emotion interaction: boost importance based on current arousal
      // High arousal moments create stronger memories
      const currentEmotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);
      const arousalBoost = currentEmotion
        ? Math.abs(currentEmotion.arousal - 0.3) // Distance from neutral arousal
        : 0;

      for (const memory of extracted) {
        // Apply arousal-based importance boost: importance *= (1 + |arousal - 0.3|)
        if (arousalBoost > 0) {
          memory.importance = Math.min(1, memory.importance * (1 + arousalBoost));
        }
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
   * Parse SillyTavern-format example messages into a formatted dialogue block.
   *
   * Handles:
   * - Splitting by <START> tags into separate example conversations
   * - Replacing {{char}} with the actual character name
   * - Replacing {{user}} with "User"
   * - Lines without a speaker prefix are treated as continuation of the previous speaker
   * - Empty/whitespace-only input returns empty string
   * - Input without <START> tags is treated as a single example block
   */
  private parseExampleMessages(mesExample: string, charName: string, userName = 'User'): string {
    if (!mesExample || !mesExample.trim()) {
      return '';
    }

    // Split by <START> tags (case-insensitive, with optional surrounding whitespace)
    const blocks = mesExample.split(/<START>/i)
      .map(block => block.trim())
      .filter(block => block.length > 0);

    if (blocks.length === 0) {
      return '';
    }

    const formattedBlocks: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const lines = block.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      if (lines.length === 0) {
        continue;
      }

      const formattedLines: string[] = [];

      for (const line of lines) {
        // Replace {{char}} and {{user}} placeholders (case-insensitive)
        let processed = line
          .replace(/\{\{char\}\}/gi, charName)
          .replace(/\{\{user\}\}/gi, userName);

        formattedLines.push(processed);
      }

      if (formattedLines.length > 0) {
        const conversationNumber = formattedBlocks.length + 1;
        formattedBlocks.push(`[Example conversation ${conversationNumber}]\n${formattedLines.join('\n')}`);
      }
    }

    if (formattedBlocks.length === 0) {
      return '';
    }

    return `\n## Example Dialogue\n\n${formattedBlocks.join('\n\n')}`;
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
    chatLogger.debug('Updating emotion', { chatId, messagePreview: messageContent.substring(0, 50) });
    // Get previous emotion state
    const previousEmotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);

    // Analyze and update emotion
    const emotionStartTime = Date.now();
    const result = await emotionService.analyzeAndUpdate({
      characterId,
      userId,
      chatId,
      text: messageContent,
      messageId,
    });
    const emotionLatency = Date.now() - emotionStartTime;

    // Record emotion analysis latency
    intelligenceDebugService.recordLatency(characterId, userId, chatId, 'emotionAnalysisLatency', emotionLatency);

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

/**
 * Extract the selected model from a chat's metadata JSONB.
 * Returns null if no model has been set.
 */
export function getChatModel(chat: Chat): string | null {
  const metadata = chat.metadata as Record<string, unknown>;
  return typeof metadata?.model === 'string' ? metadata.model : null;
}
