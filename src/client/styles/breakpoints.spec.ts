// 断点守卫：保证全站只有 480 / 768 / 1024 三个断点、只有一种边界写法，
// 且 Sass 单一来源、variables.css 镜像、以及无法使用 mixin 的纯 CSS 文件三处数值一致。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as sass from 'sass-embedded';

const CLIENT_ROOT = path.resolve(__dirname, '..');
const STYLES_DIR = __dirname;
const SCSS_PATH = path.join(STYLES_DIR, '_breakpoints.scss');

// 桌面优先：max-width 取「断点 - 1」；min-width 取断点本身（与 max-width 档互补）
const BREAKPOINTS = { sm: 480, md: 768, lg: 1024 } as const;
const ALLOWED_MAX = new Set(Object.values(BREAKPOINTS).map((v) => v - 1));
const ALLOWED_MIN = new Set(Object.values(BREAKPOINTS));

// 由其他任务负责改写、尚未并入单一来源的文件。改完后从这里删除，守卫即对其生效。
const PENDING_FILES = new Set<string>();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(vue|css|scss)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function mediaWidthQueries(source: string): Array<{ kind: 'max' | 'min'; px: number }> {
  const result: Array<{ kind: 'max' | 'min'; px: number }> = [];
  const mediaRe = /@media[^{]*\{/g;
  for (const media of source.match(mediaRe) ?? []) {
    for (const m of media.matchAll(/\((max|min)-width:\s*(\d+(?:\.\d+)?)px\)/g)) {
      result.push({ kind: m[1] as 'max' | 'min', px: Number(m[2]) });
    }
  }
  return result;
}

describe('breakpoint single source of truth', () => {
  it('_breakpoints.scss defines exactly sm/md/lg = 480/768/1024', () => {
    const scss = fs.readFileSync(SCSS_PATH, 'utf8');
    const map = scss.match(/\$breakpoints:\s*\(([\s\S]*?)\)/)?.[1] ?? '';
    const parsed = Object.fromEntries(
      [...map.matchAll(/(\w+):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]),
    );
    expect(parsed).toEqual(BREAKPOINTS);
  });

  it('variables.css --breakpoint-* mirror the Sass map', () => {
    const css = fs.readFileSync(path.join(STYLES_DIR, 'variables.css'), 'utf8');
    const tokens = Object.fromEntries(
      [...css.matchAll(/--breakpoint-(\w+):\s*(\d+)px/g)].map((m) => [m[1], Number(m[2])]),
    );
    expect(tokens).toEqual(BREAKPOINTS);
  });

  it('mixins emit complementary max-width (bp - 1) / min-width (bp) queries', () => {
    const compiled = sass.compileString(
      `@use "breakpoints" as *;
       .a { @include below(sm) { color: red; } }
       .b { @include below(md) { color: red; } }
       .c { @include below(lg) { color: red; } }
       .d { @include from(md) { color: red; } }
       .e { @include between(md, lg) { color: red; } }`,
      { loadPaths: [STYLES_DIR] },
    ).css;

    expect(compiled).toContain('@media (max-width: 479px)');
    expect(compiled).toContain('@media (max-width: 767px)');
    expect(compiled).toContain('@media (max-width: 1023px)');
    expect(compiled).toContain('@media (min-width: 768px)');
    expect(compiled).toContain('@media (min-width: 768px) and (max-width: 1023px)');
  });

  it('mixins reject unknown breakpoint names', () => {
    expect(() =>
      sass.compileString(
        `@use "breakpoints" as *;
         .a { @include below(xl) { color: red; } }`,
        { loadPaths: [STYLES_DIR] },
      ),
    ).toThrow(/Unknown breakpoint/);
  });
});

describe('no ad-hoc width media queries in src/client', () => {
  const files = walk(CLIENT_ROOT)
    .filter((f) => path.resolve(f) !== SCSS_PATH)
    .map((f) => ({ file: f, rel: path.relative(CLIENT_ROOT, f).split(path.sep).join('/') }))
    .filter(({ rel }) => !PENDING_FILES.has(rel));

  it('.vue files use the Sass mixins, never literal width @media', () => {
    const offenders = files
      .filter(({ file }) => file.endsWith('.vue'))
      .flatMap(({ file, rel }) =>
        mediaWidthQueries(fs.readFileSync(file, 'utf8')).map((q) => `${rel}: ${q.kind}-width ${q.px}px`),
      );
    expect(offenders).toEqual([]);
  });

  it('plain .css files (cannot use mixins) only use the canonical boundary values', () => {
    const offenders = files
      .filter(({ file }) => file.endsWith('.css'))
      .flatMap(({ file, rel }) =>
        mediaWidthQueries(fs.readFileSync(file, 'utf8'))
          .filter((q) => !(q.kind === 'max' ? ALLOWED_MAX : ALLOWED_MIN).has(q.px))
          .map((q) => `${rel}: ${q.kind}-width ${q.px}px`),
      );
    expect(offenders).toEqual([]);
  });

  it('.vue style blocks that use the mixins are compiled as scss', () => {
    const offenders = files
      .filter(({ file }) => file.endsWith('.vue'))
      .flatMap(({ file, rel }) => {
        const source = fs.readFileSync(file, 'utf8');
        return [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]
          .filter(([, attrs, body]) => /@include\s+(below|from|between)\(/.test(body) && !/lang="scss"/.test(attrs))
          .map(() => rel);
      });
    expect(offenders).toEqual([]);
  });
});
