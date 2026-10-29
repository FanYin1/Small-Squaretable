import type { StoryStateView } from './story-state';
import type { StoryIdentitySnapshot } from './story-identity';
import type { StoryBranchInfo, StoryReading } from './story-corrections';

export interface StoryReadingExport {
  format: 'small-squaretable.story-reading';
  version: 1;
  scope: {
    purpose: 'player-readable-record';
    restorable: false;
    excluded: string[];
    attachments: 'references-only';
  };
  chat: {
    id: string;
    title: string | null;
    characterId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  identity: Pick<StoryIdentitySnapshot, 'protocol' | 'name' | 'description' | 'source' | 'revision' | 'capturedAt'> | null;
  characters: Array<{ id: string; name: string }>;
  snapshots: {
    contentVersion: number | null;
    worldbookVersion: number | null;
    contentRevision: string | null;
    worldbookRevision: string | null;
  };
  messages: Array<{
    id: number;
    role: 'user' | 'assistant';
    content: string;
    characterId: string | null;
    sentAt: string;
    attachments: unknown;
    stateStatus: 'confirmed' | 'interrupted' | 'proposed' | null;
    storyAudience?: string[];
  }>;
  story: StoryStateView;
  branch?: StoryBranchInfo | null;
  readings?: StoryReading[];
  messageCount: number;
  eventCount: number;
  exportedAt: string;
}
