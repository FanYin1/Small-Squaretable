import { chatCharacterRepository } from '../../db/repositories/chat-character.repository';
import { chatRepository } from '../../db/repositories/chat.repository';
import { db } from '../../db';
import { chats } from '../../db/schema/chats';
import { eq } from 'drizzle-orm';
import { logger } from './logger.service';
import { cacheService } from './cache.service';

const groupLogger = logger.child({ module: 'group-chat' });

export type TurnStrategy = 'round_robin' | 'all' | 'random';

const GROUP_CACHE_TTL = 60; // 60 seconds

export class GroupChatService {
  private groupCacheKey(chatId: string): string {
    return `api:groupchat:${chatId}`;
  }

  async selectRespondents(
    chatId: string,
    strategy: TurnStrategy = 'round_robin',
    lastResponderId?: string
  ): Promise<string[]> {
    const characterIds = await chatCharacterRepository.getCharacterIds(chatId);
    if (characterIds.length === 0) return [];
    if (characterIds.length === 1) return characterIds;

    switch (strategy) {
      case 'all':
        return characterIds;
      case 'random': {
        const idx = Math.floor(Math.random() * characterIds.length);
        return [characterIds[idx]];
      }
      case 'round_robin':
      default: {
        if (!lastResponderId) return [characterIds[0]];
        const lastIdx = characterIds.indexOf(lastResponderId);
        const nextIdx = (lastIdx + 1) % characterIds.length;
        return [characterIds[nextIdx]];
      }
    }
  }

  async isGroupChat(chatId: string): Promise<boolean> {
    const cached = await cacheService.get<{ isGroup: boolean; strategy: TurnStrategy }>(this.groupCacheKey(chatId));
    if (cached !== null) return cached.isGroup;

    const ids = await chatCharacterRepository.getCharacterIds(chatId);
    const isGroup = ids.length > 1;

    // Fetch strategy at the same time to cache together
    const chat = await chatRepository.findById(chatId);
    const meta = (chat?.metadata as Record<string, unknown>) || {};
    const strategy = (meta.groupStrategy as TurnStrategy) || 'round_robin';

    await cacheService.set(this.groupCacheKey(chatId), { isGroup, strategy }, GROUP_CACHE_TTL);
    return isGroup;
  }

  async getChatCharacters(chatId: string) {
    return chatCharacterRepository.getCharacters(chatId);
  }

  async addCharacter(chatId: string, characterId: string, sortOrder = 0) {
    const result = await chatCharacterRepository.addCharacter(chatId, characterId, sortOrder);
    await this.invalidateCache(chatId);
    return result;
  }

  async removeCharacter(chatId: string, characterId: string) {
    const result = await chatCharacterRepository.removeCharacter(chatId, characterId);
    await this.invalidateCache(chatId);
    return result;
  }

  async getStrategy(chatId: string): Promise<TurnStrategy> {
    const cached = await cacheService.get<{ isGroup: boolean; strategy: TurnStrategy }>(this.groupCacheKey(chatId));
    if (cached !== null) return cached.strategy;

    const chat = await chatRepository.findById(chatId);
    const meta = (chat?.metadata as Record<string, unknown>) || {};
    return (meta.groupStrategy as TurnStrategy) || 'round_robin';
  }

  async setStrategy(chatId: string, strategy: TurnStrategy): Promise<void> {
    const chat = await chatRepository.findById(chatId);
    if (!chat) return;
    const meta = (chat.metadata as Record<string, unknown>) || {};
    await db.update(chats).set({
      metadata: { ...meta, groupStrategy: strategy },
    }).where(eq(chats.id, chatId));
    await this.invalidateCache(chatId);
  }

  private async invalidateCache(chatId: string): Promise<void> {
    await cacheService.delete(this.groupCacheKey(chatId));
  }
}

export const groupChatService = new GroupChatService();
