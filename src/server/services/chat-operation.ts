/** Shared by the HTTP model picker and WebSocket generation in this server process. */
const operations = new Map<string, symbol>();
export function acquireChatOperation(chatId: string): (() => void) | null {
  if (operations.has(chatId)) return null;
  const token = Symbol(chatId);
  operations.set(chatId, token);
  return () => { if (operations.get(chatId) === token) operations.delete(chatId); };
}
