import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import WebSocket from 'ws';
import { expect } from '@playwright/test';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

export async function checkFirstTaskGameplay({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  assert.equal(base, 'http://127.0.0.1:55441');
  const settings = process.env.FIRST_TASK_GAMEPLAY_GATEWAY_CONFIG
    ? parse(await readFile(process.env.FIRST_TASK_GAMEPLAY_GATEWAY_CONFIG)) : null;
  const displayReplay = process.env.STORY_FIRST_TASK_DISPLAY_REPLAY
    ? JSON.parse(await readFile(process.env.STORY_FIRST_TASK_DISPLAY_REPLAY, 'utf8')).turns[3].reply.content : null;
  if (displayReplay) assert.equal(settings, null, 'Saved display replay must not use a paid gateway');
  const initial = settings ? await requireEngineeringGateway(settings) : null;
  if (initial) {
    assert.equal(initial.batch.requests, 0);
    assert.equal(initial.batch.maxRequests, 4);
    assert.ok(initial.batch.maxTokens <= 400000);
  }
  const report = { mode: settings ? 'live-model-websocket' : displayReplay ? 'saved-prose-controlled-websocket' : 'controlled-websocket', result: 'started',
    displayReplaySha256: displayReplay ? createHash('sha256').update(displayReplay).digest('hex') : null,
    batchId: initial?.batch.id ?? null, turns: [], screenshots: [],
    limits: ['One original card and four short replies; not full AD-3/AD-5 or long-term acceptance',
      'Earned reward is not total wallet; no real exercise timer, store or dynamic tasks', 'Isolated user only; no production stories or balance changes'] };
  const save = () => writeFile(`${directory}/first-task-gameplay-private.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
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
    const file = process.env.FIRST_TASK_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/大胃袋逆袭系统.png';
    const bytes = await readFile(file);
    report.originalSha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(report.originalSha256, 'fc31c5ef3dbfff378067963b81f2078fab0a48b98210d22b7e2edf087e8811de');
    const form = new FormData(); form.append('files', new Blob([bytes]), 'first-task.png');
    const imported = await api('/characters/import/batch', form);
    assert.equal(imported.failed.length, 0);
    const characterId = imported.imported[0].id;
    const original = (await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data;
    const jobs = await loader.import('../src/server/services/story-adapter-jobs.service.ts', import.meta.url);
    const job = await jobs.createAdapterJob(characterId, auth.user.id, auth.user.tenantId, randomUUID(), database);
    await jobs.runNextAdapterJob(database);
    assert.equal((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${job.id}`)[0].artifact?.reason, 'reviewed-first-task');
    const story = await api('/chats', { characterId, clientRequestId: randomUUID() }, 201);
    report.storyId = story.id;
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
      contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 2048,
    } });
    await restartServer();
    const state = chatId => api(`/chats/${chatId}/story-state`);
    const values = view => Object.fromEntries(view.fields.map(field => [field.id, field.value]));
    const pending = { 'first-task-status': '待完成', 'first-task-earned': 0 };
    const completed = { 'first-task-status': '已完成', 'first-task-earned': 2 };
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
        throw new Error(`First task generation timeout: ${events.map(event => `${event.type}:${event.data?.status ?? event.data?.code ?? ''}`).join(',')}`);
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
      assert.ok(!entry.reply.content.includes('<story-intent>'));
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
    await turn(story.id, '我只在房间里原地踏步了5分钟，中途休息了，还没有完成10分钟任务。先不要继续行动，请简短回应我的疑问：现在能领奖吗？', 'confirmed', pending);
    check('FG-01: incomplete interrupted activity stays pending with zero earned reward through actual WebSocket/commit; duplicate delivery makes no extra call');
    const candidate = '我准备在房间内连续原地踏步10分钟，中途不休息。请把这件完整行动作为待确认候选，先等我确认，不要替我执行。';
    const proposal = await turn(story.id, candidate, 'proposed', pending);
    const execute = proposal.extra.storyIntent.intent.steps.filter(step => step.kind === 'execute');
    assert.deepEqual(execute.map(step => step.actionId), ['complete-first-stepping']);
    assert.equal(proposal.content, '请核对下面的行动理解。确认后，故事才会继续这次行动。');
    check('FG-02: full free-text task becomes a sourced execute proposal, not premature narration or reward');
    await restartServer();
    assert.deepEqual(values(await state(story.id)), pending);
    await turn(story.id, candidate, 'confirmed', completed, { proposalMessageId: Number(proposal.id), expectedVersion: 2 });
    assert.deepEqual((await state(story.id)).actions, []);
    check('FG-03: pending proposal survives restart; explicit confirmation saves completion and exactly two earned points once');
    const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
    const corrections = new StoryCorrectionsService(database);
    const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: '暂不继续踏步，先了解任务要求。', evidenceIds: [] };
    const preview = await corrections.preview(story.id, auth.user.id, auth.user.tenantId, branchInput);
    const branch = await corrections.fork(story.id, auth.user.id, auth.user.tenantId, branchInput, preview.digest);
    report.branchId = branch.chat.id;
    assert.deepEqual(values(await state(branch.chat.id)), pending);
    const explanation = await turn(branch.chat.id, '先不继续踏步，也不领奖。请简短解释为什么之前做了5分钟又休息不算完成，不要替我执行动作或发放奖励。', 'confirmed', pending);
    assert.ok(explanation.content.trim().length > 0);
    const facts = explanation.extra.storyFacts ?? [];
    for (const fact of facts) assert.ok((fact.speaker === 'player' ? report.turns[3].input : explanation.content).includes(fact.evidence));
    if (!settings) {
      if (displayReplay) assert.equal(explanation.content, displayReplay);
      else assert.match(explanation.content, /任务要求\*\*连续\*\*踏步/);
      assert.ok(!JSON.stringify(facts).includes('任务要求连续踏步'));
      if (!displayReplay) assert.ok(JSON.stringify(facts).includes('中途不能休息'));
      const saved = await state(branch.chat.id);
      assert.ok(!JSON.stringify(saved.events).includes('任务要求连续踏步'));
    }
    assert.deepEqual(values(await state(story.id)), completed);
    check('FG-04: earlier branch continues pending without parent reward or future candidate; parent remains completed');
    const captures = await Promise.all((await readdir(capturesDirectory)).map(async name => JSON.parse(await readFile(resolve(capturesDirectory, name)))));
    assert.equal(captures.length, 4);
    const conversations = captures.map(capture => capture.request.messages ?? [
      ...(capture.request.systemInstruction ? [{ role: 'system', content: capture.request.systemInstruction.parts.map(part => part.text ?? '').join('') }] : []),
      ...capture.request.contents.map(message => ({ role: message.role === 'model' ? 'assistant' : message.role,
        content: message.parts.map(part => part.text ?? '').join('') })),
    ]);
    const lastUser = messages => messages.filter(message => message.role === 'user').at(-1)?.content;
    const branchConversation = conversations.find(messages => lastUser(messages) === report.turns[3].input);
    assert.ok(branchConversation, 'Actual branch prompt must include its player input');
    assert.ok(branchConversation.some(message => message.role === 'user' && message.content === report.turns[0].input));
    assert.ok(!branchConversation.some(message => message.role === 'user' && message.content === candidate));
    const confirmationConversation = conversations.find(messages => lastUser(messages) === candidate
      && messages.some(message => message.content.includes('The player reviewed and confirmed')));
    assert.ok(confirmationConversation, 'Actual confirmation prompt must include reviewed action proof');
    report.requestBytes = captures.map(capture => Buffer.byteLength(JSON.stringify(capture.request)));
    await page.goto(`${base}/health`);
    for (const chat of [story, branch.chat]) for (const width of [1440, 390]) for (const theme of displayReplay ? ['light', 'dark'] : ['light']) {
      await budget();
      await page.evaluate(value => localStorage.setItem('theme-preference', value), theme);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`${base}/chat/${chat.id}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      if (width === 390) await page.locator('.story-dossier .dossier-toggle').click();
      const dashboard = page.getByTestId('current-story-state');
      await expect(dashboard).toContainText(chat.id === story.id ? '已完成' : '待完成');
      await expect(dashboard).toContainText('本任务已获奖励（非总余额）');
      await expect(page.locator('.story-dossier .unsettled-events')).toHaveCount(0);
      if (chat.id === branch.chat.id) {
        const emphasis = page.locator('.markdown-content strong').filter({ hasText: displayReplay ? '在房间内连续原地踏步10分钟，中途不休息' : '连续' });
        await expect(emphasis).toHaveCount(1);
        await expect(page.locator('.markdown-content').last()).not.toContainText('**');
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const screenshot = `first-task-gameplay-${chat.id === story.id ? 'parent' : 'branch'}-${width}-${theme}.png`;
      await page.screenshot({ path: `${directory}/${screenshot}`, fullPage: true, animations: 'disabled' });
      report.screenshots.push(screenshot);
      if (chat.id === story.id) {
        await page.locator('.story-dossier nav button').filter({ hasText: '历程' }).click();
        const history = page.getByRole('region', { name: '游玩历程' });
        await expect(history).toContainText('当时保存的行动候选');
        await expect(history).not.toContainText('候选已保存，尚未执行');
        await expect(history.locator('.story-history li')).toHaveCount(3);
        if (width === 1440 && theme === 'light') {
          const historyScreenshot = 'first-task-gameplay-parent-history.png';
          await page.screenshot({ path: `${directory}/${historyScreenshot}`, fullPage: true, animations: 'disabled' });
          report.screenshots.push(historyScreenshot);
        }
      } else if (width === 390) {
        await page.locator('.story-dossier .dossier-close').click();
        const readingScreenshot = `first-task-gameplay-branch-reading-${theme}.png`;
        await page.screenshot({ path: `${directory}/${readingScreenshot}`, fullPage: true, animations: 'disabled' });
        report.screenshots.push(readingScreenshot);
      }
    }
    check('FG-05: desktop/mobile display persisted replies and separate parent/branch rewards without extra generation');
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    assert.deepEqual((await sql`SELECT card_data FROM characters WHERE id=${characterId}`)[0].card_data, original);
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
