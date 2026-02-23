import { describe, it, expect } from 'vitest';
import { createCharacterSchema } from './character';

describe('createCharacterSchema', () => {
  const validBase = {
    name: 'Test Character',
    description: 'A test character',
    cardData: { name: 'Test', description: 'test' },
    tags: ['test'],
  };

  it('accepts valid character data', () => {
    const result = createCharacterSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('accepts data URI avatarUrl', () => {
    const result = createCharacterSchema.safeParse({
      ...validBase,
      avatarUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(result.success).toBe(true);
  });

  it('accepts https URL avatarUrl', () => {
    const result = createCharacterSchema.safeParse({
      ...validBase,
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid avatarUrl', () => {
    const result = createCharacterSchema.safeParse({
      ...validBase,
      avatarUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty cardData', () => {
    const result = createCharacterSchema.safeParse({
      ...validBase,
      cardData: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects cardData over 10MB', () => {
    const hugeString = 'x'.repeat(11_000_000);
    const result = createCharacterSchema.safeParse({
      ...validBase,
      cardData: { content: hugeString },
    });
    expect(result.success).toBe(false);
  });
});
