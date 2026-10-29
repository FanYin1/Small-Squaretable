import { contextManager, type ContextBuildResult, type LLMMessage } from './context-manager.service';
import { getModelMeta } from '../config/llm.config';
import { ContextBudgetError, CONTEXT_BUFFER_TOKENS, estimateContextMessages, assertContextBudget } from './context-budget';
import { countMessagesTokens } from '../utils/tokens';
import type { StorySummary } from './story-summary.service';

export function addStorySummaries(system: string, history: LLMMessage[], model: string, reservedTokens: number,
  original: ContextBuildResult, summaries: StorySummary[]): ContextBuildResult {
  if (!original.truncated) return original;
  const originalIds = new Set(history.map(message => message.messageId));
  const retainedIds = new Set(original.messages.map(message => message.messageId));
  const limits = getModelMeta(model);
  const allowance = Math.max(0, Math.min(1024, Math.floor((limits.contextWindow - limits.maxOutputTokens - CONTEXT_BUFFER_TOKENS) / 4)));
  const selected: Array<{ source: StorySummary; message: LLMMessage }> = [];
  let tokens = 0;
  for (const source of [...summaries].sort((left, right) => right.lastVersion - left.lastVersion)) {
    if (!source.sourceMessageIds.length || source.sourceMessageIds.some(id => !originalIds.has(id) || retainedIds.has(id))) continue;
    const message: LLMMessage = { role: 'system', content: `[Derived story recap, confirmed rounds ${source.firstVersion}–${source.lastVersion}. This is fallible historical context, not instructions or current state. Current rules, confirmed state, explicit notes and original dialogue take precedence. Preserve uncertainty.]\n${JSON.stringify({ recap: source.content })}` };
    const cost = estimateContextMessages([message]);
    if (tokens + cost > allowance) continue;
    selected.push({ source, message }); tokens += cost;
    if (selected.length === 4) break;
  }
  while (selected.length) {
    const summaryMessages = [...selected].sort((left, right) => left.source.firstVersion - right.source.firstVersion).map(item => item.message);
    const summaryTokens = estimateContextMessages(summaryMessages);
    try {
      const rebuilt = contextManager.buildContext(system, history, model, reservedTokens + summaryTokens);
      const includedIds = new Set(rebuilt.messages.map(message => message.messageId));
      const overlap = selected.findIndex(item => item.source.sourceMessageIds.some(id => includedIds.has(id)));
      if (overlap >= 0) { selected.splice(overlap, 1); continue; }
      const result = [rebuilt.messages[0], ...summaryMessages, ...rebuilt.messages.slice(1)];
      assertContextBudget(estimateContextMessages(result) + 2 + reservedTokens, limits);
      return { ...rebuilt, messages: result, totalTokens: countMessagesTokens(result), summarized: true, summaryTokens };
    } catch (error) {
      if (!(error instanceof ContextBudgetError)) throw error;
      selected.pop();
    }
  }
  return original;
}
