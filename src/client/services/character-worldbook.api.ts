import { api } from './api';
import type { CharacterWorldbookBindings } from '../../types/character-worldbook-bindings';

export const characterWorldbookApi = {
  list: (characterId: string) => api.get<CharacterWorldbookBindings>(`/characters/${characterId}/worldbooks`),
  change: (characterId: string, bookId: string, action: 'bind' | 'unbind', expectedCharacterId: string | null) =>
    api.put(`/characters/${characterId}/worldbooks/${bookId}`, { action, expectedCharacterId }),
};
