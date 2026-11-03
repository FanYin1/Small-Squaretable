import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/llm.config', () => ({ getModelMeta: () => ({
  contextWindow: 16000, maxOutputTokens: 4096, defaultTemperature: 0.7,
}) }));
vi.mock('./summarization.service', () => ({ summarizationService: {} }));
vi.mock('./logger.service', () => ({ createLogger: () => ({ info: vi.fn() }) }));
import { ContextManager, type LLMMessage } from './context-manager.service';

const root = 'backups/exploration/performance-20261101';
const manager = new ContextManager();
export function sampleHistory(rounds: number): LLMMessage[] {
  return Array.from({ length: rounds * 2 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user', messageId: i + 1,
    content: `演示消息 ${i}。` + '雨夜，旅人检查唱片封套。A record waits by the window. '.repeat(4 + i % 9),
    pinned: i === 3 || i === 30, importance: i % 11,
  }));
}
describe('context selection performance and compatibility', () => {
  it('preserves frozen pre-optimization outputs across long mixed-language histories', () => {
    const result = [1, 50, 200, 1000].map(rounds => {
      const history = sampleHistory(rounds);
      const run = () => manager.buildContext('演示角色设定，不代替用户作决定。', history, 'fixture', 350);
      for (let i = 0; i < 5; i++) run();
      const times: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now(); run(); times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const output = run();
      return { rounds, inputBytes: Buffer.byteLength(JSON.stringify(history)),
        included: output.messages.length, truncated: output.truncatedCount,
        digest: createHash('sha256').update(JSON.stringify(output)).digest('hex'),
        p50Ms: times[14], p95Ms: times[28] };
    });
    if (process.env.CONTEXT_PERF_REPORT === 'before' || process.env.CONTEXT_PERF_REPORT === 'after') {
      mkdirSync(root, { recursive: true });
      writeFileSync(`${root}/${process.env.CONTEXT_PERF_REPORT}.json`, JSON.stringify({
        node: process.version, mode: 'synthetic context CPU only; no database or provider', result,
      }, null, 2));
    }
    if (process.env.CONTEXT_PERF_REPORT !== 'before') {
      const reference = JSON.parse(readFileSync(new URL('./fixtures/context-performance.json', import.meta.url), 'utf8'));
      expect(result.map(({ rounds, digest }) => ({ rounds, digest }))).toEqual(reference);
    }
  });
});
