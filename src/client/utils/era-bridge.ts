/**
 * ERA Variable Bridge
 *
 * Manages communication between the main page and ERA sandboxed iframes.
 * Fetches chat variables from the server and broadcasts to all registered iframes.
 */

import { ref, type Ref } from 'vue';
import { api } from '@client/services/api';
import { unflattenCardVariables } from './card-sandbox';

export interface EraBridgeState {
  chatId: string | null;
  userId: string | null;
  charName: string;
  userName: string;
  variables: Record<string, string>;
  iframes: Set<HTMLIFrameElement>;
}

const state: EraBridgeState = {
  chatId: null,
  userId: null,
  charName: '',
  userName: '',
  variables: {},
  iframes: new Set(),
};

/** Reactive ref for variable state, usable in Vue components */
export const eraVariables: Ref<Record<string, string>> = ref({});

/**
 * Initialize the bridge for a chat session.
 */
export function initEraBridge(chatId: string, opts?: {
  charName?: string;
  userName?: string;
}): void {
  if (state.chatId !== chatId) updateVariables({});
  state.chatId = chatId;
  state.charName = opts?.charName ?? '';
  state.userName = opts?.userName ?? '';
}

/**
 * Register an iframe to receive ERA variable updates.
 */
export function registerIframe(iframe: HTMLIFrameElement): void {
  state.iframes.add(iframe);
}

/**
 * Unregister an iframe.
 */
export function unregisterIframe(iframe: HTMLIFrameElement): void {
  state.iframes.delete(iframe);
}

/**
 * Fetch current chat variables from the server.
 */
export async function fetchVariables(chatId: string): Promise<Record<string, string>> {
  const data = await api.get<{ variables: Record<string, string> }>(`/chats/${chatId}/variables`);
  return data.variables ?? {};
}

/**
 * Update local variable state and broadcast to all iframes.
 */
export function updateVariables(vars: Record<string, string>): void {
  state.variables = { ...vars };
  eraVariables.value = { ...vars };
  broadcastWriteDone(vars);
}

/**
 * Merge new variables into existing state and broadcast.
 */
export function mergeVariables(updates: Record<string, string>): void {
  Object.assign(state.variables, updates);
  eraVariables.value = { ...state.variables };
  broadcastWriteDone(state.variables);
}

/**
 * Delete variables by key and broadcast.
 */
export function deleteVariables(keys: string[]): void {
  for (const key of keys) {
    delete state.variables[key];
  }
  eraVariables.value = { ...state.variables };
  broadcastWriteDone(state.variables);
}

/**
 * Broadcast era:writeDone to all registered iframes.
 */
function broadcastWriteDone(vars: Record<string, string>): void {
  const stat = unflattenCardVariables(vars);
  const payload = {
    type: 'era-event',
    event: 'era:writeDone',
    payload: {
      statWithoutMeta: stat,
      stat: stat,
      actions: { apply: true, rollback: false, resync: false, api: false, apiWrite: false },
    },
  };

  for (const iframe of state.iframes) {
    try {
      iframe.contentWindow?.postMessage(payload, '*');
    } catch {
      // iframe may have been removed
    }
  }
}

/**
 * Clean up all state. Call when leaving a chat.
 */
export function destroyEraBridge(): void {
  state.chatId = null;
  state.variables = {};
  state.iframes.clear();
  eraVariables.value = {};
}
