import { describe, expect, it, vi } from 'vitest';
import { addStorySummaries } from './story-summary-context';
import { contextManager, type LLMMessage } from './context-manager.service';
import { estimateContextMessages } from './context-budget';
import type { StorySummary } from './story-summary.service';

vi.mock('../config/llm.config', () => ({ getModelMeta: () => ({ contextWindow: 1200, maxOutputTokens: 200 }) }));
vi.mock('./summarization.service', () => ({ summarizationService: {} }));
const history: LLMMessage[] = Array.from({ length: 50 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user',
  content: '叙述经过并核对约定。'.repeat(6), messageId: index + 1 }));
const summary: StorySummary = { jobId: 'job', firstVersion: 1, lastVersion: 5,
  sourceMessageIds: Array.from({ length: 10 }, (_, index) => index + 1), content: '灯塔会面尚未发生。' };
describe('bounded saved story summaries', () => {
  it('uses omitted sourced history while preserving latest turns, chronology and total capacity', () => {
    const original = contextManager.buildContext('当前状态与约定', history, 'model', 40);
    const result = addStorySummaries('当前状态与约定', history, 'model', 40, original, [summary]);
    expect(result.summarized).toBe(true);
    expect(result.messages[1].content).toContain('灯塔会面尚未发生');
    expect(result.messages[1].content).toContain('Current rules, confirmed state');
    expect(result.messages.at(-1)?.messageId).toBe(50);
    expect(result.messages.at(-2)?.messageId).toBe(49);
    const ids = result.messages.flatMap(message => message.messageId ? [message.messageId] : []);
    expect(ids).toEqual([...ids].sort((left, right) => left - right));
    expect(estimateContextMessages(result.messages) + 2 + 40).toBeLessThanOrEqual(900);
    expect(history).toHaveLength(50);
  });
  it('does not import a recap whose source is absent from the active history or already retained', () => {
    const original = contextManager.buildContext('规则', history, 'model');
    for (const sourceMessageIds of [[999], [49, 50]]) {
      expect(addStorySummaries('规则', history, 'model', 0, original, [{ ...summary, sourceMessageIds }])).toBe(original);
    }
  });
  it('discards oversized optional recaps instead of rejecting an otherwise valid request', () => {
    const original = contextManager.buildContext('规则', history, 'model');
    expect(addStorySummaries('规则', history, 'model', 0, original, [{ ...summary, content: '字'.repeat(1600) }])).toBe(original);
  });
  it('never spends protected latest-turn capacity on a recap', () => {
    const limited = [...history.slice(0, -2), { role: 'user' as const, content: '字'.repeat(530), messageId: 51 }];
    const original = contextManager.buildContext('规则', limited, 'model');
    expect(addStorySummaries('规则', limited, 'model', 0, original, [summary])).toBe(original);
  });
  it('does not summarize when original history fits', () => {
    const short = history.slice(-2);
    const original = contextManager.buildContext('规则', short, 'model');
    expect(addStorySummaries('规则', short, 'model', 0, original, [summary])).toBe(original);
  });
  it('keeps pinned original evidence and excludes its overlapping recap', () => {
    const pinned = history.map(message => ({ ...message, pinned: message.messageId === 1 }));
    const original = contextManager.buildContext('规则', pinned, 'model');
    const result = addStorySummaries('规则', pinned, 'model', 0, original, [summary]);
    expect(result).toBe(original); expect(result.messages.some(message => message.messageId === 1)).toBe(true);
  });
  it('orders selected recaps by confirmed event version regardless of input order', () => {
    const next = { ...summary, jobId: 'later', firstVersion: 6, lastVersion: 10, sourceMessageIds: Array.from({ length: 10 }, (_, index) => index + 11), content: '后续约定。' };
    const original = contextManager.buildContext('规则', history, 'model');
    const result = addStorySummaries('规则', history, 'model', 0, original, [next, summary]);
    expect(result.messages[1].content).toContain('rounds 1–5');
    expect(result.messages[2].content).toContain('rounds 6–10');
  });
});
