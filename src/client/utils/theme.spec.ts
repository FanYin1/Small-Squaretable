import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEME_STORAGE_KEY, resolveTheme, type Theme } from './theme';

const STORED_CASES: Array<string | null> = ['light', 'dark', null, '', 'auto', 'DARK', 'undefined'];
const PREFERS_LIGHT_CASES = [true, false];

describe('resolveTheme', () => {
  it('显式选择优先于系统偏好', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('没有显式选择时：系统明确偏好浅色 → light', () => {
    expect(resolveTheme(null, true)).toBe('light');
  });

  it('没有显式选择时：系统偏好深色或无偏好 → dark（默认暗色）', () => {
    expect(resolveTheme(null, false)).toBe('dark');
  });

  it('非法的存储值视为没有选择', () => {
    expect(resolveTheme('auto', false)).toBe('dark');
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('', false)).toBe('dark');
  });
});

/**
 * 从 index.html 抠出 <head> 里的内联脚本，在伪造的 localStorage / matchMedia / document 下执行。
 * 它必须与 resolveTheme 在所有输入组合上给出相同结果，并且用同一个存储键。
 */
function loadInlineScript(): string {
  const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  const inline = [...head.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  expect(inline).toHaveLength(1);
  return inline[0][1];
}

function runInlineScript(
  stored: string | null,
  prefersLight: boolean,
  options: { storageThrows?: boolean; noMatchMedia?: boolean } = {}
): string | null {
  const attrs: Record<string, string> = {};
  const fakeLocalStorage = {
    getItem: (key: string) => {
      if (options.storageThrows) throw new Error('SecurityError');
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const fakeWindow = options.noMatchMedia
    ? {}
    : {
        matchMedia: (query: string) => ({
          matches: query === '(prefers-color-scheme: light)' ? prefersLight : false,
        }),
      };
  const fakeDocument = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attrs[name] = value;
      },
    },
  };
  new Function('localStorage', 'window', 'document', loadInlineScript())(
    fakeLocalStorage,
    fakeWindow,
    fakeDocument
  );
  return attrs['data-theme'] ?? null;
}

describe('index.html 内联主题脚本', () => {
  it('位于 <head> 内，且早于模块入口脚本（首帧前同步执行）', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');
    const inlineAt = html.indexOf('<script>');
    const moduleAt = html.indexOf('<script type="module"');
    expect(inlineAt).toBeGreaterThan(html.indexOf('<head>'));
    expect(inlineAt).toBeLessThan(html.indexOf('</head>'));
    expect(inlineAt).toBeLessThan(moduleAt);
    // 同步执行：不能是 module / async / defer
    expect(html.slice(inlineAt, inlineAt + 8)).toBe('<script>');
  });

  it('使用与 TS 端相同的存储键', () => {
    expect(loadInlineScript()).toContain(`'${THEME_STORAGE_KEY}'`);
  });

  it.each(
    STORED_CASES.flatMap((stored) => PREFERS_LIGHT_CASES.map((light) => [stored, light] as const))
  )('与 resolveTheme 一致：stored=%j prefersLight=%s', (stored, prefersLight) => {
    const expected: Theme = resolveTheme(stored, prefersLight);
    expect(runInlineScript(stored, prefersLight)).toBe(expected);
  });

  it('localStorage 抛错时退回系统偏好，不中断页面加载', () => {
    expect(runInlineScript(null, true, { storageThrows: true })).toBe('light');
    expect(runInlineScript(null, false, { storageThrows: true })).toBe('dark');
  });

  it('不支持 matchMedia 时落到默认暗色（与 TS 端 systemPrefersLight=false 一致）', () => {
    expect(runInlineScript(null, true, { noMatchMedia: true })).toBe('dark');
    expect(runInlineScript('light', false, { noMatchMedia: true })).toBe('light');
  });
});
