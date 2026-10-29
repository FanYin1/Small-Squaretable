import { api } from './api';
import type { StoryStateView, StoryEventView, StoryNoteInput } from '../../types/story-state';
import type { StoryMemoryView } from '../../types/story-memory';
import type { StoryBranchInput, StoryBranchPreview, StoryBranchInfo, StoryReadingInput, StoryReading } from '../../types/story-corrections';

export const storyApi = {
  branches: (chatId: string) => api.get<Array<{ id: string; title: string | null; branch: StoryBranchInfo | null }>>(`/chats/${chatId}/story-branches`),
  previewBranch: (chatId: string, input: StoryBranchInput) => api.post<StoryBranchPreview>(`/chats/${chatId}/story-branches/preview`, input),
  createBranch: (chatId: string, input: StoryBranchInput, previewDigest: string) => api.post<{ chatId: string; created: boolean }>(`/chats/${chatId}/story-branches`, { input, previewDigest }),
  readings: (chatId: string) => api.get<StoryReading[]>(`/chats/${chatId}/story-readings`),
  saveReading: (chatId: string, input: StoryReadingInput) => api.post<StoryReading>(`/chats/${chatId}/story-readings`, input),
  removeReading: (chatId: string, id: string) => api.delete(`/chats/${chatId}/story-readings/${id}`),
  memory: (chatId: string, before?: string) => api.get<StoryMemoryView>(`/chats/${chatId}/story-memory${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  state: (chatId: string) => api.get<StoryStateView>(`/chats/${chatId}/story-state`),
  event: (chatId: string, eventId: string) => api.get<StoryEventView>(`/chats/${chatId}/story-events/${eventId}`),
  events: (chatId: string, beforeVersion?: number) => api.get<StoryEventView[]>(`/chats/${chatId}/story-events${beforeVersion == null ? '' : `?beforeVersion=${beforeVersion}`}`),
  addNote: (chatId: string, note: StoryNoteInput) => api.post(`/chats/${chatId}/story-notes`, note),
  removeNote: (chatId: string, noteId: string) => api.delete(`/chats/${chatId}/story-notes/${noteId}`),
};
