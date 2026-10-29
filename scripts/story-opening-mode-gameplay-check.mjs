import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import WebSocket from 'ws';
import { expect } from '@playwright/test';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

export async function checkOpeningModeGameplay({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  assert.equal(base, 'http://127.0.0.1:55441');
  const settings = process.env.OPENING_MODE_GAMEPLAY_GATEWAY_CONFIG
    ? parse(await readFile(process.env.OPENING_MODE_GAMEPLAY_GATEWAY_CONFIG)) : null;
  const initial = settings ? await requireEngineeringGateway(settings) : null;
  if (initial) {
    assert.equal(initial.batch.requests, 0);
    assert.equal(initial.batch.maxRequests, 4);
    assert.ok(initial.batch.maxTokens <= 160000);
  }
  const report = { mode: settings ? 'live-model-websocket' : 'controlled-websocket', result: 'started',
    batchId: initial?.batch.id ?? null, turns: [], screenshots: [],
    limits: ['One reviewed card and four short replies; not long-term or full AD-5 acceptance',
      'Opening records only, not current level, combat, health, experience or map', 'Isolated user; no production stories or balance changes'] };
  const save = () => writeFile(`${directory}/opening-mode-gameplay-private.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  const previousEnvironment = { ...serviceEnvironment };
  const sockets = [];
  async function settledGateway() {
    const deadline = Date.now() + 5000;
    while (true) {
      try { return await requireEngineeringGateway(settings); }
      catch (error) {
        if (error.code !== 'ENGINEERING_GATEWAY_RECONCILIATION_REQUIRED' || Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  try {
    await save();
    const file = process.env.OPENING_MODE_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/已分类/2025年3月前/正常向(不分类)/sans.png';
    const bytes = await readFile(file);
    report.originalSha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(report.originalSha256, '297188b16b6fe4754ca4d9595711b6b67eae46595110f68b0703fd47ca8c1e19');
    const form = new FormData(); form.append('files', new Blob([bytes]), 'sans.png');
    const imported = await api('/characters/import/batch', form);
    assert.equal(imported.failed.length, 0);
    const characterId = imported.imported[0].id;
    const original = (await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data;
    const jobs = await loader.import('../src/server/services/story-adapter-jobs.service.ts', import.meta.url);
    const job = await jobs.createAdapterJob(characterId, auth.user.id, auth.user.tenantId, randomUUID(), database);
    await jobs.runNextAdapterJob(database);
    assert.equal((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${job.id}`)[0].artifact?.reason, 'reviewed-opening-mode');
    const profile = await api(`/characters/${characterId}/story-entry`);
    assert.deepEqual(profile.openings.map(opening => opening.kind), ['directory', 'narrative']);
    const story = await api('/chats', { characterId, clientRequestId: randomUUID(), opening: {
      characterId, revision: profile.revision, reference: { source: 'alternate_greetings', index: 0 }, reviewed: false,
    } }, 201);
    report.storyId = story.id;
    const frozen = (await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot;
    const capturesDirectory = resolve(directory, 'provider-capture');
    await mkdir(capturesDirectory, { mode: 0o700 });
    serviceEnvironment.RITUAL_GAMEPLAY_CAPTURE_DIRECTORY = capturesDirectory;
    serviceEnvironment.NODE_OPTIONS = `--import=${resolve('scripts/ritual-gameplay-capture.mjs')}`;
    if (settings) {
      for (const key of ['CUSTOM_LLM_API_FORMAT', 'CUSTOM_LLM_BASE_URL', 'CUSTOM_LLM_API_KEY', 'CUSTOM_LLM_MODELS', 'CUSTOM_LLM_DEFAULT_MODEL']) {
        assert.equal(typeof settings[key], 'string'); serviceEnvironment[key] = settings[key];
      }
      serviceEnvironment.CUSTOM_LLM_MODEL_LIMITS = settings.CUSTOM_LLM_MODEL_LIMITS || '';
    } else serviceEnvironment.CUSTOM_LLM_MODEL_LIMITS = JSON.stringify({ 'beta-smoke': {
      contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 4096,
    } });
    await restartServer();
    const state = chatId => api(`/chats/${chatId}/story-state`);
    const values = view => Object.fromEntries(view.fields.map(field => [field.id, field.value]));
    const pending = { 'sans-mode': '未选择' };
    const battle = { 'sans-mode': '战斗模式', 'sans-opening-lv': 19, 'sans-opening-location': '审判长廊' };
    const peaceful = { 'sans-mode': '剧情模式', 'sans-opening-lv': 0 };
    assert.deepEqual(values(await state(story.id)), pending);
    async function turn(chatId, input, expectedStatus, expectedValues, storyAction) {
      if (settings) assert.equal((await settledGateway()).batch.requests, report.turns.length);
      const socket = new WebSocket(`${base.replace('http:', 'ws:')}/ws?token=${encodeURIComponent(auth.tokens.accessToken)}`);
      sockets.push(socket);
      const events = [];
      socket.on('message', raw => events.push(JSON.parse(raw.toString())));
      const send = (type, data) => socket.send(JSON.stringify({ type, timestamp: new Date().toISOString(), data }));
      const wait = async predicate => {
        const deadline = Date.now() + 100000;
        while (Date.now() < deadline) {
          const found = events.find(predicate);
          if (found) return found;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`Opening mode generation timeout: ${events.map(event => `${event.type}:${event.data?.status ?? event.data?.code ?? ''}`).join(',')}`);
      };
      await wait(event => event.type === 'connected');
      send('join_chat', { chatId });
      await wait(event => event.type === 'generation_state');
      const requestId = randomUUID();
      const entry = { chatId, input, requestId, status: 'pending' };
      report.turns.push(entry); await save();
      const data = { chatId, content: input, clientMessageId: requestId, ...(storyAction ? { storyAction } : {}) };
      send('user_message', data);
      const finished = await wait(event => event.type === 'generation_finished' && event.data.requestId === requestId);
      entry.transport = finished.data.status;
      entry.errors = events.filter(event => event.type === 'error').map(event => event.data);
      entry.reply = (await sql`SELECT id,content,extra FROM messages WHERE chat_id=${chatId} AND role='assistant'
        AND extra->>'storyRequestId'=${requestId} ORDER BY id DESC LIMIT 1`)[0] ?? null;
      entry.state = await state(chatId);
      await save();
      assert.equal(entry.transport, 'completed');
      assert.ok(entry.reply);
      assert.equal(entry.reply.extra.stateStatus, expectedStatus);
      assert.equal(entry.reply.extra.storyIntentInvalid, undefined);
      assert.deepEqual(values(entry.state), expectedValues);
      assert.equal(entry.state.map, null);
      assert.ok(!entry.reply.content.includes('<story-intent>'));
      assert.ok(!/(?:生命值|HP)\s*[:：]\s*\d|^\s*(?:\*\*)?Lv\s*[:：]\s*\d.*\d\s*\/\s*\d/imu.test(entry.reply.content), 'Unadapted live status panel in opening narration');
      const historyCount = Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chatId}`)[0].count);
      events.length = 0; send('user_message', data);
      await wait(event => ['generation_state', 'generation_finished'].includes(event.type) && event.data.requestId === requestId);
      assert.equal(Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chatId}`)[0].count), historyCount);
      if (settings) {
        report.gatewayAfter = await settledGateway();
        assert.equal(report.gatewayAfter.batch.requests, report.turns.length);
      }
      entry.status = 'verified'; await save();
      return entry.reply;
    }
    const question = '我只是引用“/战斗模式”这个指令来询问，不是在选择。请先简短说明两种开局的区别，暂不替我选模式，不推进战斗。';
    await turn(story.id, question, 'confirmed', pending);
    assert.equal((await state(story.id)).actions.length, 2);
    check('MG-01: quoted battle command remains an explanation with both opening choices available; duplicate request makes no extra generation');
    const candidate = '我想选择战斗模式，以Lv19进入审判长廊。请把这个选择作为待确认候选，先等我确认，不要开始战斗。';
    const proposal = await turn(story.id, candidate, 'proposed', pending);
    assert.deepEqual(proposal.extra.storyIntent.intent.steps.filter(step => step.kind === 'execute').map(step => step.actionId), ['sans-battle-mode']);
    assert.equal(proposal.content, '请核对下面的行动理解。确认后，故事才会继续这次行动。');
    check('MG-02: free-text battle selection becomes a sourced proposal without selecting a mode or publishing premature narration');
    await restartServer();
    assert.deepEqual(values(await state(story.id)), pending);
    await turn(story.id, candidate, 'confirmed', battle, { proposalMessageId: Number(proposal.id), expectedVersion: 2 });
    assert.deepEqual((await state(story.id)).actions, []);
    check('MG-03: explicit confirmation after restart records battle/Lv19/corridor once and removes both mutually exclusive choices');
    const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
    const corrections = new StoryCorrectionsService(database);
    const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: '这次改选剧情模式，以Lv0和平探索，不进入战斗。', evidenceIds: [] };
    const preview = await corrections.preview(story.id, auth.user.id, auth.user.tenantId, branchInput);
    const branch = await corrections.fork(story.id, auth.user.id, auth.user.tenantId, branchInput, preview.digest);
    report.branchId = branch.chat.id;
    assert.deepEqual(values(await state(branch.chat.id)), pending);
    await turn(branch.chat.id, '/剧情模式', 'confirmed', peaceful, { actionId: 'sans-story-mode', expectedVersion: 1 });
    assert.deepEqual((await state(branch.chat.id)).actions, []);
    assert.deepEqual(values(await state(story.id)), battle);
    await restartServer();
    assert.deepEqual(values(await state(story.id)), battle);
    assert.deepEqual(values(await state(branch.chat.id)), peaceful);
    check('MG-04: pre-choice branch selects story/Lv0 while parent remains battle/Lv19; both choices survive another restart');
    const captures = await Promise.all((await readdir(capturesDirectory)).map(async name => JSON.parse(await readFile(resolve(capturesDirectory, name)))));
    assert.equal(captures.length, 4);
    const conversations = captures.map(capture => capture.request.messages ?? [
      ...(capture.request.systemInstruction ? [{ role: 'system', content: capture.request.systemInstruction.parts.map(part => part.text ?? '').join('') }] : []),
      ...capture.request.contents.map(message => ({ role: message.role === 'model' ? 'assistant' : message.role,
        content: message.parts.map(part => part.text ?? '').join('') })),
    ]);
    for (const capture of captures) {
      const protectedContext = capture.request.systemInstruction?.parts.at(-1)?.text
        ?? capture.request.messages?.filter(message => message.role === 'system').at(-1)?.content;
      assert.ok(protectedContext?.startsWith('[Saved story continuity'));
      assert.ok(protectedContext.includes('【开局模式叙事边界】'));
      const requestText = JSON.stringify(capture.request);
      assert.ok(!requestText.includes('每个角色部分后所插入的角色最新状态栏'));
      assert.ok(!requestText.includes('invalid and must be ignored'));
    }
    const lastUser = messages => messages.filter(message => message.role === 'user').at(-1)?.content;
    const branchConversation = conversations.find(messages => lastUser(messages) === '/剧情模式');
    assert.ok(branchConversation?.some(message => message.role === 'user' && message.content === question));
    assert.ok(!branchConversation.some(message => message.role === 'user' && message.content === candidate));
    assert.ok(conversations.some(messages => lastUser(messages) === candidate
      && messages.some(message => message.content.includes('The player reviewed and confirmed'))));
    report.requestBytes = captures.map(capture => Buffer.byteLength(JSON.stringify(capture.request)));
    await page.goto(`${base}/health`);
    for (const chat of [story, branch.chat]) for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      await budget();
      await page.evaluate(value => localStorage.setItem('theme-preference', value), theme);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`${base}/chat/${chat.id}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      if (width === 390) await page.locator('.story-dossier .dossier-toggle').click();
      const dashboard = page.getByTestId('current-story-state');
      await expect(dashboard).toContainText(chat.id === story.id ? '战斗模式' : '剧情模式');
      await expect(dashboard).toContainText('开局Lv（不随经验更新）');
      await expect(dashboard).not.toContainText(chat.id === story.id ? '剧情模式' : '战斗模式');
      await expect(page.locator('.story-dossier .unsettled-events')).toHaveCount(0);
      const adaptation = page.getByTestId('saved-adaptation-report');
      await adaptation.locator(':scope > summary').click();
      await expect(adaptation).toContainText('显示的是开局记录');
      await expect(adaptation).toContainText('尚未适配');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const screenshot = `opening-mode-gameplay-${chat.id === story.id ? 'battle' : 'story'}-${width}-${theme}.png`;
      await page.screenshot({ path: `${directory}/${screenshot}`, fullPage: true, animations: 'disabled' });
      report.screenshots.push(screenshot);
    }
    check('MG-05: both persisted opening records and exclusions display across desktop/mobile and light/dark themes without more generation');
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data, original);
    assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${story.id}`)[0].snapshot, frozen);
    if (settings) { report.gatewayAfter = await settledGateway(); assert.equal(report.gatewayAfter.batch.requests, 4); }
    report.result = 'engineering-passed-semantic-review-required';
    return { ...report, turns: report.turns.map(({ reply, state: savedState, ...entry }) => ({ ...entry,
      stateVersion: savedState.version, values: values(savedState), replySha256: createHash('sha256').update(reply.content).digest('hex') })) };
  } catch (error) {
    report.result = 'failed'; report.failure = error.message; throw error;
  } finally {
    for (const socket of sockets) socket.close();
    await save();
    for (const key of Object.keys(serviceEnvironment)) delete serviceEnvironment[key];
    Object.assign(serviceEnvironment, previousEnvironment);
  }
}
