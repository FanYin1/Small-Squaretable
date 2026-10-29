import { describe, expect, it } from 'vitest';
import { assertContextBudget, ContextBudgetError, estimateContextMessages, estimateContextTokens } from './context-budget';
import { countTokens } from '../utils/tokens';

describe('context capacity guard', () => {
  it('accounts for long unbroken strings without changing the billing estimator', () => {
    const content = 'abcdef1234'.repeat(1000);
    expect(countTokens(content)).toBe(2);
    expect(estimateContextTokens(content)).toBeGreaterThan(3000);
    expect(estimateContextTokens('')).toBe(0);
  });
  it('includes UTF-8 data and each injected message envelope', () => {
    expect(estimateContextTokens('你好')).toBeGreaterThanOrEqual(countTokens('你好'));
    expect(estimateContextTokens('🙂'.repeat(1000))).toBeGreaterThan(1000);
    expect(estimateContextMessages([{ content: 'hello' }, { content: 'hello' }]))
      .toBe(2 * (estimateContextTokens('hello') + 4));
  });
  it('accepts the estimated boundary and rejects one token over it', () => {
    const limits = { contextWindow: 1000, maxOutputTokens: 200 };
    expect(assertContextBudget(700, limits)).toBe(700);
    expect(() => assertContextBudget(701, limits)).toThrow(ContextBudgetError);
    try { assertContextBudget(701, limits, 'latest'); }
    catch (error) {
      expect(error).toMatchObject({ code: 'CONTEXT_BUDGET_EXCEEDED', statusCode: 422,
        details: { reason: 'latest', requiredTokens: 701, availableTokens: 700, outputTokens: 200, contextWindow: 1000 } });
    }
  });
  it('uses the actual template output allowance', () => {
    expect(() => assertContextBudget(500, { contextWindow: 1000, maxOutputTokens: 100 }, 'template', 600))
      .toThrow(ContextBudgetError);
  });
  it.each([NaN, Infinity, -1, 1.5])('rejects an invalid estimate %s', tokens => {
    expect(() => assertContextBudget(tokens, { contextWindow: 1000, maxOutputTokens: 100 }))
      .toThrow('configuration is invalid');
  });
});
