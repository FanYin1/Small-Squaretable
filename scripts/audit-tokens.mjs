/**
 * 令牌对比度审计：解析 variables.css，对「前景/背景」有意义的组合算 WCAG 比值。
 * 用途是把「配色是否达标」从主观判断变成可复核的数字。
 * 只读不写。
 */
import { readFileSync } from 'node:fs';

const css = readFileSync('src/client/styles/variables.css', 'utf8');

function parseBlock(selector) {
  const i = css.indexOf(selector);
  if (i === -1) throw new Error(`block not found: ${selector}`);
  const open = css.indexOf('{', i);
  let depth = 0, end = open;
  for (let p = open; p < css.length; p++) {
    if (css[p] === '{') depth++;
    else if (css[p] === '}') { depth--; if (depth === 0) { end = p; break; } }
  }
  const body = css.slice(open + 1, end);
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = parseBlock(':root');
const darkOverrides = parseBlock('.dark,');
const dark = { ...light, ...darkOverrides };

function resolve(tokens, value, seen = 0) {
  if (seen > 12) return null;
  const v = String(value).trim();
  const m = v.match(/^var\((--[\w-]+)\)$/);
  if (m) return tokens[m[1]] ? resolve(tokens, tokens[m[1]], seen + 1) : null;
  return v;
}

function toRgb(raw) {
  if (!raw) return null;
  const v = raw.trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((o) => parseInt(m[1].slice(o, o + 2), 16));
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// 实际会在界面里碰到的前景/背景组合。
// 「大字」指 >=18.66px bold 或 >=24px，AA 门槛 3.0；其余 4.5。
//
// 第 5 位是可选标记：
//   'exempt' —— 按 WCAG 1.4.11 属纯装饰（不承载信息），规范豁免对比度要求。
//               仍然量出来打印，但不计入失败数。加深这些值会毁掉暖中性观感，
//               所以是「有意不修」而不是「漏了」。
//   'control' —— 故意放进来的反例，用来验证脚本本身在正常工作。判不达标才对。
//               同样不计入失败数（否则每次审计都带着一个永久红字）。
const PAIRS = [
  ['--text-primary', '--bg-base', 4.5, '正文 on 页面底'],
  ['--text-primary', '--bg-surface', 4.5, '正文 on 卡片'],
  ['--text-primary', '--bg-subtle', 4.5, '正文 on 次级面'],
  ['--text-secondary', '--bg-base', 4.5, '次要文字 on 页面底'],
  ['--text-secondary', '--bg-surface', 4.5, '次要文字 on 卡片'],
  ['--text-secondary', '--bg-subtle', 4.5, '次要文字 on 次级面'],
  ['--text-tertiary', '--bg-base', 4.5, '三级文字 on 页面底'],
  ['--text-tertiary', '--bg-surface', 4.5, '三级文字 on 卡片'],
  ['--text-tertiary', '--bg-subtle', 4.5, '三级文字 on 次级面'],

  // 琥珀的两个角色分开量：文字角色必须过 4.5，填充角色只需与页面底可辨 3:1。
  ['--accent-text', '--bg-surface', 4.5, '琥珀文字/图标 on 卡片'],
  ['--accent-text', '--bg-base', 4.5, '琥珀文字/图标 on 页面底'],
  ['--accent-text', '--accent-light', 4.5, '琥珀文字 on 琥珀浅底'],
  ['--accent', '--bg-base', 3.0, '琥珀填充 on 页面底（非文本 3:1）'],
  ['--accent', '--bg-surface', 3.0, '琥珀填充 on 卡片（非文本 3:1）'],
  ['--accent-on', '--accent', 4.5, '按钮前景 on 琥珀底'],
  ['--text-inverse', '--accent', 4.5, '白字 on 琥珀底', 'control'],

  // 语义色同样分角色：-text 变体作文字，原色作填充/图标底。
  ['--color-success-text', '--bg-surface', 4.5, '成功文字 on 卡片'],
  ['--color-danger-text', '--bg-surface', 4.5, '危险文字 on 卡片'],
  ['--color-warning-text', '--bg-surface', 4.5, '警告文字 on 卡片'],
  ['--color-info-text', '--bg-surface', 4.5, '信息文字 on 卡片'],
  ['--color-success', '--bg-surface', 3.0, '成功填充 on 卡片（非文本）'],
  ['--color-danger', '--bg-surface', 3.0, '危险填充 on 卡片（非文本）'],
  ['--color-warning', '--bg-surface', 3.0, '警告填充 on 卡片（非文本）'],
  ['--color-info', '--bg-surface', 3.0, '信息填充 on 卡片（非文本）'],

  ['--sidebar-text', '--sidebar-bg', 4.5, '侧栏文字'],
  ['--sidebar-text-active', '--sidebar-active', 4.5, '侧栏选中态文字'],
  ['--text-primary', '--chat-user-msg-bg', 4.5, '用户消息文字'],
  ['--text-primary', '--chat-assistant-msg-bg', 4.5, 'AI 消息文字'],

  // 边框：交互控件边界要过 3:1，装饰性分隔线豁免。
  ['--border-interactive', '--bg-surface', 3.0, '控件边界 on 卡片'],
  ['--border-interactive', '--bg-base', 3.0, '控件边界 on 页面底'],
  ['--border-default', '--bg-surface', 3.0, '装饰分隔线 on 卡片', 'exempt'],
  ['--border-default', '--bg-base', 3.0, '装饰分隔线 on 页面底', 'exempt'],
  ['--border-strong', '--bg-surface', 3.0, '装饰强分隔线 on 卡片', 'exempt'],

  // 焦点环：属非文本对比，需与「环所在的底」达 3:1。
  ['--focus-ring-color', '--bg-base', 3.0, '焦点环 on 页面底'],
  ['--focus-ring-color', '--bg-surface', 3.0, '焦点环 on 卡片'],

  ['--el-text-color-regular', '--el-bg-color', 4.5, 'EP 常规文字'],
  ['--el-text-color-secondary', '--el-bg-color', 4.5, 'EP 次要文字'],
  ['--el-text-color-placeholder', '--el-bg-color', 4.5, 'EP 占位符'],
  ['--el-border-color', '--el-bg-color', 3.0, 'EP 控件边框'],
];

let failures = 0;
let controlsHeld = 0;
for (const [label, tokens] of [['LIGHT', light], ['DARK', dark]]) {
  console.log(`\n===== ${label} =====`);
  for (const [fgT, bgT, min, desc, flag] of PAIRS) {
    const fg = toRgb(resolve(tokens, tokens[fgT]));
    const bg = toRgb(resolve(tokens, tokens[bgT]));
    if (!fg || !bg) { console.log(`  ?? ${fgT} / ${bgT}  (无法解析)`); continue; }
    const r = ratio(fg, bg);
    const ok = r >= min;
    let mark;
    if (flag === 'control') {
      // 反例：不达标才说明脚本在正常工作。
      mark = ok ? 'BUG!' : 'ctrl';
      if (!ok) controlsHeld++;
    } else if (flag === 'exempt') {
      mark = ok ? 'ok  ' : 'exmp';
    } else {
      mark = ok ? 'ok  ' : 'FAIL';
      if (!ok) failures++;
    }
    console.log(
      `  ${mark} ${String(r.toFixed(2)).padStart(6)}:1 (需 ${min})  ` +
      `${fgT} on ${bgT}`.padEnd(52) + ` ${desc}`
    );
  }
}
/*
 * 层级可分辨性检查。
 *
 * 加这一段的原因：把 --text-tertiary 提到 AA 门槛后，它落到了原 --text-secondary
 * 头上——深色下两者自身对比只有 1.01:1，肉眼完全是同一个灰。对比度全过，
 * 层级却塌了，而只看上面那张表是发现不了的。
 * 所以凡是「靠深浅区分语义」的相邻层级，都要求自身对比不低于 1.35:1。
 */
const TIERS = [
  [['--text-primary', '--text-secondary'], '正文 / 次要'],
  [['--text-secondary', '--text-tertiary'], '次要 / 三级'],
  [['--text-tertiary', '--text-faint'], '三级 / 装饰'],
];
const TIER_MIN = 1.35;
let tierFails = 0;
console.log('\n===== 层级可分辨性（相邻文字层级自身对比，需 ≥1.35）=====');
for (const [label, tokens] of [['LIGHT', light], ['DARK', dark]]) {
  for (const [[aT, bT], desc] of TIERS) {
    const a = toRgb(resolve(tokens, tokens[aT]));
    const b = toRgb(resolve(tokens, tokens[bT]));
    if (!a || !b) { console.log(`  ?? ${label} ${aT}/${bT}`); continue; }
    const r = ratio(a, b);
    const ok = r >= TIER_MIN;
    if (!ok) tierFails++;
    console.log(`  ${ok ? 'ok  ' : 'FLAT'} ${String(r.toFixed(2)).padStart(5)}:1  ${label} ${desc}`);
  }
}

const controlsTotal = PAIRS.filter((p) => p[4] === 'control').length * 2;
console.log(`\n总计不达标组合：${failures}`);
console.log(`层级塌陷：${tierFails}`);
console.log(`反例校验：${controlsHeld}/${controlsTotal} 按预期判为不达标（脚本自检）`);
console.log(`exmp = 装饰性，按 WCAG 1.4.11 豁免，有意保持柔和`);
