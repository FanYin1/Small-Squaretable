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
import { getPromptLayout, type PromptLayout } from './prompt-layout';
import {
  assemblePrompt,
  buildCardAtDepthEntries,
  buildCardParts,
  buildDefaultPromptParts,
  buildEmotionParts,
  buildMemoryParts,
  buildPromptSections,
  formatExampleMessages,
  type AtDepthEntry,
} from './prompt-assembly';

/*
 * Prompt 布局（P3-3，环境变量 PROMPT_LAYOUT=legacy|cache_friendly，默认 legacy）
 *
 * 前缀缓存要求相邻两轮请求的开头逐字节相同。legacy 把每轮都变的内容（检索到的记忆、情绪、
 * 关键词触发的世界书）拼进 system prompt，也就是放在历史之前，整段历史于是每轮都失效。
 * cache_friendly 把这些内容抽出来，作为一条 system 消息插在历史末尾（depth 1，复用 atDepthEntries），
 * 其余稳定内容保持在历史之前。
 *
 * 「稳定」= 世界书 constant 且 probability >= 100 的条目，以及角色卡 / 示例对话 / persona / 行为指引。
 * 「变动」= 记忆、情绪、关键词触发或概率抽样的世界书条目。
 *
 * 各内容的落点（括号内是 legacy 下 system prompt 里的先后顺序；变动块内保持同样的相对顺序）：
 *
 * | 内容                           | legacy                    | cache_friendly                            |
 * |--------------------------------|---------------------------|-------------------------------------------|
 * | before 常驻                    | system prompt 最前        | system prompt 最前                        |
 * | before 触发                    | system prompt 最前        | 变动块 第 1 位                            |
 * | 角色卡 / 示例对话              | system prompt             | system prompt（不变）                     |
 * | EMTop、EMBottom 常驻           | 示例对话之后              | 示例对话之后                              |
 * | EMTop、EMBottom 触发           | 示例对话之后              | 变动块，依次在 before 触发之后            |
 * | persona + ANTop 常驻           | 行为指引之前              | 行为指引之前（persona 视为稳定）          |
 * | ANTop 触发                     | 行为指引之前              | 变动块，在 EMBottom 触发之后              |
 * | 行为指引                       | system prompt             | system prompt（不变）                     |
 * | 记忆                           | 行为指引之后、情绪之前    | 变动块，在 ANTop 触发之后                 |
 * | 情绪                           | 记忆之后                  | 变动块，在记忆之后                        |
 * | ANBottom 常驻                  | 情绪之后                  | 行为指引之后（稳定段末尾）                |
 * | ANBottom 触发                  | 情绪之后                  | 变动块，在情绪之后                        |
 * | after 常驻                     | system prompt 最后        | ANBottom 常驻之后（稳定段末尾）           |
 * | after 触发                     | system prompt 最后        | 变动块 最后                               |
 * | atDepth（世界书）              | 按自身 depth              | 按自身 depth（不变）                      |
 * | Author's Note                  | depth 0                   | depth 0（不变）                           |
 * | post_history / depth_prompt    | 按自身 depth              | 按自身 depth（不变）                      |
 * | 变动块                         | -                         | depth 1，一条 system 消息，在世界书 atDepth 之后、Author's Note 之前 |
 *
 * 变动块相对 Author's Note 的顺序：同样插入后，变动块（depth 1）在 Author's Note（depth 0）之前，
 * 即 [历史..., 变动块, 最后一条用户消息, Author's Note]。Author's Note 是作者给的最高优先级指令，
 * 应当离生成点最近；变动块是「事实资料」，放在它之前。
 *
 * 截断：变动块经 atDepthEntries 在 buildContext 截断之后才注入，因此永远不会被截断，被截的始终是
 * 最老的历史。为了不超出上下文窗口，result.reservedTokens 给出变动块的 token 估算，
 * 调用方传给 contextManager.buildContext 的第 4 个参数，从预算中预先扣除。
 */

/**
 * chat_overrides.overrides 是 jsonb（unknown）。提示词拼装只消费字符串字段，
 * 其余类型（数字、嵌套对象、数组）以及非对象的畸形数据一律忽略。
 */
