import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import WebSocket from 'ws';

const databaseUrl = new URL(process.env.DATABASE_URL || 'http://missing');
const redisUrl = new URL(process.env.REDIS_URL || 'http://missing');
assert.equal(databaseUrl.pathname, '/squaretable_beta_test', 'Use the disposable squaretable_beta_test database');
assert.ok(['localhost', '127.0.0.1'].includes(databaseUrl.hostname));
assert.equal(redisUrl.port, '55449', 'Use the isolated Redis on port 55449');
assert.ok(['localhost', '127.0.0.1'].includes(redisUrl.hostname));

const sql = postgres(databaseUrl.toString(), { max: 1 });
const log = await open('/tmp/squaretable-beta-smoke-server.log', 'w', 0o600);
let identityPromptChecks = 0;
let streamCount = 0;
const contextRequests = [];
const realIntentReplay = process.env.STORY_INTENT_CHECK === '1'
  ? JSON.parse(await readFile('docs/deployment/evidence/story-intent-04d-model.json', 'utf8')).calls.find(call => call.kind === 'refusal-and-off-menu') : null;
const firstTaskDisplayReplay = process.env.STORY_FIRST_TASK_GAMEPLAY_CHECK === '1' && process.env.STORY_FIRST_TASK_DISPLAY_REPLAY
  ? JSON.parse(await readFile(process.env.STORY_FIRST_TASK_DISPLAY_REPLAY, 'utf8')).turns[3].reply : null;
