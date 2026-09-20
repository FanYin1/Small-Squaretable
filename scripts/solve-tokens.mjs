/**
 * 为不达标的令牌求候选值：在保持色相的前提下，找到刚好过门槛的最浅/最深取值。
 * 目的是「改动最小且达标」，而不是凭感觉挑一个更深的颜色。
 * 只读不写。
 */
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('');
const toRgb = (h) => [0, 2, 4].map((o) => parseInt(h.slice(1 + o, 3 + o), 16));

// RGB <-> HSL，用于「锁定色相饱和度、只调明度」
function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s, l];
}
function hsl2rgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** 锁定色相/饱和度，二分调明度直到刚好达到 target 对比度。dir=-1 变深，+1 变浅 */
function solve(baseHex, bgHex, target, dir) {
  const [h, s] = rgb2hsl(toRgb(baseHex));
  const bg = toRgb(bgHex);
  let lo = 0, hi = 1, best = null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const rgb = hsl2rgb([h, s, mid]);
    const r = ratio(rgb, bg);
    if (r >= target) { best = rgb; if (dir < 0) lo = mid; else hi = mid; }
    else { if (dir < 0) hi = mid; else lo = mid; }
  }
  return best ? { hex: hex(best), ratio: +ratio(best, bg).toFixed(2) } : null;
}

/**
 * 对一组背景同时求解：取最难的那个背景（对比度最低的）作为约束。
 *
 * 这是第一轮求解的教训。当时每个令牌只对着一个「代表性」背景解，
 * 解完 --text-tertiary 在 #FFFFFF 上刚好 4.75:1，可它同样会用在
 * #F5F3EF 的次级面上，那里只有 4.29:1——照样不达标。
 * 一个令牌必须在它会落到的每一种表面上都过线，所以只能按最差的那个解。
 *
 * MARGIN：解到「刚好 4.50」等于没有余量，8 位色量化后的舍入就能把它推回
 * 4.48:1。留一点余量，让审计结果稳定在门槛之上。
 */
const MARGIN = 0.12;
function solveAll(baseHex, bgHexes, target, dir) {
  const t = target + MARGIN;
  let worst = null;
  for (const bg of bgHexes) {
    const r = solve(baseHex, bg, t, dir);
    if (!r) return { hex: null, note: `在 ${bg} 上无解` };
    // dir<0（压深）时取最深的解；dir>0（提亮）时取最亮的解。
    const l = lum(toRgb(r.hex));
    if (!worst || (dir < 0 ? l < worst.l : l > worst.l)) worst = { ...r, l, bg };
  }
  const ratios = bgHexes.map((bg) => `${bg}=${ratio(toRgb(worst.hex), toRgb(bg)).toFixed(2)}`);
  return { hex: worst.hex, worstBg: worst.bg, ratios: ratios.join(' ') };
}

// 每个角色实际会落到的全部表面。少列一个就会漏掉一处失败。
const LIGHT_TEXT_BGS = ['#FFFFFF', '#FAF9F6', '#F5F3EF'];
const DARK_TEXT_BGS = ['#2D2B2A', '#1A1918', '#363432'];
// 琥珀文字额外要能落在琥珀薄底上（tag / 徽标那类）。
const LIGHT_AMBER_BGS = [...LIGHT_TEXT_BGS, '#FEF3C7'];
const DARK_AMBER_BGS = [...DARK_TEXT_BGS, '#451A03'];

const show = (name, r) => console.log(
  `  ${name.padEnd(26)} ${String(r.hex).padEnd(9)} ${r.ratios ?? r.note}`
);

console.log('=== 琥珀作「文字/图标」（填充色 #D97706 / #F59E0B 不动）===');
show('--accent-text 浅', solveAll('#D97706', LIGHT_AMBER_BGS, 4.5, -1));
show('--accent-text 深', solveAll('#F59E0B', DARK_AMBER_BGS, 4.5, +1));

console.log('\n=== --text-tertiary（时间戳、计数、占位符）===');
show('浅', solveAll('#A39E99', LIGHT_TEXT_BGS, 4.5, -1));
show('深', solveAll('#6B6560', DARK_TEXT_BGS, 4.5, +1));

console.log('\n=== 语义色作文字用 ===');
for (const [name, l, d] of [
  ['success', '#059669', '#10B981'],
  ['danger', '#DC2626', '#EF4444'],
  ['warning', '#D97706', '#F59E0B'],
  ['info', '#6B6560', '#A39E99'],
]) {
  show(`${name} 浅`, solveAll(l, LIGHT_TEXT_BGS, 4.5, -1));
  show(`${name} 深`, solveAll(d, DARK_TEXT_BGS, 4.5, +1));
}

console.log('\n=== 交互边框（表单控件边界，WCAG 1.4.11 需 3:1）===');
show('浅', solveAll('#D4D0CA', LIGHT_TEXT_BGS, 3.0, -1));
show('深', solveAll('#4A4745', DARK_TEXT_BGS, 3.0, +1));
console.log('  注：装饰性分隔线按 1.4.11 豁免，--border-default/subtle 保持柔和不动');

console.log('\n=== 焦点环（需在任意底色上可辨，取 3:1 对页面底与卡片面）===');
for (const [label, bg] of [
  ['浅色 base', '#FAF9F6'], ['浅色 surface', '#FFFFFF'], ['浅色 subtle', '#F5F3EF'],
  ['深色 base', '#1A1918'], ['深色 surface', '#2D2B2A'], ['深色 subtle', '#363432'],
]) {
  const r = ratio(toRgb('#D97706'), toRgb(bg));
  const r2 = ratio(toRgb('#F59E0B'), toRgb(bg));
  console.log(`  ${label.padEnd(14)} #D97706=${r.toFixed(2)}:1  #F59E0B=${r2.toFixed(2)}:1`);
}
