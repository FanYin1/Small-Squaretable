// 主题守卫（P2-2）：
// 1. 用户气泡的「文字 / 底色」在浅、深两套主题下都满足 WCAG AA（≥ 4.5:1）。
//    浅色曾是白字压 #D97706，只有 3.19:1。
// 2. 沉浸样板层已并入主题：不再残留 --im-* / .immersive / im-select-popper，
//    深色主题也不单独声明字体栈。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT_ROOT = path.resolve(__dirname, '..');
const VARIABLES = fs.readFileSync(path.join(__dirname, 'variables.css'), 'utf-8');
const BUBBLE_SFC = fs.readFileSync(
  path.join(CLIENT_ROOT, 'components/chat/MessageBubble.vue'),
  'utf-8'
);

/** 取出以 selector 开头的顶层规则块内容（variables.css 里这两个块都不含嵌套花括号） */
function extractBlock(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`variables.css 中找不到 ${selector} 块`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function readToken(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'm'));
  return m?.[1];
}

/** WCAG 2.x 相对亮度 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 从 MessageBubble.vue 读 `.message-user .bubble` 实际引用的令牌名，避免测试与样式各写各的 */
function bubbleTokens(): { bg: string; fg: string } {
  const rule = BUBBLE_SFC.match(/\.message-user \.bubble\s*\{([^}]*)\}/);
  if (!rule) throw new Error('找不到 .message-user .bubble 规则');
  const bg = rule[1].match(/background:\s*var\((--[\w-]+)\)/)?.[1];
  const fg = rule[1].match(/(?:^|[\s;])color:\s*var\((--[\w-]+)\)/)?.[1];
  if (!bg || !fg) throw new Error('用户气泡的 background / color 必须直接取自令牌');
  return { bg, fg };
}

const themes = {
  light: extractBlock(VARIABLES, ':root'),
  dark: extractBlock(VARIABLES, '[data-theme="dark"]'),
} as const;

describe('用户气泡对比度', () => {
  const { bg, fg } = bubbleTokens();

  it.each(['light', 'dark'] as const)('%s 主题：气泡文字 / 底色 ≥ 4.5:1', (name) => {
    const bgHex = readToken(themes[name], bg);
    const fgHex = readToken(themes[name], fg);
    expect(bgHex, `${name} 主题缺少 ${bg}`).toBeDefined();
    expect(fgHex, `${name} 主题缺少 ${fg}`).toBeDefined();
    expect(contrast(fgHex!, bgHex!)).toBeGreaterThanOrEqual(4.5);
  });

  it('文字色不是白色（白字压琥珀底在浅色主题只有 3.19:1）', () => {
    expect(fg).not.toBe('--text-inverse');
  });
});

describe('沉浸样板层已并入主题', () => {
  it('深色主题没有单独的 --im-font-* 字体栈', () => {
    expect(themes.dark).not.toMatch(/--im-font/);
    expect(themes.dark).not.toMatch(/font-family/);
  });

  it('只有 [data-theme="dark"] 一个深色选择器，没有 .dark 的并行实现', () => {
    expect(VARIABLES).not.toMatch(/^\.dark\b/m);
  });

  function listSources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listSources(full);
      return /\.(vue|css|scss|ts)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')
        ? [full]
        : [];
    });
  }

  it('src/client 内不再引用 --im-* / .immersive / im-select-popper / immersive.css', () => {
    const offenders = listSources(CLIENT_ROOT).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf-8');
      const hits = [/--im-/, /\.immersive\b/, /class="immersive"/, /im-select-popper/, /immersive\.css/]
        .filter((re) => re.test(text))
        .map((re) => `${path.relative(CLIENT_ROOT, file)}: ${re}`);
      return hits;
    });
    expect(offenders).toEqual([]);
  });

  it('immersive.css 已删除', () => {
    expect(fs.existsSync(path.join(__dirname, 'immersive.css'))).toBe(false);
  });
});
