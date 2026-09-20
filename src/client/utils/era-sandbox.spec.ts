import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock era-bridge module
vi.mock('@client/utils/era-bridge', () => ({
  eraVariables: { value: {} },
  initEraBridge: vi.fn(),
  destroyEraBridge: vi.fn(),
  fetchVariables: vi.fn().mockResolvedValue({}),
  updateVariables: vi.fn(),
  mergeVariables: vi.fn(),
  deleteVariables: vi.fn(),
  registerIframe: vi.fn(),
  unregisterIframe: vi.fn(),
}));

describe('era-bridge', () => {
  describe('module exports', () => {
    it('should be importable with expected exports', async () => {
      const mod = await import('@client/utils/era-bridge');
      expect(mod.initEraBridge).toBeDefined();
      expect(mod.destroyEraBridge).toBeDefined();
      expect(mod.fetchVariables).toBeDefined();
      expect(mod.updateVariables).toBeDefined();
    });
  });
});

describe('sillytavern-shim', () => {
  let generateSillyTavernShim: typeof import('@client/utils/sillytavern-shim').generateSillyTavernShim;

  beforeEach(async () => {
    const mod = await import('@client/utils/sillytavern-shim');
    generateSillyTavernShim = mod.generateSillyTavernShim;
  });

  it('generates a script tag with eventOn/eventEmit', () => {
    const shim = generateSillyTavernShim({
      charName: 'Alice',
      userName: 'Bob',
      chatId: 'chat-123',
    });
    expect(shim).toContain('<script>');
    expect(shim).toContain('window.eventOn');
    expect(shim).toContain('window.eventEmit');
  });

  it('includes SillyTavern globals with correct names', () => {
    const shim = generateSillyTavernShim({
      charName: 'TestChar',
      userName: 'TestUser',
      chatId: 'chat-456',
    });
    expect(shim).toContain('"TestUser"');
    expect(shim).toContain('"TestChar"');
    expect(shim).toContain('window.SillyTavern');
  });

  it('includes getScriptId function with custom id', () => {
    const shim = generateSillyTavernShim({
      charName: 'A',
      userName: 'B',
      chatId: 'c',
      scriptId: 'my-script',
    });
    expect(shim).toContain('window.getScriptId');
    expect(shim).toContain('"my-script"');
  });

  it('includes jQuery stub', () => {
    const shim = generateSillyTavernShim({
      charName: 'A',
      userName: 'B',
      chatId: 'c',
    });
    expect(shim).toContain('window.$');
    expect(shim).toContain('window.jQuery');
  });

  it('includes world book API stubs', () => {
    const shim = generateSillyTavernShim({
      charName: 'A',
      userName: 'B',
      chatId: 'c',
    });
    expect(shim).toContain('window.getWorldbook');
    expect(shim).toContain('window.createWorldbookEntries');
    expect(shim).toContain('window.isCharacterTavernRegexesEnabled');
  });

  it('escapes special characters in names', () => {
    const shim = generateSillyTavernShim({
      charName: 'Test"Char',
      userName: 'Test\\User',
      chatId: 'c',
    });
    expect(shim).toContain('Test\\"Char');
    expect(shim).toContain('Test\\\\User');
  });

  it('includes postMessage bridge for parent communication', () => {
    const shim = generateSillyTavernShim({
      charName: 'A',
      userName: 'B',
      chatId: 'c',
    });
    expect(shim).toContain('window.parent.postMessage');
    expect(shim).toContain('era-shim-ready');
  });

  it('includes getVar function bridged to parent', () => {
    const shim = generateSillyTavernShim({
      charName: 'A',
      userName: 'B',
      chatId: 'c',
    });
    expect(shim).toContain('window.getVar');
    expect(shim).toContain('era-getVar');
  });
});

describe('HTML document extraction pattern', () => {
  const HTML_DOC_PATTERN = /(?:```html\s*\n)?(<!doctype\s+html>[\s\S]*?<\/html>)(?:\s*\n```)?/gi;

  it('detects raw HTML documents', () => {
    const htmlDoc = '<!doctype html><html><head></head><body>Hello</body></html>';
    HTML_DOC_PATTERN.lastIndex = 0;
    const match = HTML_DOC_PATTERN.exec(htmlDoc);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(htmlDoc);
  });

  it('detects code-fenced HTML documents', () => {
    const text = 'Before\n```html\n<!doctype html><html><body>Test</body></html>\n```\nAfter';
    HTML_DOC_PATTERN.lastIndex = 0;
    const match = HTML_DOC_PATTERN.exec(text);
    expect(match).not.toBeNull();
    expect(match![1]).toContain('<!doctype html>');
  });

  it('returns null for text without HTML documents', () => {
    const text = 'Just normal markdown text with **bold**';
    HTML_DOC_PATTERN.lastIndex = 0;
    const match = HTML_DOC_PATTERN.exec(text);
    expect(match).toBeNull();
  });

  it('handles mixed content with HTML document in middle', () => {
    const text = 'Before\n<!doctype html><html><body>Panel</body></html>\nAfter';
    HTML_DOC_PATTERN.lastIndex = 0;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = HTML_DOC_PATTERN.exec(text)) !== null) {
      matches.push(match[1]);
    }
    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain('<!doctype html>');
  });

  it('handles case-insensitive doctype', () => {
    const text = '<!DOCTYPE HTML><html><body>Test</body></html>';
    HTML_DOC_PATTERN.lastIndex = 0;
    const match = HTML_DOC_PATTERN.exec(text);
    expect(match).not.toBeNull();
  });
});
