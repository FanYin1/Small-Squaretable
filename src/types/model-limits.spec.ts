import { describe, expect, it } from 'vitest';
import { validateModelLimits } from './model-limits';

const valid = { contextWindow: 1000000, maxInputTokens: 1000000, maxOutputTokens: 128000, requestOutputTokens: 10000 };
describe('model capacity edits', () => {
  it('accepts exact integer capacities and trims pasted model names', () => {
    expect(validateModelLimits({ ' claude-test ': valid }, ['claude-test'])).toEqual({ 'claude-test': valid });
  });
  it('rejects ambiguous duplicates and mismatched names', () => {
    expect(() => validateModelLimits({ ' claude-test': valid, 'claude-test': valid }, ['claude-test'])).toThrow('duplicate model');
    expect(() => validateModelLimits({ other: valid }, ['claude-test'])).toThrow('not in the model list');
  });
  it.each([
    [{ maxInputTokens: 1000001 }, 'maxInputTokens'],
    [{ maxInputTokens: 0 }, 'maxInputTokens'],
    [{ requestOutputTokens: 128001 }, 'requestOutputTokens'],
    [{ contextWindow: Number.MAX_SAFE_INTEGER + 1 }, 'contextWindow'],
    [{ maxOutputTokens: 1.5 }, 'maxOutputTokens'],
    [{ requestOutputTokens: '10K' }, 'requestOutputTokens'],
  ])('reports the failing field', (override, field) => {
    expect(() => validateModelLimits({ test: { ...valid, ...override } }, ['test'])).toThrow(field);
  });
  it('does not invent an input capacity for legacy configurations', () => {
    const { maxInputTokens, ...legacy } = valid;
    expect(validateModelLimits({ test: legacy }, ['test']).test.maxInputTokens).toBeUndefined();
  });
});
