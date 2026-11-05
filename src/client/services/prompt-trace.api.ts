import { api } from './api';
import type { PromptTraceList } from '../../types/prompt-trace';
export const promptTraceApi = {
  list: (chatId: string) => api.get<PromptTraceList>(`/chats/${chatId}/prompt-traces`),
};
