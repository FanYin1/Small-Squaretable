/**
 * Character Growth API
 *
 * Endpoints for character growth data and milestones
 */

import { api } from './api';

export interface CharacterGrowthData {
  id: string;
  characterId: string;
  userId: string;
  level: number;
  experience: number;
  totalMessages: number;
  totalChats: number;
  milestones: Array<{ level: number; name: string; label: string; achievedAt?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneInfo {
  level: number;
  name: string;
  label: string;
  achieved: boolean;
  achievedAt?: string;
}

export const characterGrowthApi = {
  getGrowth: (characterId: string) =>
    api.get<CharacterGrowthData>(`/character-growth?characterId=${characterId}`),

  getMilestones: (characterId: string) =>
    api.get<MilestoneInfo[]>(`/character-growth/milestones?characterId=${characterId}`),
};
