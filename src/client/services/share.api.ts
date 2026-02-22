/**
 * Share API
 *
 * Handles character sharing links and chat snapshots
 */

import { api } from './api';
import type { ChatSnapshot, Character } from '@client/types';

export const shareApi = {
  // Character share links
  generateShareLink: (characterId: string) =>
    api.post<{ shareToken: string }>(`/characters/${characterId}/share`),

  revokeShareLink: (characterId: string) =>
    api.delete(`/characters/${characterId}/share`),

  getSharedCharacter: (token: string) =>
    api.get<Character>(`/share/character/${token}`),

  // Chat snapshots
  createSnapshot: (chatId: string, data: { title?: string; expiresAt?: string } = {}) =>
    api.post<ChatSnapshot>(`/chats/${chatId}/snapshot`, data),

  listSnapshots: (chatId: string) =>
    api.get<ChatSnapshot[]>(`/chats/${chatId}/snapshots`),

  deleteSnapshot: (snapshotId: string) =>
    api.delete(`/chats/snapshots/${snapshotId}`),

  getSnapshot: (token: string) =>
    api.get<ChatSnapshot>(`/share/snapshot/${token}`),
};
