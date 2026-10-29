/**
 * P3-3：reservedTokens 与「变动块不被截断」
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../config/llm.config', () => ({
  getModelMeta: vi.fn(() => ({ id: 'm', provider: 'test', contextWindow: 1200, maxOutputTokens: 100, defaultTemperature: 0.7 })),
}));
vi.mock('./summarization.service', () => ({ summarizationService: {} }));
vi.mock('./logger.service', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { ContextManager, type LLMMessage } from './context-manager.service';
import { countTokens } from '../utils/tokens';
import { getModelMeta } from '../config/llm.config';
import { ContextBudgetError, estimateContextMessages } from './context-budget';

const manager = new ContextManager();
const capacity = (available: number) => vi.mocked(getModelMeta).mockReturnValue({ id: 'm', provider: 'test',
  contextWindow: available + 200, maxOutputTokens: 100, defaultTemperature: 0.7 });
beforeEach(() => capacity(1000));

function history(count: number): LLMMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `message-${String(i).padStart(2, '0')} ` + 'lorem ipsum dolor sit amet '.repeat(12),
  }));
}

/** 取结果里的历史消息序号（跳过 system prompt 与截断提示） */
function keptIndexes(messages: LLMMessage[]): number[] {
  return messages
    .map((m) => /^message-(\d+)/.exec(m.content)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number);
}

