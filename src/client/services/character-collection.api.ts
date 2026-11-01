/**
 * Character Collection API
 */

import { api } from './api';
import { transformCharacter } from './character.api';
import type { CharacterCollection, Character } from '@client/types';

export interface CreateCollectionRequest {
  name: string;
  description?: string;
  color?: string;
  isPublic?: boolean;
}

export interface UpdateCollectionRequest {
  name?: string;
  description?: string;
  color?: string;
  isPublic?: boolean;
}

export const characterCollectionApi = {
  getCollections: () =>
    api.get<CharacterCollection[]>('/character-collections'),

  createCollection: (data: CreateCollectionRequest) =>
    api.post<CharacterCollection>('/character-collections', data),

  updateCollection: (id: string, data: UpdateCollectionRequest) =>
    api.patch<CharacterCollection>(`/character-collections/${id}`, data),

  deleteCollection: (id: string) =>
    api.delete(`/character-collections/${id}`),

  addCharacters: (collectionId: string, characterIds: string[]) =>
    api.post(`/character-collections/${collectionId}/characters`, { characterIds }),

  removeCharacter: (collectionId: string, characterId: string) =>
    api.delete(`/character-collections/${collectionId}/characters/${characterId}`),

  getCollectionCharacters: async (collectionId: string, options?: Pick<RequestInit, 'signal'>) => {
    const items = await api.get<Parameters<typeof transformCharacter>[0][]>(`/character-collections/${collectionId}/characters?view=summary`, options);
    return items.map(transformCharacter);
  },

  getPublicCollections: (userId: string) =>
    api.get<CharacterCollection[]>(`/character-collections/public/${userId}`),

  getPublicCollectionCharacters: (userId: string, collectionId: string) =>
    api.get<Character[]>(`/character-collections/public/${userId}/${collectionId}/characters`),
};
