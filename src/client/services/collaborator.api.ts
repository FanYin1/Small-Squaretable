/**
 * Collaborator API
 *
 * Handles character collaboration (invite, list, update role, remove)
 */

import { api } from './api';
import type { CharacterCollaborator } from '@client/types';

export const collaboratorApi = {
  inviteCollaborator: (characterId: string, data: { userId: string; role: 'editor' | 'viewer' }) =>
    api.post<CharacterCollaborator>(`/character-collaborators/characters/${characterId}/collaborators`, data),

  listCollaborators: (characterId: string) =>
    api.get<CharacterCollaborator[]>(`/character-collaborators/characters/${characterId}/collaborators`),

  updateCollaboratorRole: (characterId: string, userId: string, role: 'editor' | 'viewer') =>
    api.patch(`/character-collaborators/characters/${characterId}/collaborators/${userId}`, { role }),

  removeCollaborator: (characterId: string, userId: string) =>
    api.delete(`/character-collaborators/characters/${characterId}/collaborators/${userId}`),
};