describe('ContextManager reservedTokens (P3-3)', () => {
  const messages = history(20);
  const perMessage = countTokens(messages[0].content) + 4;

  it('is backwards compatible: omitted equals 0', () => {
    expect(manager.buildContext('sys', messages, 'm')).toEqual(manager.buildContext('sys', messages, 'm', 0));
  });

  it('reserving tokens drops the OLDEST history, keeps the newest as a contiguous suffix', () => {
    const base = keptIndexes(manager.buildContext('sys', messages, 'm').messages);
    const reserved = keptIndexes(manager.buildContext('sys', messages, 'm', perMessage * 3).messages);

    expect(base.length).toBeGreaterThan(3); // 保证测试有意义：不加预留时能装下多条
    expect(reserved.length).toBeLessThan(base.length);
    expect(reserved[reserved.length - 1]).toBe(19); // 最新一条始终在
    expect(reserved[0]).toBeGreaterThan(base[0]); // 少掉的是最老的
    reserved.forEach((v, i) => i > 0 && expect(v).toBe(reserved[i - 1] + 1)); // 连续后缀
  });

  it('injected dynamic block (after truncation) is never cut and sits before the last message', () => {
    const block = '## 关于用户的记忆\n【偏好】likes tea';
    const built = manager.buildContext('sys', messages, 'm', countTokens(block) + 4);
    expect(built.truncated).toBe(true);

    const injected = manager.injectAtDepth(built.messages, [{ depth: 1, content: block, role: 'system' }]);

    expect(injected.filter((m) => m.content === block)).toHaveLength(1);
    expect(injected[injected.length - 2].content).toBe(block);
    expect(injected[injected.length - 1].content).toBe(messages[19].content);
    // 系统提示词仍在最前，不被注入块顶替
    expect(injected[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('injectAtDepth keeps legacy semantics: sorted by depth desc, stable for equal depth, never before index 1', () => {
    const base: LLMMessage[] = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ];
    const out = manager.injectAtDepth(base, [
      { depth: 0, content: 'D0', role: 'system' },
      { depth: 1, content: 'D1a', role: 'system' },
      { depth: 1, content: 'D1b', role: 'system' },
      { depth: 99, content: 'D99', role: 'system' },
    ]);
    expect(out.map((m) => m.content)).toEqual(['s', 'D99', 'u1', 'a1', 'D1a', 'D1b', 'u2', 'D0']);
  });
});

describe('protected story context', () => {
  it('refuses oversized identity/state/notes instead of sending an oversized request', () => {
    capacity(200);
    expect(() => manager.buildContext('状态与约定'.repeat(100), [{ role: 'user', content: '继续' }], 'm'))
      .toThrow(ContextBudgetError);
  });

  it('never drops the latest player input to make space for older content', () => {
    capacity(200);
    const messages: LLMMessage[] = [{ role: 'user', content: '过去', pinned: true },
      { role: 'assistant', content: '旧回复' }, { role: 'user', content: '当前选择'.repeat(80) }];
    expect(() => manager.buildContext('sys', messages, 'm')).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'latest' }) }));
  });

  it('refuses oversized pinned turns without clipping pins or their source input', () => {
    capacity(220);
    const messages: LLMMessage[] = [{ role: 'user', content: '此前约定'.repeat(50) },
      { role: 'assistant', content: '确认', pinned: true }, { role: 'user', content: '继续' }];
    expect(() => manager.buildContext('sys', messages, 'm')).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'pinned' }) }));
  });

  it('reserves all injected material and its envelope before selecting history', () => {
    const entries = [{ role: 'system' as const, content: '世界书常识与风格'.repeat(12), depth: 1 },
      { role: 'system' as const, content: '本次会面约定'.repeat(10), depth: 0 }];
    const messages = history(30);
    const selected = manager.buildContext('冻结身份与状态', messages, 'm', estimateContextMessages(entries));
    const actual = manager.injectAtDepth(selected.messages, entries);
    expect(selected.truncated).toBe(true);
    expect(estimateContextMessages(actual) + 2).toBeLessThanOrEqual(1000);
    for (const entry of entries) expect(actual.some(message => message.content === entry.content)).toBe(true);
    expect(actual.some(message => message.content === messages.at(-1)?.content)).toBe(true);
  });

  it('keeps a selected assistant reply with its user input, including grouped replies', () => {
    capacity(260);
    const messages: LLMMessage[] = [{ role: 'user', content: '旧问题'.repeat(100), messageId: 1 },
      { role: 'assistant', content: '旧答案', messageId: 2 }, { role: 'user', content: '新问题', messageId: 3 },
      { role: 'assistant', content: '角色甲回复', messageId: 4 }, { role: 'assistant', content: '角色乙回复', messageId: 5 }];
    const result = manager.buildContext('sys', messages, 'm');
    expect(result.messages.filter(message => message.messageId).map(message => message.messageId)).toEqual([3, 4, 5]);
    expect(result.truncatedCount).toBe(2);
  });

  it('restores chronological order after choosing important older turns', () => {
    capacity(360);
    const messages: LLMMessage[] = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant', messageId: index + 1,
      content: index < 10 ? 'older '.repeat(16) : 'recent', importance: index >= 8 && index < 10 ? 10 : index < 4 ? 9 : 1,
    }));
    const result = manager.buildContext('sys', messages, 'm');
    const identifiers = result.messages.flatMap(message => message.messageId ? [message.messageId] : []);
    expect(result.truncated).toBe(true);
    expect(identifiers.some(identifier => identifier <= 10)).toBe(true);
    expect(identifiers).toEqual([...identifiers].sort((left, right) => left - right));
    expect(identifiers.slice(-20)).toEqual(Array.from({ length: 20 }, (_, index) => index + 11));
  });

  it('retains full content when it fits and does not mutate the stored input', () => {
    const messages: LLMMessage[] = [{ role: 'assistant', content: '开场', messageId: 1 },
      { role: 'user', content: '约定', messageId: 2 }, { role: 'assistant', content: '风格', pinned: true, messageId: 3 }];
    const before = structuredClone(messages);
    const result = manager.buildContext('身份', messages, 'm');
    expect(result.messages.slice(1)).toEqual(messages);
    expect(result.truncated).toBe(false);
    expect(messages).toEqual(before);
  });

  it('maintains budget, pin, turn and ordering invariants across mixed histories', () => {
    let successes = 0;
    let rejections = 0;
    for (let scenario = 0; scenario < 40; scenario++) {
      const budget = 220 + scenario * 20;
      capacity(budget);
      const messages: LLMMessage[] = Array.from({ length: 36 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user',
        content: '事实'.repeat(1 + (index * 19 + scenario * 7) % 60), messageId: index + 1,
        importance: (index * 7) % 10, pinned: index === 5 || index === 14 }));
      const snapshot = structuredClone(messages);
      try {
        const result = manager.buildContext('身份与确认状态', messages, 'm', 20);
        const identifiers = result.messages.flatMap(message => message.messageId ? [message.messageId] : []);
        expect(estimateContextMessages(result.messages) + 2 + 20).toBeLessThanOrEqual(budget);
        expect(identifiers).toEqual([...identifiers].sort((left, right) => left - right));
        expect(identifiers).toEqual(expect.arrayContaining([5, 6, 15, 16, 35, 36]));
        for (const identifier of identifiers.filter(identifier => identifier % 2 === 0)) expect(identifiers).toContain(identifier - 1);
        successes++;
      } catch (error) {
        if (!(error instanceof ContextBudgetError)) throw error;
        rejections++;
      }
      expect(messages).toEqual(snapshot);
    }
    expect(successes).toBeGreaterThan(0);
    expect(rejections).toBeGreaterThan(0);
  });
});
