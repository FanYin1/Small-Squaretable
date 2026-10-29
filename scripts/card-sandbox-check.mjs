import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium, expect } from '@playwright/test';

const evidence = `/tmp/squaretable-card-sandbox-${randomUUID()}`;
await mkdir(evidence, { mode: 0o700 });
const checks = [];
const probe = `
window.report = {};
try { parent.document.body.dataset.stolen = 'yes'; report.parentDom = 'allowed'; } catch { report.parentDom = 'blocked'; }
try { localStorage.setItem('stolen', 'yes'); report.storage = 'allowed'; } catch { report.storage = 'blocked'; }
try { await fetch('/__forbidden'); report.fetch = 'allowed'; } catch { report.fetch = 'blocked'; }
try { await import('/__script.js'); report.externalScript = 'allowed'; } catch { report.externalScript = 'blocked'; }
report.variable = await getVar('player.hp');
for (const method of ['getWorldbook','createWorldbook','getChatMessages']) {
  try { await window[method](0); report[method] = 'unexpected-success'; } catch(error) { report[method] = error.message; }
}
report.done = true;
`;
const panel = '<!doctype html><html><body><output id="state">waiting</output><script>eventOn("era:writeDone", data => { document.querySelector("#state").textContent = data.stat.player.hp; });</script></body></html>';
const fixture = `
import {createApp,h,reactive} from 'vue';
import Panel from '/src/client/components/chat/SandboxedHtml.vue';
import Runner from '/src/client/components/chat/EraScriptRunner.vue';
import {initEraBridge,eraVariables} from '/src/client/utils/era-bridge.ts';
const state = reactive({chatId:'first',variables:{'player.hp':'77'}});
window.fixture = state;
window.bridgeVariables = eraVariables;
initEraBridge('first');
createApp({render:()=>h('main',[
 h('section',{id:'static'},[h(Panel,{html:'<!doctype html><html><body><b>static panel</b><script>document.body.dataset.ran="yes"</script><img src="/__image"></body></html>'})]),
 h('section',{id:'panel'},[h(Panel,{html:${JSON.stringify(panel)},interactive:true,variables:state.variables})]),
 h(Runner,{scripts:[{name:'owned-test',enabled:true,type:'script',content:${JSON.stringify(probe)}}],charName:'Owned test',userName:'Tester',chatId:state.chatId})
])}).mount('#app');
`;
let forbiddenRequests = 0;
const server = await createServer({
  configFile: false, root: process.cwd(), envFile: false,
  plugins: [vue(), { name: 'owned-card-fixture',
    resolveId(id) { if (id === '/__fixture.js') return '\0card-fixture'; },
    load(id) { if (id === '\0card-fixture') return fixture; },
    configureServer(instance) {
    instance.middlewares.use((request, response, next) => {
      if (request.url === '/__fixture') { response.setHeader('Content-Type', 'text/html'); response.end('<div id="app"></div><script type="module" src="/__fixture.js"></script>'); }
      else if (request.url?.startsWith('/__forbidden') || request.url?.startsWith('/__image') || request.url?.startsWith('/__script')) { forbiddenRequests++; response.end('unexpected'); }
      else next();
    });
  } }],
  resolve: { alias: { '@client': resolve('src/client'), '@': resolve('src') } },
  server: { host: '127.0.0.1', port: 55443, strictPort: true, hmr: false },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => { pageErrors.push(error.message); console.error('Browser:', error.message); });
  await page.route('**/api/v1/chats/*/variables', route => route.fulfill({ json: { success: true, data: { variables: { 'player.hp': route.request().url().includes('/first/') ? '77' : '44' } } } }));
  await page.goto('http://127.0.0.1:55443/__fixture');
  await expect(page.locator('#static iframe')).toHaveAttribute('sandbox', '');
  await expect(page.frameLocator('#static iframe').locator('body')).not.toHaveAttribute('data-ran', 'yes');
  await expect(page.locator('#static')).toContainText('静态预览');
  checks.push('Actual SandboxedHtml static mode renders markup, blocks inline script and labels inactive author controls');
  await expect(page.frameLocator('#panel iframe').locator('#state')).toHaveText('77');
  await page.evaluate(() => { window.fixture.variables = { 'player.hp': '66' }; });
  await expect(page.frameLocator('#panel iframe').locator('#state')).toHaveText('66');
  checks.push('Actual interactive panel receives initial and updated variables through the bounded display bridge');
  const runner = await (await page.locator('.era-script-runner iframe').elementHandle()).contentFrame();
  await expect.poll(() => runner.evaluate(() => window.report?.done), { timeout: 15000 }).toBe(true);
  const report = await runner.evaluate(() => window.report);
  assert.deepEqual([report.parentDom, report.storage, report.fetch, report.externalScript, report.variable], ['blocked', 'blocked', 'blocked', 'blocked', '77']);
  for (const method of ['getWorldbook', 'createWorldbook', 'getChatMessages']) assert.match(report[method], /UNSUPPORTED_API/);
  assert.equal(forbiddenRequests, 0);
  checks.push('Actual EraScriptRunner opaque iframe denies parent DOM/storage and fetch; getVar reads scoped server data; unavailable APIs reject explicitly');
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/api/v1/chats/first/variables', async route => {
    requested = true;
    await held;
    await route.fulfill({ json: { success: true, data: { variables: { 'player.hp': 'OLD_RESPONSE' } } } });
  });
  await runner.evaluate(() => { void getVar('player.hp').catch(() => {}); eventEmit('era:forceSync'); });
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => { window.fixture.chatId = 'second'; });
  await expect.poll(() => page.evaluate(() => window.bridgeVariables.value['player.hp'])).toBe('44');
  release();
  await expect.poll(() => page.evaluate(() => window.bridgeVariables.value['player.hp'])).toBe('44');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidence}/sandbox-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(pageErrors, []);
  checks.push('Changed chat reloads the bridge from its own server scope; narrow viewport has no horizontal overflow or page errors');
  const sources = {};
  for (const path of ['src/client/components/chat/EraScriptRunner.vue', 'src/client/components/chat/SandboxedHtml.vue', 'src/client/utils/card-sandbox.ts', 'src/client/utils/sillytavern-shim.ts', 'src/client/utils/era-bridge.ts', 'scripts/card-sandbox-check.mjs']) sources[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  await writeFile(`${evidence}/report.json`, JSON.stringify({ date: new Date().toISOString(), result: 'passed', checks, sources, limits: ['Owned synthetic scripts only; no third-party author code executed', 'Component harness, not deployed candidate verification', 'Opaque iframe/CSP do not establish arbitrary-script resource or navigation containment', 'Legacy writes are transient; frozen stories do not execute author scripts'] }, null, 2));
  console.info(`PASS: ${checks.length} browser groups; ${evidence}/report.json`);
} finally {
  await browser?.close();
  await server.close();
}
