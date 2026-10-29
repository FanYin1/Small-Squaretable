import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { buildCardSandboxDocument, flattenCardVariables, unflattenCardVariables } from './card-sandbox';
import { generateSillyTavernShim } from './sillytavern-shim';

describe('card sandbox boundaries', () => {
  it('puts a restrictive policy before author content and omits the static bridge', () => {
    const document = buildCardSandboxDocument('<script>author()</script>', false, 'PRIVATE_BRIDGE');
    expect(document.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(document).toContain("script-src 'none'");
    expect(document).not.toContain('PRIVATE_BRIDGE');
    expect(buildCardSandboxDocument('', true, 'BRIDGE')).toContain("script-src 'unsafe-inline'");
  });
  it('rejects cyclic, oversized and prototype variable writes, preserving valid values', () => {
    expect(flattenCardVariables({ player: { hp: 100, name: 'Alice' } })).toEqual({ 'player.hp': '100', 'player.name': 'Alice' });
    for (const key of ['__proto__.polluted', 'constructor.prototype.polluted', 'player..hp']) expect(() => flattenCardVariables({ [key]: true })).toThrow();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => flattenCardVariables(cycle)).toThrow();
    expect(() => flattenCardVariables({ text: 'x'.repeat(16385) })).toThrow();
    const output = unflattenCardVariables({ '__proto__.polluted': 'true', 'player.hp': '100' });
    expect(output).toEqual({ player: { hp: 100 } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('keeps hostile names inert, rejects unavailable APIs and ignores forged replies', async () => {
    const handlers: Array<(event: unknown) => void> = [];
    const sent: Array<Record<string, unknown>> = [];
    const parent = { postMessage: (data: Record<string, unknown>) => sent.push(data) };
    const sandboxWindow: Record<string, any> = { parent, addEventListener: (_event: string, handler: (event: unknown) => void) => handlers.push(handler) };
    const hostile = '</script><script>parent.stolen=true</script>';
    const shim = generateSillyTavernShim({ charName: hostile, userName: 'User', chatId: 'story' });
    expect(shim.match(/<\/script>/g)).toHaveLength(1);
    runInNewContext(shim.slice(8, -9), { window: sandboxWindow, setTimeout: () => 0 });
    expect(sandboxWindow.SillyTavern.name2).toBe(hostile);
    for (const method of ['getWorldbook', 'createWorldbookEntries', 'getCharWorldbookNames', 'createWorldbook', 'rebindCharWorldbooks']) await expect(sandboxWindow[method]()).rejects.toThrow(`UNSUPPORTED_API: ${method}`);
    expect(() => sandboxWindow.isCharacterTavernRegexesEnabled()).toThrow('UNSUPPORTED_API');
    const reply = sandboxWindow.getVar('hp');
    const request = sent.at(-1)!;
    handlers.forEach(handler => handler({ source: {}, data: { type: 'era-response', requestId: request.requestId, result: 'forged' } }));
    handlers.forEach(handler => handler({ source: parent, data: { type: 'era-response', requestId: request.requestId, result: '100' } }));
    await expect(reply).resolves.toBe('100');
  });
});
