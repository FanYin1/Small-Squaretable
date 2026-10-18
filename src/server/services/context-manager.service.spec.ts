/**
 * P3-3：reservedTokens 与「变动块不被截断」
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/llm.config', () => ({
  getModelMeta: vi.fn(() => ({ id: 'm', provider: 'test', contextWindow: 1200, maxOutputTokens: 100, defaultTemperature: 0.7 })),
}));
vi.mock('./summarization.service', () => ({ summarizationService: {} }));
vi.mock('./logger.service', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { ContextManager, type LLMMessage } from './context-manager.service';
import { countTokens } from '../utils/tokens';

const manager = new ContextManager();

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
