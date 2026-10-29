import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve(process.argv[2] || '');
const destination = resolve(process.argv[3] || '');
assert.match(source, /^\/tmp\/squaretable-exp02-evidence\/[a-f0-9-]+\/report\.json$/);
assert.ok(destination.startsWith(resolve('backups/exploration') + '/'));
const report = JSON.parse(await readFile(source, 'utf8'));
assert.notEqual(report.partial, true);
assert.equal(report.results.length, 6);
assert.ok(report.results.every(stage => stage.status === 'passed'));
await mkdir(destination, { recursive: true, mode: 0o700 });
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const groups = [];
for (const stage of report.results) {
  assert.match(stage.name, /^[a-z]+$/);
  const images = [];
  for (const [index, directory] of stage.evidence.entries()) {
    assert.match(directory, /^\/tmp\/squaretable-[a-z0-9-]+\/[a-f0-9-]+$/);
    const target = `${stage.name}-${index}`;
    await mkdir(`${destination}/${target}`, { recursive: true, mode: 0o700 });
    for (const file of await readdir(directory, { withFileTypes: true })) {
      if (!file.isFile() || !/\.(png|json)$/.test(file.name)) continue;
      await copyFile(`${directory}/${file.name}`, `${destination}/${target}/${file.name}`);
      await chmod(`${destination}/${target}/${file.name}`, 0o600);
      if (file.name.endsWith('.png')) images.push(`${target}/${file.name}`);
    }
  }
  groups.push({ name: stage.name, images });
}
const entry = groups.find(group => group.name === 'entry');
const pairs = [];
for (const page of ['discover', 'detail', 'identity', 'library', 'create', 'account', 'play']) {
  for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
    const suffix = `${page}-${width}-${theme}.png`;
    const production = entry.images.find(path => path.endsWith(`/production-${suffix}`) || page === 'play' && path.endsWith(`/play-${width}-${theme}.png`));
    const reference = entry.images.find(path => path.endsWith(`/reference-${suffix}`));
    assert.ok(production && reference, `Missing comparison: ${suffix}`);
    pairs.push(`<details><summary>${escape(page)} · ${width} · ${theme}</summary><div class="pair"><figure><figcaption>保存的原型参考</figcaption><a href="${escape(reference)}"><img loading="lazy" src="${escape(reference)}" alt="原型 ${escape(suffix)}"></a></figure><figure><figcaption>本轮生产实现 · 隔离真实API</figcaption><a href="${escape(production)}"><img loading="lazy" src="${escape(production)}" alt="生产 ${escape(suffix)}"></a></figure></div></details>`);
  }
}
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EXP-02 集中验收</title><style>body{margin:0 auto;padding:24px;max-width:1280px;background:#f6f3ec;color:#2e332d;font:16px/1.8 system-ui}h1,h2{font-family:serif}details{border:1px solid #d2d0c3;padding:12px;margin:12px 0}summary{cursor:pointer;min-height:44px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;min-width:0}img{width:100%;height:auto}a{color:#82571e}li{overflow-wrap:anywhere}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>EXP-02 集中验收</h1><p>此目录含私有测试卡截图，仅供本机查看，不要公开部署。原型、合成故事、真实导入卡片分开记录。浏览器检查通过不代表真实模型质量、用户视觉认可或手机真机签收。</p><h2>七页 · 三尺寸 · 两主题</h2>${pairs.join('')}<h2>异常、创作、账户及四卡证据</h2>${groups.map(group => `<details><summary>${escape(group.name)} · ${group.images.length}张</summary><ul>${group.images.map(path => `<li><a href="${escape(path)}">${escape(path)}</a></li>`).join('')}</ul></details>`).join('')}<h2>请集中确认</h2><ol><li>七页是否保持同一视觉语言，标题、正文、按钮与空态是否清晰。</li><li>手机触屏、软键盘与中文输入法是否遮挡或误提交，返回后草稿与位置是否保留。</li><li>四张用户卡的介绍、开场与支持边界是否符合实际预期；不支持的机制不得显示成已实现。</li></ol></html>`;
await writeFile(`${destination}/index.html`, html, { mode: 0o600 });
await writeFile(`${destination}/manifest.json`, JSON.stringify({ source, comparisons: pairs.length, groups, limitations: ['No user visual signoff', 'No physical-device signoff', 'No paid generation in this package'] }, null, 2), { mode: 0o600 });
console.info(`PASS: ${pairs.length} paired comparisons and ${groups.reduce((count, group) => count + group.images.length, 0)} private screenshots; ${destination}/index.html`);
