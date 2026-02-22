import { chatCharacterRepository } from '../../db/repositories/chat-character.repository';
import { logger } from './logger.service';

const groupLogger = logger.child({ module: 'group-chat' });

export type TurnStrategy = 'round_robin' | 'all' | 'random';

export class GroupChatService {
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
    const ids = await chatCharacterRepository.getCharacterIds(chatId);
    return ids.length > 1;
  }

  async getChatCharacters(chatId: string) {
    return chatCharacterRepository.getCharacters(chatId);
  }

  async addCharacter(chatId: string, characterId: string, sortOrder = 0) {
    return chatCharacterRepository.addCharacter(chatId, characterId, sortOrder);
  }

  async removeCharacter(chatId: string, characterId: string) {
    return chatCharacterRepository.removeCharacter(chatId, characterId);
  }
}

export const groupChatService = new GroupChatService();
