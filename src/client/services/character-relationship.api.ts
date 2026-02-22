/**
 * Character Relationship API
 *
 * CRUD operations for character relationships
 */

import { api } from './api';

export interface CharacterRelationship {
  id: string;
  userId: string;
  characterId: string;
  targetCharacterId?: string;
  type: string;
  affinity: string; // decimal comes as string from backend
  label?: string;
  description?: string;
  interactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRelationshipRequest {
  characterId: string;
  targetCharacterId?: string;
  type: 'friend' | 'rival' | 'mentor' | 'student' | 'lover' | 'family' | 'acquaintance';
  affinity?: number;
  label?: string;
  description?: string;
}

export interface UpdateRelationshipRequest {
  type?: string;
  affinity?: number;
  label?: string | null;
  description?: string | null;
}

export const characterRelationshipApi = {
  getRelationships: (characterId: string) =>
    api.get<CharacterRelationship[]>(`/character-relationships?characterId=${characterId}`),

  createRelationship: (data: CreateRelationshipRequest) =>
    api.post<CharacterRelationship>('/character-relationships', data),

  updateRelationship: (id: string, data: UpdateRelationshipRequest) =>
    api.patch<CharacterRelationship>(`/character-relationships/${id}`, data),

  deleteRelationship: (id: string) =>
    api.delete(`/character-relationships/${id}`),
};
