import { expect, it } from 'vitest';
import { resolveGenerationParameters } from './generation-parameters';
import { assertContextBudget } from './context-budget';

const meta = { id: 'alias', provider: 'custom', contextWindow: 200000, maxOutputTokens: 128000,
  outputCapabilityTokens: 128000, defaultTemperature: 0.7 };

it('preserves a configured 128K allowance without a hidden billing ceiling', () => {
  expect(resolveGenerationParameters(meta).maxOutputTokens).toBe(128000);
});
it('uses the requested smaller allowance for input admission and keeps independent input limits', () => {
  const limits = resolveGenerationParameters(meta, 16384);
  expect(assertContextBudget(100000, limits)).toBe(183516);
  expect(() => assertContextBudget(100000, { ...limits, maxInputTokens: 90000 })).toThrow();
  expect(meta.maxOutputTokens).toBe(128000);
});
it('clamps client overrides to administrator policy even if physical capacity is higher', () => {
  expect(resolveGenerationParameters({ ...meta, maxOutputTokens: 10000 }, 128000).maxOutputTokens).toBe(10000);
});
it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe requested allowance %s', value => {
  expect(() => resolveGenerationParameters(meta, value)).toThrow();
});
it('rejects invalid physical or policy configurations instead of silently guessing', () => {
  expect(() => resolveGenerationParameters({ ...meta, contextWindow: 128000 })).toThrow();
  expect(() => resolveGenerationParameters({ ...meta, maxOutputTokens: 128001 })).toThrow();
  expect(() => resolveGenerationParameters({ ...meta, maxInputTokens: 200001 })).toThrow();
});
