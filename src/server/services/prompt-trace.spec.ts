import { describe, expect, it } from 'vitest';
import { buildPromptTrace, summarizePromptAssembly } from './prompt-trace';
import { injectAtDepth } from './prompt-assembly';
import type { LLMMessage } from './context-manager.service';
import type { WorldInfoDebugInfo } from './worldinfo-engine.service';
import { estimateContextMessages, estimateContextTokens } from './context-budget';

const transport = { outputTokens: 1000, adapter: 'openai_chat' as const, bodyBytes: 23, bodySha256: 'a'.repeat(64) };
const defaults = { userMessageId: 2, model: 'fixture', template: 'default', transport,
  snapshots: { content: 1, worldbook: 1, identityRevision: null }, limits: { contextWindow: 10000, maxOutputTokens: 1000 },
  depthReservedTokens: 50, sourceProjectionApplied: false };

describe('actual prompt metadata', () => {
  it('records actual order and omitted history without storing content, including equal-depth injections', () => {
    const history: LLMMessage[] = [{ role: 'user', content: 'PRIVATE_OLD', messageId: 1 }, { role: 'user', content: 'PRIVATE_INPUT', messageId: 2 }];
    const entries = [{ depth: 0, role: 'system' as const, content: 'PRIVATE_STATE' }, { depth: 0, role: 'system' as const, content: 'PRIVATE_NOTE' }];
    const injected = new Map<object, { depth: number; source: string }>();
    const final = injectAtDepth([{ role: 'system' as const, content: 'PRIVATE_RULE' }, history[1]], entries,
      (message, entry) => { injected.set(message, { depth: entry.depth, source: entry === entries[0] ? 'state' : 'note' }); });
    const trace = buildPromptTrace({ ...defaults, history, injected, context: { messages: final, totalTokens: 0, truncated: true, truncatedCount: 1 } });
    expect(trace.history).toMatchObject({ supplied: 2, retained: 1, omitted: 1, retainedIds: [2], omittedIds: [1] });
    expect(trace.messages.map(message => message.source)).toEqual(['assembled_system', 'history', 'state', 'note']);
    expect(trace.budget.estimatedInputTokens).toBe(estimateContextMessages(final) + 2);
    expect(JSON.stringify(trace)).not.toContain('PRIVATE_');
    expect(final.map(message => message.content)).toEqual(['PRIVATE_RULE', 'PRIVATE_INPUT', 'PRIVATE_STATE', 'PRIVATE_NOTE']);
  });

  it('uses formatted template input and effective limits without double-counting reservations', () => {
    const formattedPrompt = '<start>剧情模板<end>';
    const trace = buildPromptTrace({ ...defaults, formattedPrompt, template: 'chatml', history: [], injected: new Map(),
      limits: { contextWindow: 10000, maxInputTokens: 8000, maxOutputTokens: 500 },
      context: { messages: [], totalTokens: 0, truncated: false, truncatedCount: 0 } });
    expect(trace.budget).toMatchObject({ outputTokens: 500, estimatedInputTokens: estimateContextTokens(formattedPrompt), availableInputTokens: 7900 });
  });

  it('caps diagnostic detail without changing full message counts and token estimate', () => {
    const messages: LLMMessage[] = Array.from({ length: 220 }, (_, index) => ({ role: 'user', content: 'secret', messageId: index }));
    const trace = buildPromptTrace({ ...defaults, history: messages, injected: new Map(),
      context: { messages, totalTokens: 0, truncated: false, truncatedCount: 0 } });
    expect(trace.messages).toHaveLength(200); expect(trace.omittedMessageDetails).toBe(20);
    expect(trace.history.retained).toBe(220); expect(trace.history.retainedIds).toHaveLength(200);
    expect(trace.budget.estimatedInputTokens).toBe(estimateContextMessages(messages) + 2);
  });

  it('captures decisions once and strips keywords, raw text, and memory contents', () => {
    const worldInfo: WorldInfoDebugInfo = { scannedEntries: 2, activatedCount: 1, budgetUsed: 8, budgetLimit: 100, scanTimeMs: 1,
      matches: [{ entryId: 'a', keyword: 'PRIVATE_KEY' }], skippedByProbability: 1, skippedByDelay: 0,
      decisions: [{ entryId: 'a', status: 'injected', reason: 'included_in_prompt', keyword: 'PRIVATE_KEY' },
        { entryId: 'b', status: 'excluded', reason: 'probability_check_failed' }], scanMessageCount: 10,
      maxRecursionDepth: 3, budgetUnit: 'estimated_tokens', scanEngineVersion: 2, constantBudgetOverflow: false };
    const result = summarizePromptAssembly({ layout: 'cache_friendly', sections: [{ source: 'memories', parts: ['PRIVATE_MEMORY'], dynamic: true }],
      memoryIds: ['m1'], depthEntries: [], worldInfo, worldbookRevision: 'b'.repeat(64) });
    expect(result.sections[0].placement).toBe('dynamic');
    expect(result.worldbook?.decisions[1].reason).toBe('probability_check_failed');
    expect(result.worldbook?.revision).toBe('b'.repeat(64));
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });
});
