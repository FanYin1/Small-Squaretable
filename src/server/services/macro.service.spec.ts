import { describe, it, expect } from 'vitest';
import { applyMacros, type MacroContext } from './macro.service';

function makeCtx(overrides: Partial<MacroContext> = {}): MacroContext {
  return {
    charName: 'Alice',
    userName: 'Bob',
    ...overrides,
  };
}

describe('applyMacros', () => {
  it('replaces {{char}} and {{user}}', () => {
    expect(applyMacros('Hello {{char}}, I am {{user}}', makeCtx())).toBe('Hello Alice, I am Bob');
  });

  it('replaces {{input}}', () => {
    expect(applyMacros('You said: {{input}}', makeCtx({ input: 'hi there' }))).toBe('You said: hi there');
  });

  it('replaces {{original}}', () => {
    expect(applyMacros('{{original}} extra', makeCtx({ original: 'base prompt' }))).toBe('base prompt extra');
  });

  // --- Character card field macros ---
  it('replaces {{personality}}', () => {
    expect(applyMacros('{{personality}}', makeCtx({ personality: 'cheerful' }))).toBe('cheerful');
  });

  it('replaces {{scenario}}', () => {
    expect(applyMacros('{{scenario}}', makeCtx({ scenario: 'a dark forest' }))).toBe('a dark forest');
  });

  it('replaces {{description}}', () => {
    expect(applyMacros('{{description}}', makeCtx({ description: 'A brave knight' }))).toBe('A brave knight');
  });

  it('replaces {{mesExamples}}', () => {
    expect(applyMacros('{{mesExamples}}', makeCtx({ mesExamples: '<START>\nHello' }))).toBe('<START>\nHello');
  });

  it('replaces {{mes_examples}} (underscore variant)', () => {
    expect(applyMacros('{{mes_examples}}', makeCtx({ mesExamples: 'example' }))).toBe('example');
  });

  it('returns empty string for missing card fields', () => {
    expect(applyMacros('{{personality}}{{scenario}}{{description}}', makeCtx())).toBe('');
  });

  // --- Message history macros ---
  it('replaces {{lastMessage}} with last message content', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'how are you' },
    ];
    expect(applyMacros('{{lastMessage}}', makeCtx({ messages }))).toBe('how are you');
  });

  it('replaces {{lastCharMessage}} with last assistant message', () => {
    const messages = [
      { role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'second reply' },
      { role: 'user', content: 'another question' },
    ];
    expect(applyMacros('{{lastCharMessage}}', makeCtx({ messages }))).toBe('second reply');
  });

  it('replaces {{lastUserMessage}} with last user message', () => {
    const messages = [
      { role: 'user', content: 'first msg' },
      { role: 'assistant', content: 'reply' },
    ];
    expect(applyMacros('{{lastUserMessage}}', makeCtx({ messages }))).toBe('first msg');
  });

  it('returns empty for message macros when no messages', () => {
    expect(applyMacros('{{lastMessage}}|{{lastCharMessage}}|{{lastUserMessage}}', makeCtx())).toBe('||');
  });

  // --- Hidden instruction macros ---
  it('replaces {{comment}} with empty string', () => {
    expect(applyMacros('before{{comment}}after', makeCtx())).toBe('beforeafter');
  });

  it('replaces {{hidden}} with empty string', () => {
    expect(applyMacros('a{{hidden}}b', makeCtx())).toBe('ab');
  });

  // --- Utility macros ---
  it('replaces {{newline}} and {{nl}}', () => {
    expect(applyMacros('a{{newline}}b{{nl}}c', makeCtx())).toBe('a\nb\nc');
  });

  it('replaces {{trim}} with empty string', () => {
    expect(applyMacros('a{{trim}}b', makeCtx())).toBe('ab');
  });

  // --- Variable macros ---
  it('replaces {{getvar::name}} from chatVars', () => {
    expect(applyMacros('HP: {{getvar::hp}}', makeCtx({ chatVars: { hp: '100' } }))).toBe('HP: 100');
  });

  it('{{setvar::name::value}} sets variable and returns empty', () => {
    const chatVars: Record<string, string> = {};
    const varWrites: MacroContext['varWrites'] = [];
    const result = applyMacros('{{setvar::hp::50}}done', makeCtx({ chatVars, varWrites }));
    expect(result).toBe('done');
    expect(chatVars.hp).toBe('50');
    expect(varWrites).toEqual([{ scope: 'chat', name: 'hp', value: '50' }]);
  });

  it('{{addvar::name::value}} adds numerically', () => {
    const chatVars = { hp: '100' };
    const varWrites: MacroContext['varWrites'] = [];
    const result = applyMacros('{{addvar::hp::-10}}', makeCtx({ chatVars, varWrites }));
    expect(result).toBe('90');
    expect(chatVars.hp).toBe('90');
  });

  it('leaves unknown macros as-is', () => {
    expect(applyMacros('{{unknown_macro}}', makeCtx())).toBe('{{unknown_macro}}');
  });

  it('is case-insensitive for macro names', () => {
    expect(applyMacros('{{CHAR}} {{User}}', makeCtx())).toBe('Alice Bob');
  });

  // --- Dice and random ---
  it('{{roll::1d1}} always returns 1', () => {
    expect(applyMacros('{{roll::1d1}}', makeCtx())).toBe('1');
  });

  it('{{random::only}} returns the only option', () => {
    expect(applyMacros('{{random::only}}', makeCtx())).toBe('only');
  });
});
