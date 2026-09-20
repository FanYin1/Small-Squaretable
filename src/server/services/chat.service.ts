/**
 * 聊天服务
 *
 * 处理聊天的 CRUD 操作和消息管理
 */

import { chatRepository } from '../../db/repositories/chat.repository';
import { messageRepository } from '../../db/repositories/message.repository';
import { userPersonaRepository } from '../../db/repositories/user-persona.repository';
import { chatOverrideRepository } from '../../db/repositories/chat-override.repository';
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
import { applyMacros, createMacroContextWithVars, persistVarWrites, type MacroContext } from './macro.service';

export interface EnhancedPromptParams {
  character: Character;
  characterId: string;
  userId: string;
  userName?: string;
  personaId?: string;
  chatId: string;
  userMessage: string;
  messages?: Array<{ role: string; content: string }>;
  maxContext?: number;
}

export interface EnhancedPromptResult {
  systemPrompt: string;
  atDepthEntries: Array<{ depth: number; content: string; role: 'system' | 'user' | 'assistant' }>;
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
    updates: { content?: string; pinned?: boolean; importance?: number },
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

    const updated = await this.messageRepo.update(messageId, updates);
    if (!updated) {
      throw new NotFoundError('Message');
    }

    chatLogger.debug('Message updated', {
      messageId,
      chatId,
      updates: Object.keys(updates),
    });

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
      n: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
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

    // Fetch persona if personaId is provided
    let userName = params.userName || 'User';
    let personaDescription: string | null = null;

    if (params.personaId) {
      try {
        const persona = await userPersonaRepository.findById(params.personaId);
        if (persona && persona.userId === userId) {
          userName = persona.name;
          personaDescription = persona.description || null;
          chatLogger.debug('Using persona', { personaId: params.personaId, personaName: userName });
        }
      } catch (error) {
        chatLogger.warn('Failed to fetch persona, using default userName', {
          personaId: params.personaId,
          error
        });
      }
    }

    // Base character prompt
    let cardData = (character.cardData as Record<string, string>) || {};

    // Apply chat-level parameter overrides
    try {
      const override = await chatOverrideRepository.findByChatId(chatId);
      if (override && override.enabled) {
        chatLogger.debug('Applying chat parameter overrides', {
          chatId,
          overrideKeys: Object.keys(override.overrides)
        });
        // Merge overrides into cardData
        cardData = { ...cardData, ...override.overrides };
      }
    } catch (error) {
      chatLogger.warn('Failed to fetch chat overrides, using default parameters', {
        chatId,
        error
      });
    }

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

    // Apply {{char}} and {{user}} macro substitution (with pre-loaded variables)
    const macroCtx = await createMacroContextWithVars(
      {
        charName: character.name,
        userName,
        input: userMessage,
        original: defaultPromptParts.join('\n'),
        personality: cardData.personality || '',
        scenario: cardData.scenario || '',
        description: character.description || '',
        mesExamples: cardData.mes_example || '',
        messages: params.messages as Array<{ role: string; content: string }>,
      },
      chatId,
      userId,
    );

    if (cardData.system_prompt) {
      let systemPrompt = cardData.system_prompt;
      // Support {{original}} placeholder - replaces with the default system prompt
      // (handled by applyMacros via macroCtx.original)
      if (!/\{\{original\}\}/i.test(systemPrompt)) {
        // No {{original}}, prepend default parts then append system_prompt
        parts.push(...defaultPromptParts.map(p => applyMacros(p, macroCtx)));
      }
      parts.push(applyMacros(systemPrompt, macroCtx));
    } else {
      parts.push(...defaultPromptParts.map(p => applyMacros(p, macroCtx)));
    }

    // Example dialogue
    if (cardData.mes_example) {
      const exampleBlock = this.parseExampleMessages(cardData.mes_example, character.name, userName, macroCtx);
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
          macroCtx,
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

    // Inject persona description as world info (at AN position, depth 0)
    if (personaDescription) {
      const personaWorldInfo = `[User Persona: ${userName}]\n${personaDescription}`;
      if (!worldInfo) {
        worldInfo = {
          before: '',
          EMTop: '',
          EMBottom: '',
          ANTop: personaWorldInfo,
          ANBottom: '',
          atDepth: [],
          after: '',
          debugInfo: null,
        };
      } else {
        // Prepend to ANTop if it exists, otherwise set it
        worldInfo.ANTop = personaWorldInfo + (worldInfo.ANTop ? '\n\n' + worldInfo.ANTop : '');
      }
      chatLogger.debug('Injected persona description into world info', {
        personaName: userName,
        descriptionLength: personaDescription.length
      });
    }

    // Inject world info: before position
    if (worldInfo?.before) {
      parts.unshift(worldInfo.before);
    }

    // Inject world info: EMTop position
    if (worldInfo?.EMTop) {
      parts.push(worldInfo.EMTop);
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


    // Inject world info: ANBottom position
    if (worldInfo?.ANBottom) {
      parts.push(worldInfo.ANBottom);
    }

    // Inject world info: after position
    if (worldInfo?.after) {
      parts.push(worldInfo.after);
    }

    // Collect atDepth entries (world info + post_history_instructions + character_author_note)
    const roleMap = { 0: 'system', 1: 'user', 2: 'assistant' } as const;
    const atDepthEntries: Array<{ depth: number; content: string; role: 'system' | 'user' | 'assistant' }> = [
      ...(worldInfo?.atDepth ?? []),
    ];

    // Character Author's Note: inject at depth 0 (highest priority, before last user message)
    if (cardData.character_author_note) {
      const authorNote = applyMacros(cardData.character_author_note, macroCtx);
      atDepthEntries.push({ depth: 0, content: authorNote, role: 'system' });
      chatLogger.debug('Added character author note at depth 0', {
        characterId,
        noteLength: authorNote.length
      });
    }

    // post_history_instructions: inject at depth in chat history (like SillyTavern's jailbreak/PHI)
    if (cardData.post_history_instructions) {
      const phi = applyMacros(cardData.post_history_instructions, macroCtx);
      // Default depth 1 = just before the last message. Can be overridden via extensions.depth_prompt
      const phiDepth = (character.cardData as any)?.extensions?.depth_prompt?.depth ?? 1;
      atDepthEntries.push({ depth: phiDepth, content: phi, role: 'system' });
    }

    // depth_prompt: separate prompt content from extensions.depth_prompt
    const depthPromptExt = (character.cardData as any)?.extensions?.depth_prompt;
    if (depthPromptExt?.prompt) {
      const dpContent = applyMacros(depthPromptExt.prompt, macroCtx);
      const dpDepth = depthPromptExt.depth ?? 4;
      const dpRole = roleMap[depthPromptExt.role as 0 | 1 | 2] ?? 'system';
      atDepthEntries.push({ depth: dpDepth, content: dpContent, role: dpRole });
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

    // Persist any variable mutations from macro expansion
    await persistVarWrites(macroCtx, chatId, userId);

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
  private parseExampleMessages(mesExample: string, charName: string, userName = 'User', macroCtx?: MacroContext): string {
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
        // Apply full macro replacement if context available, otherwise just char/user
        let processed = macroCtx
          ? applyMacros(line, macroCtx)
          : line.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, userName);

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