function pickStringOverrides(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

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
  atDepthEntries: AtDepthEntry[];
  /**
   * cache_friendly 下变动块的 token 估算（它不在 systemPrompt 里，buildContext 看不到它）。
   * legacy 或没有变动内容时不出现。
   */
  reservedTokens?: number;
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
    const layout = getPromptLayout();

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
        // overrides 是 jsonb（unknown），且路由只校验为 record；这里只取字符串值参与提示词拼装
        const stringOverrides = pickStringOverrides(override.overrides);
        chatLogger.debug('Applying chat parameter overrides', {
          chatId,
          overrideKeys: Object.keys(stringOverrides)
        });
        // Merge overrides into cardData
        cardData = { ...cardData, ...stringOverrides };
      }
    } catch (error) {
      chatLogger.warn('Failed to fetch chat overrides, using default parameters', {
        chatId,
        error
      });
    }

    // Build default system prompt parts (used as {{original}} replacement)
    const defaultPromptParts = buildDefaultPromptParts(character.name, character.description, cardData);

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

    // Support {{original}} placeholder - replaces with the default system prompt
    // (handled by applyMacros via macroCtx.original); without it, default parts come first
    const cardParts = buildCardParts(defaultPromptParts, cardData.system_prompt, (p) => applyMacros(p, macroCtx));

    // Example dialogue
    const exampleParts: string[] = [];
    if (cardData.mes_example) {
      const exampleBlock = this.parseExampleMessages(cardData.mes_example, character.name, userName, macroCtx);
      if (exampleBlock) {
        exampleParts.push(exampleBlock);
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
    // legacy: 并入合并后的 ANTop（与改动前逐字一致）；cache_friendly: persona 跨轮不变，单独作为稳定段
    let personaStableBlock = '';
    if (personaDescription) {
      const personaWorldInfo = `[User Persona: ${userName}]\n${personaDescription}`;
      if (layout === 'cache_friendly') {
        personaStableBlock = personaWorldInfo;
      } else if (!worldInfo) {
        worldInfo = {
          before: '',
          EMTop: '',
          EMBottom: '',
          ANTop: personaWorldInfo,
          ANBottom: '',
          atDepth: [],
          after: '',
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

    const memoryParts = buildMemoryParts(memories);

    // Get current emotion
    const emotion = await emotionService.getCurrentEmotion(characterId, userId, chatId);
    const emotionParts = buildEmotionParts(emotion);

    // 各段顺序与落点见文件顶部的位置表；顺序定义在 prompt-assembly（离线对比脚本共用）
    const sections = buildPromptSections({
      layout,
      worldInfo,
      personaStableBlock,
      cardParts,
      exampleParts,
      memoryParts,
      emotionParts,
    });

    // atDepth 条目：世界书 atDepth 在前；Author's Note / post_history_instructions / depth_prompt 在后
    const atDepthLeading: AtDepthEntry[] = [...(worldInfo?.atDepth ?? [])];
    const atDepthTrailing = buildCardAtDepthEntries(
      {
        character_author_note: cardData.character_author_note,
        post_history_instructions: cardData.post_history_instructions,
        // depth_prompt 取自角色卡原始数据，不受 chat 级覆盖影响（与改动前一致）
        extensions: (character.cardData as any)?.extensions,
      },
      (text) => applyMacros(text, macroCtx)
    );

    const { systemPrompt: fullPrompt, atDepthEntries, dynamicBlock } = assemblePrompt({
      layout,
      sections,
      atDepthLeading,
      atDepthTrailing,
    });
    // 变动块不在 systemPrompt 里，指标里要把它算进去，保持与 legacy 可比
    const promptForMetrics = dynamicBlock ? `${fullPrompt}\n${dynamicBlock}` : fullPrompt;
    const promptBuildLatency = Date.now() - promptStartTime;

    // Record prompt build latency
    intelligenceDebugService.recordLatency(characterId, userId, chatId, 'promptBuildLatency', promptBuildLatency);

    // Emit WebSocket event for prompt build
    websocketService.emitPromptBuild(
      chatId,
      estimateTokens(promptForMetrics),
      memories.length,
      !!emotion,
      promptBuildLatency
    );

    // Persist any variable mutations from macro expansion
    await persistVarWrites(macroCtx, chatId, userId);

    return {
      systemPrompt: fullPrompt,
      atDepthEntries,
      // 只在 cache_friendly 且确有变动内容时出现；legacy 的返回值与改动前完全一致
      ...(dynamicBlock ? { reservedTokens: estimateTokens(dynamicBlock) } : {}),
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
    return formatExampleMessages(mesExample, (line) =>
      // Apply full macro replacement if context available, otherwise just char/user
      macroCtx
        ? applyMacros(line, macroCtx)
        : line.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, userName)
    );
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