if (firstTaskDisplayReplay) assert.equal(typeof firstTaskDisplayReplay.content, 'string');
const provider = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const input = JSON.parse(raw || '{}');
  if (request.url?.endsWith('/models')) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: [{ id: 'beta-smoke' }] }));
    return;
  }
  if (!input.stream) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 } }));
    return;
  }
  const content = JSON.stringify(input.messages);
  if (process.env.EXP02_CHECK === '1' || process.env.STORY_INTENT_CHECK === '1' || process.env.STORY_OPENING_CHECK === '1') contextRequests.push(input);
  streamCount++;
  const effects = process.env.STORY_EFFECTS_CHECK === '1' && content.includes('EFFECTS_CARD');
  const effectsSecond = effects && content.includes('EFFECTS_SECOND');
  const lastUser = input.messages.filter(message => message.role === 'user').at(-1)?.content ?? '';
  if (effectsSecond && lastUser.includes('EFFECTS_FAIL')) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Controlled second character failure' } }));
    return;
  }
  if (process.env.EXPLORATION_CONTEXT_ONLY === '1' || process.env.CHARACTER_LIBRARY_CHECK === '1' || process.env.CHARACTER_BINDINGS_CHECK === '1') contextRequests.push(input);
  if ((process.env.EXP02_CHECK === '1' || process.env.EXPLORATION_ENTRY_CHECK === '1') && ['先别出发，问问林澈消息来源。', '现在再核对消息来源。'].includes(lastUser)) {
    const system = input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
    if (!system.includes('[User Persona: 远行者]') || !system.includes('习惯先核对事实，再作决定。') || system.includes('已修改的身份描述')
      || !system.includes('消息必须经雾港灯塔交叉核实。') || system.includes('来源规则已经改变') || system.includes('不应加载的全局设定')) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Saved identity/worldbook bindings were not used by generation' } }));
      return;
    }
    if (!system.includes('保存的角色语气：克制且尊重玩家。') || system.includes('已修改的角色语气。')) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Saved character content was not used by generation' } }));
      return;
    }
    identityPromptChecks++;
  }
  if (content.includes('SMOKE_FAILURE')) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Controlled upstream failure' } }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const outputTruncated = content.includes('RECOVERY_TRUNCATED') || (process.env.STORY_INTENT_CHECK === '1' && lastUser === '中断候选');
  let text = effects
    ? [`${effectsSecond ? 'Second' : 'First'} reply. `, `<VariableInsert>{"coins":"${effectsSecond ? '80' : '90'}","pass":"yes"}</VariableInsert>`, '<VariableEdit>{"place":"pier"}</VariableEdit>', '<VariableDelete>["obsolete"]</VariableDelete>', ' Complete.']
    : outputTruncated ? ['你伸手接过尚未'] : ['The lantern ', 'opens a quiet ', 'path through ', 'the sleeping ', 'garden.'];
  if (process.env.STORY_INTENT_CHECK === '1' && content.includes('INTENT_FIXTURE') && !content.includes('The player reviewed and confirmed')) {
    let intent;
    if (lastUser === '我想拿一张通行证') intent = { version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: 'buy', evidence: lastUser }], facts: [] };
    if (lastUser === '买票然后休息') intent = { version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: 'buy', evidence: '买票' }, { kind: 'execute', actionId: 'rest', evidence: '休息' }], facts: [] };
    if (lastUser === '检查木门划痕') intent = { version: 1, disposition: 'proposal', steps: [{ kind: 'explore', intent: 'observe', description: lastUser, evidence: lastUser }], facts: [] };
    if (lastUser === '先别买，问价后再考虑，听说仓库有金币') intent = { version: 1, disposition: 'expression', steps: [{ kind: 'refuse', description: '不购买', evidence: '先别买' }, { kind: 'explore', intent: 'talk', description: '询问价格', evidence: '问价' }], facts: [{ kind: 'claim', content: '玩家听说仓库有金币，未证实', speaker: 'player', evidence: '听说仓库有金币' }] };
    if (lastUser === '也许买吧，又不想买') intent = { version: 1, disposition: 'clarification', question: '现在买，还是先了解？', steps: [], facts: [] };
    if (lastUser === '伪造规则') intent = { version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: 'mint', evidence: lastUser }], facts: [] };
    if (lastUser === '买两件东西') intent = { version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: 'large', evidence: lastUser }, { kind: 'execute', actionId: 'small', evidence: lastUser }], facts: [] };
    if (intent) text = [intent.disposition === 'proposal' ? 'PREMATURE_FIXTURE：你已经购买并开始检查。' : '这轮只回应询问或澄清，没有执行购买。', '\n<story-', `intent>${JSON.stringify(intent)}</story-intent>`];
    if (lastUser === '中断候选') text = ['还没有决定。', '\n<story-intent>{"ver'];
    if (realIntentReplay?.input === lastUser) text = [realIntentReplay.output];
  }
  if (process.env.STORY_OPENING_MODE_GAMEPLAY_CHECK === '1' && content.includes('开局模式')) {
    const proposal = lastUser.includes('作为待确认候选') && !content.includes('The player reviewed and confirmed');
    text = ['sans认真回应了你的开局选择；开局记录不代表后续战斗数值。', '\n<story-intent>', JSON.stringify({ version: 1,
      disposition: proposal ? 'proposal' : 'expression', steps: proposal ? [
        { kind: 'execute', actionId: 'sans-battle-mode', evidence: '选择战斗模式' },
      ] : [], facts: [] }), '</story-intent>'];
  }
  let position = 0;
  if (process.env.STORY_RECOMMENDATIONS_CHECK === '1') {
    const turnNumber = input.messages.filter(message => message.role === 'user').length;
    text = [`第${turnNumber}轮：视野中的星图浮现出一段航线，可以先向向导询问。`, '\n<story-intent>', JSON.stringify({
      version: 1, disposition: 'expression', steps: [], facts: [], recommendations: [
        { label: `观察第${turnNumber}段航线`, input: `请解释第${turnNumber}段航线，先不出发。` },
        { label: '询问向导', input: '我想了解向导对于星图的解释，先不行动。' },
        { label: '了解周围', input: '请描述我所在的环境，先不移动。' },
      ],
    }), '</story-intent>'];
  }
  if (process.env.STORY_RITUAL_GAMEPLAY_CHECK === '1' && content.includes('[Reviewed end-of-turn rule]')) {
    const proposal = lastUser.includes('作为待确认候选') && !content.includes('The player reviewed and confirmed');
    text = ['咔咔认真听着，等待你的决定。', '\n<story-intent>', JSON.stringify({ version: 1,
      disposition: proposal ? 'proposal' : 'expression', steps: proposal ? [
        { kind: 'explore', intent: 'act', description: '在纸上画一个圆', evidence: '在纸上画一个圆' },
      ] : [], facts: [] }), '</story-intent>'];
  }
  if (process.env.STORY_FIRST_TASK_GAMEPLAY_CHECK === '1' && content.includes('首次踏步任务')) {
    const proposal = lastUser.includes('作为待确认候选') && !content.includes('The player reviewed and confirmed');
    const explanation = lastUser.includes('请简短解释为什么');
    text = [explanation ? firstTaskDisplayReplay?.content ?? '任务要求**连续**踏步，中途不能休息。' : '系统按已保存的首次任务记录回应。', '\n<story-intent>', JSON.stringify({ version: 1,
      disposition: proposal ? 'proposal' : 'expression', steps: proposal ? [
        { kind: 'execute', actionId: 'complete-first-stepping', evidence: '在房间内连续原地踏步10分钟，中途不休息' },
      ] : [], facts: explanation ? [
        { kind: 'claim', content: '要求连续踏步', speaker: 'character', evidence: '任务要求连续踏步' },
        ...(firstTaskDisplayReplay ? firstTaskDisplayReplay.extra.storyFacts ?? [] : [
          { kind: 'claim', content: '中途不能休息', speaker: 'character', evidence: '中途不能休息' },
        ]),
      ] : [] }), '</story-intent>'];
  }
  const timer = setInterval(() => {
    if (position < text.length) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text[position++] }, finish_reason: null }] })}\n\n`);
    } else {
      response.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: outputTruncated ? 'length' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })}\n\ndata: [DONE]\n\n`);
      clearInterval(timer);
    }
  }, effectsSecond && lastUser.includes('EFFECTS_SLOW') ? 700 : input.messages.at(-1)?.content?.includes('RECOVERY_SLOW') ? 1000 : 100);
  response.on('close', () => clearInterval(timer));
});
provider.listen(0, '127.0.0.1');
await once(provider, 'listening');
const providerPort = provider.address().port;
const port = Number(process.env.BETA_SMOKE_PORT || 55441);
const base = `http://127.0.0.1:${port}`;
const serviceEnvironment = {
  ...(process.env.STORY_ADAPTER_CHECK === '1' ? { STORY_MEMORY_JOBS_ENABLED: 'false', STORY_ADAPTER_JOBS_ENABLED: 'false' } : {}),
  ...(process.env.STORY_CORRECTIONS_CHECK === '1' ? { STORY_MEMORY_JOBS_ENABLED: 'false' } : {}),
    DATABASE_URL: databaseUrl.toString(), REDIS_URL: redisUrl.toString(),
    NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
    JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'), PLATFORM_DAILY_TOKEN_LIMIT: '100000',
    BILLING_MODE: 'credits', MODULES_ENABLED: '', NSFW_ENABLED: 'false', SENTRY_DSN: '',
    APP_URL: base, CORS_ORIGINS: base, SMTP_HOST: '127.0.0.1', SMTP_PORT: '1',
    OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', OLLAMA_BASE_URL: '',
    STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
    CUSTOM_LLM_API_KEY: 'isolated-smoke', CUSTOM_LLM_BASE_URL: `http://127.0.0.1:${providerPort}/v1`,
    CUSTOM_LLM_MODELS: 'beta-smoke', CUSTOM_LLM_DEFAULT_MODEL: 'beta-smoke',
    ...(process.env.EXP02_CHECK === '1' ? { CUSTOM_LLM_MODEL_LIMITS: JSON.stringify({ 'beta-smoke': { contextWindow: 32768, maxOutputTokens: 2048, requestOutputTokens: 2048 } }) } : {}),
    ...(process.env.EXPLORATION_CONTEXT_ONLY === '1' || process.env.EXPLORATION_MEMORY_ONLY === '1' || process.env.CHARACTER_LIBRARY_CHECK === '1' || process.env.CHARACTER_BINDINGS_CHECK === '1' ? { STORY_MEMORY_JOBS_ENABLED: 'false' } : {}),
};
const image = process.env.BETA_SMOKE_IMAGE;
const containerName = `squaretable-beta-smoke-${randomUUID()}`;
let environmentDirectory;
let command = process.execPath;
let argumentsList = ['dist/server/index.js'];
if (image) {
  environmentDirectory = await mkdtemp(join(tmpdir(), 'squaretable-beta-smoke-'));
  const environmentPath = join(environmentDirectory, 'runtime.env');
  await writeFile(environmentPath, Object.entries(serviceEnvironment).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
  command = 'docker';
  argumentsList = ['run', '--rm', '--network', 'host', '--name', containerName, '--env-file', environmentPath, image];
}
let server = spawn(command, argumentsList, {
  env: { ...process.env, ...serviceEnvironment },
  stdio: ['ignore', log.fd, log.fd],
});
async function restartServer() {
  assert.ok(!image, 'Restart checks require the isolated local process');
  const ended = once(server, 'exit');
  server.kill('SIGTERM');
  await ended;
  server = spawn(command, argumentsList, { env: { ...process.env, ...serviceEnvironment }, stdio: ['ignore', log.fd, log.fd] });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).status === 200) return; } catch {}
    assert.equal(server.exitCode, null);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Isolated service failed to restart');
}
let socket;
let token;
let csrf;
let tenantId;
const suffix = randomUUID();
async function api(pathname, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await fetch(`${base}/api/v1${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${pathname}: ${JSON.stringify(result)}`);
  return result.data ?? result;
}
try {
  const deadline = Date.now() + 20000;
  while (true) {
    try {
      assert.equal((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(2000) })).status, 200);
      break;
    } catch {
      assert.ok(server.exitCode === null && Date.now() < deadline, 'Server failed readiness; inspect /tmp/squaretable-beta-smoke-server.log');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  const invite = `BETA-${suffix}`.toUpperCase();
  await sql`INSERT INTO invite_codes (code, max_uses) VALUES (${invite}, 1)`;
  const auth = await api('/auth/register', { email: `${suffix}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invite }, 'POST', 201);
  token = auth.tokens.accessToken;
  tenantId = auth.user.tenantId;
  csrf = (await api('/csrf-token')).csrfToken;
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${auth.user.tenantId}, 'topup', 100000)`;
  const character = await api('/characters', { name: 'The Lantern Room', description: 'An isolated release check.', cardData: { name: 'Mara', first_mes: 'The lantern is waiting.', personality: 'Quiet and kind.' } }, 'POST', 201);
  const requestId = randomUUID();
  const input = { characterId: character.id, clientRequestId: requestId };
  const chat = await api('/chats', input, 'POST', 201);
  assert.equal((await api('/chats', input)).id, chat.id);
  assert.equal((await api(`/chats/creation-requests/${requestId}`)).chatId, chat.id);
  const deepLink = await fetch(`${base}/chat/${chat.id}`, { headers: { Accept: 'text/html' } });
  assert.equal(deepLink.status, 200);
  assert.match(deepLink.headers.get('Content-Type'), /text\/html/);
  assert.equal((await fetch(`${base}/story-experience-demo.html`)).status, 404);

  const events = [];
  socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws?token=${encodeURIComponent(token)}`);
  socket.on('message', raw => events.push(JSON.parse(raw.toString())));
  async function waitFor(predicate) {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const event = events.find(predicate);
      if (event) return event;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`WebSocket timeout: ${events.map(event => event.type).join(',')}`);
  }
  const send = (type, data) => socket.send(JSON.stringify({ type, timestamp: new Date().toISOString(), data }));
  await waitFor(event => event.type === 'connected');
  send('join_chat', { chatId: chat.id });
  const generationId = randomUUID();
  send('user_message', { chatId: chat.id, content: 'Open the lantern.', clientMessageId: generationId });
  const finished = await waitFor(event => event.type === 'generation_finished' && event.data.requestId === generationId);
  assert.equal(finished.data.status, 'completed');
  const ledger = await api('/credits/ledger');
  assert.equal(ledger.items.filter(item => item.kind === 'charge').length, 1);
  assert.equal(ledger.items.find(item => item.kind === 'charge').tokens, -120);
  assert.equal((await api('/credits/balance')).heldTokens, 0);
  send('user_message', { chatId: chat.id, content: 'Open the lantern.', clientMessageId: generationId });
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal((await api('/credits/ledger')).items.filter(item => item.kind === 'charge').length, 1);

  const [otherTenant] = await sql`INSERT INTO tenants (name) VALUES ('Isolated ledger visibility check') RETURNING id`;
  try {
    await sql`INSERT INTO credit_ledger (tenant_id, kind, amount, chat_id) VALUES (${otherTenant.id}, 'charge', -999999, ${chat.id})`;
    const scoped = await api(`/credits/ledger?chatId=${chat.id}`);
    assert.equal(scoped.items.filter(item => item.kind === 'charge').length, 1);
    assert.ok(scoped.items.every(item => item.chatId === chat.id && item.tokens !== -999999));
    assert.equal((await api(`/credits/ledger?chatId=${randomUUID()}`)).items.length, 0);
  } finally {
    await sql`DELETE FROM tenants WHERE id = ${otherTenant.id}`;
  }

  events.length = 0;
  const stoppedId = randomUUID();
  const streamsBeforeStop = streamCount;
  send('user_message', { chatId: chat.id, content: 'Wait at the gate.', clientMessageId: stoppedId });
  await waitFor(() => streamCount > streamsBeforeStop);
  await new Promise(resolve => setTimeout(resolve, 180));
  send('abort_generation', { chatId: chat.id, requestId: stoppedId });
  assert.equal((await waitFor(event => event.type === 'generation_finished' && event.data.requestId === stoppedId)).data.status, 'stopped');
  assert.equal((await api('/credits/balance')).heldTokens, 0);

  if (process.env.BETA_SMOKE_BROWSER === '1') {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ accessToken, refreshToken, owner }) => {
        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('tenantId', owner);
        localStorage.setItem('locale', 'zh-CN');
      }, { accessToken: token, refreshToken: auth.tokens.refreshToken, owner: tenantId });
      await page.goto(`${base}/chat/${chat.id}`);
      try { await page.locator('.story-credits strong').waitFor(); }
      catch (failure) {
        await page.screenshot({ path: '/tmp/squaretable-reader-failure.png', fullPage: true });
        console.error('Reader browser errors:', JSON.stringify(errors));
        throw failure;
      }
      assert.match(await page.locator('.story-credits').innerText(), /此故事最近一次消费/);
      await mkdir('/tmp/squaretable-beta-screenshots', { recursive: true });
      for (const [width, height] of [[390, 844], [768, 1024], [1440, 1000]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(() => {
          const main = document.querySelector('.exploration-play')?.getBoundingClientRect();
          const reader = document.querySelector('.story-reading')?.getBoundingClientRect();
          return main && reader && main.left >= 0 && main.width >= innerWidth - 1 && reader.width > 300 && !document.querySelector('#chat-sidebar-drawer');
        });
        for (const theme of ['light', 'dark']) {
          await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px ${theme}`);
          assert.ok(await page.evaluate(() => {
            const title = document.querySelector('.chat-info')?.getBoundingClientRect();
            const actions = document.querySelector('.reading-settings > summary')?.getBoundingClientRect();
            return title && actions && title.width >= 120 && (title.right <= actions.left + 1 || title.bottom <= actions.top + 1);
          }), `Story title and tools overlap at ${width}px ${theme}`);
          await page.screenshot({ path: `/tmp/squaretable-beta-screenshots/reader-${width}-${theme}.png`, fullPage: true });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.dossier-toggle').click();
      await page.locator('.dossier-body').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('.dossier-body').waitFor({ state: 'hidden' });
      const before = (await api('/credits/ledger')).items.filter(item => item.kind === 'charge').length;
      await page.locator('textarea').fill('Continue beside the lantern.');
      await page.locator('textarea').press('Enter');
      const deadline = Date.now() + 20000;
      while ((await api('/credits/ledger')).items.filter(item => item.kind === 'charge').length === before) {
        assert.ok(Date.now() < deadline, 'Browser generation was not settled');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await page.locator('textarea').waitFor({ state: 'visible' });
      await page.reload();
      await page.locator('.story-credits strong').waitFor();
      assert.ok(await page.getByText('Continue beside the lantern.', { exact: true }).count() > 0);
      await page.locator('.story-credits a').click();
      await page.locator('.credits-ledger').waitFor();
      assert.ok(await page.locator('.credits-ledger a').count() > 0);
      assert.deepEqual(errors, []);
      console.info('Production browser passed: real API/auth/WebSocket, mobile send/settlement/reload, credit ledger links, 390/768/1440 light/dark layouts');
    } finally {
      await browser.close();
    }
  }

  events.length = 0;
  const failedId = randomUUID();
  send('user_message', { chatId: chat.id, content: 'SMOKE_FAILURE', clientMessageId: failedId });
  assert.equal((await waitFor(event => event.type === 'generation_finished' && event.data.requestId === failedId)).data.status, 'failed');
  assert.equal((await api('/credits/balance')).heldTokens, 0);
  const [stored] = await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id = ${chat.id} AND role = 'assistant'`;
  assert.ok(stored.count >= 2, 'Completed and interrupted output must be persisted');
  console.info('Beta smoke passed: readiness, invite signup, CSRF, character, idempotent creation/recovery, deep link, streaming, settlement/replay, tenant/story ledger isolation, stop/partial persistence, failure/hold release');
  if (process.env.EXP02_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkExp02 } = await import('./exp02-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkExp02({ browser, base, sql, auth, csrf, serviceEnvironment, getStreamCount: () => streamCount, getRequests: () => contextRequests, getIdentityPromptChecks: () => identityPromptChecks }); }
    finally { await browser.close(); }
  }
  if (process.env.STORY_ADAPTER_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkStoryAdapter } = await import('./story-adapter-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkStoryAdapter({ browser, base, sql, auth, csrf, serviceEnvironment, restartServer, getStreamCount: () => streamCount }); }
    finally { await browser.close(); }
  }
  if (process.env.STORY_CORRECTIONS_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const check = process.env.STORY_TRANSACTIONS_ONLY === '1'
      ? (await import('./story-transaction-check.mjs')).checkStoryTransactions
      : (await import('./story-corrections-check.mjs')).checkStoryCorrections;
    const browser = await chromium.launch({ headless: true });
    try { await check({ browser, base, sql, auth, csrf, serviceEnvironment, restartServer, getStreamCount: () => streamCount }); }
    finally { await browser.close(); }
  }
  if (process.env.STORY_OVERVIEW_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkStoryOverview } = await import('./story-overview-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkStoryOverview({ browser, base, sql, auth, csrf, serviceEnvironment, getStreamCount: () => streamCount }); }
    finally { await browser.close(); }
  }
  if (process.env.ACCOUNT_ACTIVITY_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkAccountActivity } = await import('./account-activity-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkAccountActivity({ browser, base, sql, getStreamCount: () => streamCount }); }
    finally { await browser.close(); }
  }
  if (process.env.STORY_OPENING_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkStoryOpeningPreparation } = await import('./story-opening-browser-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkStoryOpeningPreparation({ browser, base, sql, auth, csrf, getStreamCount: () => streamCount, getRequests: () => contextRequests }); }
    finally { await browser.close(); }
  }
  if (process.env.STORY_INTENT_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkStoryIntent } = await import('./story-intent-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkStoryIntent({ browser, base, sql, auth, csrf, restartServer, contextRequests, serviceEnvironment }); }
    finally { await browser.close(); }
  }
  if (process.env.STORY_EFFECTS_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkStoryEffects } = await import('./story-effects-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try {
      await checkStoryEffects({ browser, base, sql, auth, csrf, restartServer, getStreamCount: () => streamCount, serviceEnvironment });
      const { checkExplorationRecovery } = await import('./exploration-recovery-check.mjs');
      await checkExplorationRecovery({ browser, base, sql, getStreamCount: () => streamCount });
    }
    finally { await browser.close(); }
  }
  if (process.env.CHARACTER_LIBRARY_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkCharacterLibrary } = await import('./character-library-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkCharacterLibrary({ browser, base, sql, getRequests: () => contextRequests, restartServer }); }
    finally { await browser.close(); }
  }
  if (process.env.CHARACTER_BINDINGS_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkWorldbookBindings } = await import('./worldbook-bindings-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkWorldbookBindings({ browser, base, sql, getRequests: () => contextRequests }); }
    finally { await browser.close(); }
  }
  if (process.env.CSRF_SESSION_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkCsrfSessions } = await import('./csrf-session-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkCsrfSessions({ browser, base, sql }); }
    finally { await browser.close(); }
  }
  if (process.env.EXPLORATION_ENTRY_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkExplorationEntry } = await import('./exploration-entry-browser-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try {
      if (process.env.EXPLORATION_MEMORY_ONLY === '1') {
        const { checkStoryMemoryUI } = await import('./story-memory-browser-check.mjs');
        await checkStoryMemoryUI({ browser, base, sql, getStreamCount: () => streamCount });
      } else if (process.env.EXPLORATION_CONTEXT_ONLY === '1') {
        const { checkStoryContext } = await import('./story-context-browser-check.mjs');
        await checkStoryContext({ browser, base, sql, getRequests: () => contextRequests });
      } else {
        if (process.env.EXPLORATION_RECOVERY_ONLY !== '1') await checkExplorationEntry({ browser, base, sql, getIdentityPromptChecks: () => identityPromptChecks });
        const { checkExplorationRecovery } = await import('./exploration-recovery-check.mjs');
        await checkExplorationRecovery({ browser, base, sql, getStreamCount: () => streamCount });
      }
    } finally {
      await browser.close();
    }
  }
  if (process.env.CREATOR_ACCOUNT_CHECK === '1') {
    const { chromium } = await import('@playwright/test');
    const { checkCreatorAccount } = await import('./creator-account-check.mjs');
    const browser = await chromium.launch({ headless: true });
    try { await checkCreatorAccount({ browser, base, sql, getStreamCount: () => streamCount }); }
    finally { await browser.close(); }
  }
  if (process.env.CHARACTER_LEGACY_CHECK === '1') {
    const { checkCharacterLegacy } = await import('./character-legacy-check.mjs');
    await checkCharacterLegacy({ sql, api, user: auth.user, getStreamCount: () => streamCount });
  }
} finally {
  socket?.terminate();
  if (image) {
    const stop = spawn('docker', ['stop', '--time', '10', containerName], { stdio: 'ignore' });
    await once(stop, 'exit');
  } else {
    server.kill('SIGTERM');
  }
  if (server.exitCode === null && server.signalCode === null) await once(server, 'exit');
  provider.closeAllConnections();
  provider.close();
  await sql.end();
  await log.close();
  if (environmentDirectory) await rm(environmentDirectory, { recursive: true });
}
