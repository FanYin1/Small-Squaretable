import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import WebSocket from 'ws';
import { expect } from '@playwright/test';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

export async function checkRitualGameplay({ loader, database, sql, api, auth, page, base, directory, check, restartServer, serviceEnvironment, budget }) {
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  assert.equal(base, 'http://127.0.0.1:55441');
  const configPath = process.env.RITUAL_GAMEPLAY_GATEWAY_CONFIG;
  const identityScenario = process.env.STORY_RITUAL_IDENTITY_GAMEPLAY_CHECK === '1';
  const settings = configPath ? parse(await readFile(configPath)) : null;
  const initialGateway = settings ? await requireEngineeringGateway(settings) : null;
  if (initialGateway) {
    assert.equal(initialGateway.batch.requests, 0, 'Never reuse a paid gameplay batch');
    assert.equal(initialGateway.batch.maxRequests, 4);
    assert.ok(initialGateway.batch.maxTokens <= 180000);
  }
  const report = { mode: settings ? 'live-model-websocket' : 'controlled-websocket', scenario: identityScenario ? 'identity-continuity' : 'proposal-continuity', result: 'started',
    ledgerId: initialGateway?.ledgerId ?? null, batchId: initialGateway?.batch.id ?? null, turns: [], screenshots: [],
    limits: ['One reviewed original card and four short replies, not general rule adaptation or long-term memory acceptance',
      'Browser views actual saved replies; full transcripts and images remain private', 'Isolated account credits only; no production balance changes'] };
  const save = () => writeFile(`${directory}/gameplay-private.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
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
  const sockets = [];
  const previousEnvironment = { ...serviceEnvironment };
  try {
    await save();
    const file = process.env.RITUAL_CARD_PATH ?? '/mnt/e/Download/26.1角色卡/25年全中文备注角色卡（7500➕）/7500+卡/2025-11-19/2025-11-19/未分类/2025年3月前/kakaa.png';
    const bytes = await readFile(file);
    report.originalSha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(report.originalSha256, 'f11040eeb4ac883009ebb51cb9d3b1a2702f36da19d3b9a9600aa218d57c411e');
    const body = new FormData(); body.append('files', new Blob([bytes]), 'kakaa.png');
    const imported = await api('/characters/import/batch', body);
    assert.equal(imported.failed.length, 0);
    const characterId = imported.imported[0].id;
    const jobs = await loader.import('../src/server/services/story-adapter-jobs.service.ts', import.meta.url);
    const job = await jobs.createAdapterJob(characterId, auth.user.id, auth.user.tenantId, randomUUID(), database);
    await jobs.runNextAdapterJob(database);
    assert.equal((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${job.id}`)[0].artifact?.turnEffect, 'kakaa-ritual-v2');
    const story = await api('/chats', { characterId, clientRequestId: randomUUID() }, 201);
    report.storyId = story.id;
    const captureDirectory = resolve(directory, 'provider-capture');
    await mkdir(captureDirectory, { mode: 0o700 });
    serviceEnvironment.RITUAL_GAMEPLAY_CAPTURE_DIRECTORY = captureDirectory;
    serviceEnvironment.NODE_OPTIONS = `--import=${resolve('scripts/ritual-gameplay-capture.mjs')}`;
    if (settings) {
      for (const key of ['CUSTOM_LLM_API_FORMAT', 'CUSTOM_LLM_BASE_URL', 'CUSTOM_LLM_API_KEY', 'CUSTOM_LLM_MODELS', 'CUSTOM_LLM_DEFAULT_MODEL']) {
        assert.equal(typeof settings[key], 'string'); serviceEnvironment[key] = settings[key];
      }
      serviceEnvironment.CUSTOM_LLM_MODEL_LIMITS = settings.CUSTOM_LLM_MODEL_LIMITS || '';
    } else {
      serviceEnvironment.CUSTOM_LLM_MODEL_LIMITS = JSON.stringify({ 'beta-smoke': {
        contextWindow: 1000000, maxOutputTokens: 64000, requestOutputTokens: 2048,
      } });
    }
    await restartServer();
    const state = chatId => api(`/chats/${chatId}/story-state`);
    const replyFor = async (chatId, requestId) => (await sql`SELECT id, content, extra FROM messages WHERE chat_id=${chatId} AND role='assistant' AND extra->>'storyRequestId'=${requestId} ORDER BY id DESC LIMIT 1`)[0] ?? null;
    async function wire(chatId) {
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
        throw new Error(`Gameplay socket timed out: ${events.map(event => `${event.type}:${event.data?.status ?? event.data?.code ?? ''}`).join(',')}`);
      };
      await wait(event => event.type === 'connected');
      send('join_chat', { chatId });
      await wait(event => event.type === 'generation_state');
      return { send, wait, events };
    }
    async function turn(chatId, input, expectedStatus, expectedValue, options = {}) {
      const gateway = settings ? await requireEngineeringGateway(settings) : null;
      if (gateway) assert.equal(gateway.batch.requests, report.turns.length, 'Unexpected paid call before next turn');
      const connection = await wire(chatId);
      const requestId = randomUUID();
      const entry = { chatId, input, requestId, status: 'pending' };
      report.turns.push(entry); await save();
      const data = { chatId, content: input, clientMessageId: requestId, ...options };
      connection.send('user_message', data);
      const finished = await connection.wait(event => event.type === 'generation_finished' && event.data.requestId === requestId);
      entry.transport = finished.data.status;
      entry.errors = connection.events.filter(event => event.type === 'error').map(event => event.data?.code);
      entry.errorDetails = connection.events.filter(event => event.type === 'error').map(event => event.data);
      entry.reply = await replyFor(chatId, requestId);
      entry.state = await state(chatId);
      entry.savedValues = (await sql`SELECT values FROM story_states WHERE chat_id=${chatId}`)[0].values;
      entry.status = finished.data.status === 'completed' ? 'awaiting-assertions' : 'failed';
      await save();
      assert.equal(finished.data.status, 'completed');
      assert.ok(entry.reply, 'This request must have its own persisted assistant reply');
      assert.equal(entry.reply.extra.stateStatus, expectedStatus);
      assert.equal(entry.state.fields[0].value, expectedValue);
      if (identityScenario) {
        const expectedClaim = chatId === story.id && report.turns.length >= 2;
        assert.equal(entry.savedValues['kakaa-identity-claim'], expectedClaim);
        assert.equal(entry.state.fields.some(field => field.id === 'kakaa-identity-claim'), expectedClaim);
      }
      assert.equal(entry.reply.extra.storyIntentInvalid, undefined);
      assert.ok(!entry.reply.content.includes('<story-intent>'));
      const historyCount = Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chatId}`)[0].count);
      connection.events.length = 0;
      connection.send('user_message', data);
      await connection.wait(event => (event.type === 'generation_state' || event.type === 'generation_finished') && event.data.requestId === requestId);
      assert.equal(Number((await sql`SELECT count(*) AS count FROM story_events WHERE chat_id=${chatId}`)[0].count), historyCount);
      if (settings) {
        const after = await settledGateway();
        assert.equal(after.batch.requests, report.turns.length);
        report.gatewayAfter = after;
      }
      entry.status = 'verified'; await save();
      return entry.reply;
    }
    if (identityScenario) {
      await turn(story.id, '有人说“我是鸟神”，但那不是我的自我声明。我暂时不采取行动，请简短、非露骨地向我介绍这里，不要替我作决定。', 'confirmed', 3);
      check('IG-01: quoted and explicitly denied identity does not trigger saved claim or expose its hidden field; duplicate delivery does not generate again');
      await turn(story.id, '我是鸟神', 'confirmed', 6);
      check('IG-02: exact direct claim is saved once with its own reply and visible source-backed identity record');
      await restartServer();
      const restored = await state(story.id);
      assert.equal(restored.version, 2);
      assert.equal(restored.fields.find(field => field.id === 'kakaa-identity-claim')?.value, true);
      await turn(story.id, '先不举行仪式，请继续和我说说这里的生活。简短、非露骨地回应，不要替我行动，也不要赠送金钱或能力。', 'confirmed', 9);
      check('IG-03: restart retains prior identity claim and actual model continuation without another declaration');
    } else {
      await turn(story.id, '请用简短、克制、非露骨的对白向我解释仪式。我暂时不采取行动，也不要替我作决定。', 'confirmed', 3);
      check('GP-01: original reviewed card generates through real application WebSocket/state commit; completed expression reaches NPC strength 3 and duplicate delivery creates no extra request/event');
      const candidateInput = '我想在纸上画一个圆。请把这件事作为待确认候选，先等我确认，不要替我执行。保持简短、非露骨的对白。';
      const proposal = await turn(story.id, candidateInput, 'proposed', 3);
      assert.equal(proposal.extra.storyIntent.intent.disposition, 'proposal');
      assert.equal(proposal.content, '请核对下面的行动理解。确认后，故事才会继续这次行动。');
      await restartServer();
      assert.equal((await state(story.id)).fields[0].value, 3);
      await turn(story.id, candidateInput, 'confirmed', 6, { storyAction: { proposalMessageId: Number(proposal.id), expectedVersion: 2 } });
      check('GP-02: generated proposal cannot advance counter or expose premature action; pending source survives server restart, explicit confirmation continues once to 6');
    }
    const { StoryCorrectionsService } = await loader.import('../src/server/services/story-corrections.service.ts', import.meta.url);
    const corrections = new StoryCorrectionsService(database);
    const branchInput = { requestId: randomUUID(), throughVersion: 1, mode: 'choice', direction: identityScenario ? '暂不声明身份，先聊普通旅人的生活。' : '暂不画圆，先聊旅途。', evidenceIds: [] };
    const preview = await corrections.preview(story.id, auth.user.id, auth.user.tenantId, branchInput);
    const branch = await corrections.fork(story.id, auth.user.id, auth.user.tenantId, branchInput, preview.digest);
    report.branchId = branch.chat.id;
    assert.equal((await state(branch.chat.id)).fields[0].value, 3);
    await turn(branch.chat.id, identityScenario
      ? '我还不了解这里。请简短、非露骨地聊聊普通旅人的生活，不要替我决定身份或行动。'
      : '我暂不画圆。我想先听你谈谈旅途，请用简短、非露骨的对白回应，不要替我行动。', 'confirmed', 6);
    assert.equal((await state(story.id)).version, 3);
    assert.equal((await state(story.id)).fields[0].value, identityScenario ? 9 : 6);
    if (identityScenario) assert.equal((await state(story.id)).fields.find(field => field.id === 'kakaa-identity-claim')?.value, true);
    check(identityScenario
      ? 'IG-04: branch before declaration continues with false hidden claim and strength 6, parent remains strength 9/true; actual model response requires separate semantic review'
      : 'GP-03: independent prefix branch starts at 3 and generates its own continuation to 6 without changing parent or importing later turns');
    if (identityScenario) {
      const captures = await Promise.all((await readdir(captureDirectory)).map(async name => JSON.parse(await readFile(resolve(captureDirectory, name), 'utf8'))));
      assert.equal(captures.length, 4);
      const conversations = captures.map(capture => (capture.request.messages ?? capture.request.contents.map(message => ({
        role: message.role === 'model' ? 'assistant' : message.role, content: message.parts.map(part => part.text ?? '').join(''),
      }))));
      const parentContinuation = conversations.find(messages => messages.at(-1).content === report.turns[2].input);
      const branchContinuation = conversations.find(messages => messages.at(-1).content === report.turns[3].input);
      assert.ok(parentContinuation?.some(message => message.role === 'user' && message.content === report.turns[1].input));
      assert.ok(branchContinuation?.some(message => message.role === 'user' && message.content === report.turns[0].input));
      for (const future of report.turns.slice(1, 3)) assert.ok(!branchContinuation.some(message => message.role === 'user' && message.content === future.input));
      check('IG-04-context: captured provider requests include saved declaration after restart and exclude both future user turns from the earlier branch');
    }
    for (const chat of [story, branch.chat]) for (const width of [1440, 390]) {
      await budget();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`${base}/chat/${chat.id}`);
      if (width === 390) await page.locator('.story-dossier .dossier-toggle').click();
      const expectedStrength = identityScenario && chat.id === story.id ? 9 : 6;
      await expect(page.getByTestId('current-story-state').locator('dd').first()).toHaveText(new RegExp(`^${expectedStrength}\\s*查看依据$`));
      if (identityScenario) await expect(page.getByTestId('current-story-state').locator('dt').filter({ hasText: '已向咔咔自称鸟神' })).toHaveCount(chat.id === story.id ? 1 : 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const screenshot = `gameplay-${chat.id === story.id ? 'parent' : 'branch'}-${width}.png`;
      await page.screenshot({ path: `${directory}/${screenshot}`, fullPage: true, animations: 'disabled' });
      report.screenshots.push(screenshot);
    }
    check(`${identityScenario ? 'IG-05' : 'GP-04'}: desktop/mobile reader loads persisted model replies and exact confirmed state for both original and branch; no generation on navigation`);
    assert.equal((await api('/credits/balance')).heldTokens, 0);
    if (settings) {
      const final = await settledGateway();
      assert.equal(final.batch.requests, 4);
      report.gatewayAfter = final;
    }
    report.result = 'engineering-passed-semantic-review-required';
    return { ...report, turns: report.turns.map(({ reply, state: savedState, ...entry }) => ({ ...entry, stateVersion: savedState.version,
      strength: savedState.fields[0].value, replySha256: createHash('sha256').update(reply.content).digest('hex') })) };
  } catch (error) {
    report.result = 'failed'; report.failure = error.message; throw error;
  } finally {
    for (const socket of sockets) socket.close();
    await save();
    for (const key of Object.keys(serviceEnvironment)) delete serviceEnvironment[key];
    Object.assign(serviceEnvironment, previousEnvironment);
  }
}
