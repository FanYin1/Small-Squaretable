import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { register } from 'tsx/esm/api';
import { expect } from '@playwright/test';

export async function checkStoryTransactions({ browser, base, sql, auth, csrf, serviceEnvironment, restartServer, getStreamCount }) {
  assert.equal(base, 'http://127.0.0.1:55441');
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = `/tmp/squaretable-transaction-evidence/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const checks = [];
  const errors = [];
  const streams = getStreamCount();
  const previous = Object.fromEntries(Object.keys(serviceEnvironment).map(key => [key, process.env[key]]));
  Object.assign(process.env, serviceEnvironment);
  const loader = register({ namespace: `transaction-${randomUUID()}` });
  const database = drizzle(sql);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken); localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId); localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem(`story-onboarding:v1:${JSON.stringify([user.tenantId, user.id])}`, 'done');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function api(path, body, expected = 200) {
    const response = await fetch(`${base}/api/v1${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId,
        'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(result.error ?? '')}`);
    return result.data ?? result;
  }
  const rules = { version: 1, fields: [
    { id: 'coins', label: '测试钱款', type: 'number', initial: 100, min: 0 },
    { id: 'tickets', label: '测试票券', type: 'number', initial: 0, min: 0, max: 1 },
    { id: 'rewarded', label: '测试奖励已领', type: 'boolean', initial: false },
  ], actions: [
    { id: 'buy', label: '花20枚买票', intent: 'act', changes: [
      { field: 'coins', operation: 'add', value: -20 }, { field: 'tickets', operation: 'add', value: 1 },
    ], outcome: '测试规则：支付20枚，获得1张票。' },
    { id: 'reward', label: '领取5枚奖励', intent: 'act', once: true, changes: [
      { field: 'coins', operation: 'add', value: 5 }, { field: 'rewarded', operation: 'set', value: true },
    ], outcome: '测试规则：领取5枚并标记奖励已领。' },
  ] };
  const initial = { coins: 100, tickets: 0, rewarded: false };
  const purchased = { coins: 80, tickets: 1, rewarded: false };
  const completed = { coins: 85, tickets: 1, rewarded: true };
  const state = async chat => (await sql`SELECT version,"values",completed_actions FROM story_states WHERE chat_id=${chat.id}`)[0];
  const branchInput = version => ({ requestId: randomUUID(), throughVersion: version, mode: 'choice', direction: '仅测试完整交易的来源与独立分支。', evidenceIds: [] });
  try {
    const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
    const card = await api('/characters', { name: '受控交易回归示例（非原卡适配）', cardData: { first_mes: '', extensions: { squaretable: { exploration: rules } } } }, 201);
    const makeStory = () => api('/chats', { characterId: card.id, clientRequestId: randomUUID() }, 201);
    async function prepare(chat, input, request) {
      const turn = await prepareStoryTurn(chat, input, request, database);
      const [source] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user',${input}) RETURNING id`;
      return { turn, source: Number(source.id), requestId: randomUUID() };
    }
    const commit = (prepared, output = '受控完整回复。', interrupted = false) =>
      commitStoryTurn(prepared.turn, prepared.source, prepared.requestId, output, interrupted, database);
    async function propose(chat) {
      const input = '先买票再领取奖励';
      const prepared = await prepare(chat, input);
      const intent = { version: 1, disposition: 'proposal', steps: [
        { kind: 'execute', actionId: 'buy', evidence: '买票' },
        { kind: 'execute', actionId: 'reward', evidence: '领取奖励' },
      ], facts: [] };
      const reply = await commit(prepared, `待核对\n<story-intent>${JSON.stringify(intent)}</story-intent>`);
      return { input, reply, request: { proposalMessageId: reply.id, expectedVersion: reply.extra.storyIntent.expectedVersion } };
    }

    const direct = await makeStory();
    const directTurn = await prepare(direct, '花20枚买票', { actionId: 'buy', expectedVersion: 0 });
    const directReply = await commit(directTurn);
    assert.equal((await commit(directTurn)).id, directReply.id);
    assert.deepEqual((await state(direct)).values, purchased);
    await assert.rejects(() => prepareStoryTurn(direct, '花20枚买票', { actionId: 'buy', expectedVersion: 1 }, database));
    const directBranchInput = branchInput(1);
    const directPreview = await api(`/chats/${direct.id}/story-branches/preview`, directBranchInput);
    checks.push('Direct purchase saves both payment and ticket exactly once; inventory limit rejects another purchase');

    const compound = await makeStory();
    const proposal = await propose(compound);
    assert.deepEqual((await state(compound)).values, initial);
    const confirmation = await prepare(compound, proposal.input, proposal.request);
    await sql.unsafe(`CREATE FUNCTION transaction_fail_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.chat_id = '${compound.id}'::uuid AND NEW.version = 2 THEN RAISE EXCEPTION 'controlled transaction commit failure'; END IF; RETURN NEW; END $$`);
    await sql.unsafe('CREATE TRIGGER transaction_fail_state AFTER UPDATE ON story_states FOR EACH ROW EXECUTE FUNCTION transaction_fail_state()');
    try {
      await assert.rejects(() => commit(confirmation), error => error.cause?.message === 'controlled transaction commit failure');
      assert.deepEqual((await state(compound)).values, initial);
      assert.equal((await state(compound)).version, 1);
      assert.equal((await sql`SELECT count(*)::int AS count FROM story_events WHERE chat_id=${compound.id}`)[0].count, 1);
      assert.equal((await sql`SELECT count(*)::int AS count FROM messages WHERE chat_id=${compound.id} AND role='assistant'`)[0].count, 1);
    } finally { await sql.unsafe('DROP TRIGGER transaction_fail_state ON story_states'); await sql.unsafe('DROP FUNCTION transaction_fail_state()'); }
    await commit(confirmation);
    assert.deepEqual((await state(compound)).values, completed);
    const completeInput = branchInput(2);
    const preview = await api(`/chats/${compound.id}/story-branches/preview`, completeInput);
    const branch = await api(`/chats/${compound.id}/story-branches`, { input: completeInput, previewDigest: preview.digest }, 201);
    const child = { ...compound, id: branch.chatId };
    assert.deepEqual((await state(child)).values, completed);
    assert.deepEqual((await state(child)).completed_actions, ['buy', 'reward']);
    const childInput = branchInput(2);
    const childPreview = await api(`/chats/${child.id}/story-branches/preview`, childInput);
    const grandchild = await api(`/chats/${child.id}/story-branches`, { input: childInput, previewDigest: childPreview.digest }, 201);
    assert.deepEqual((await state({ id: grandchild.chatId })).values, completed);
    await assert.rejects(() => prepareStoryTurn(child, '领取5枚奖励', { actionId: 'reward', expectedVersion: 2 }, database));
    checks.push('Payment, inventory and once-only reward roll back together on database failure; retry and two consecutive branches retain exact values and proof');

    const interrupted = await makeStory();
    const pending = await propose(interrupted);
    const interruptedTurn = await prepare(interrupted, pending.input, pending.request);
    await commit(interruptedTurn, '受控中断回复。', true);
    assert.deepEqual((await state(interrupted)).values, initial);
    assert.deepEqual((await state(interrupted)).completed_actions, []);
    await assert.rejects(() => prepareStoryTurn(interrupted, pending.input, pending.request, database));
    const refused = await makeStory();
    const refusal = await prepare(refused, '先别买票，只问价格');
    await commit(refusal, `先核对价格。\n<story-intent>${JSON.stringify({ version: 1, disposition: 'expression', steps: [{ kind: 'refuse', description: '不买票', evidence: '先别买票' }], facts: [] })}</story-intent>`);
    assert.deepEqual((await state(refused)).values, initial);
    checks.push('Interrupted confirmation and explicit refusal grant neither ticket nor reward; stale interrupted proposal cannot be reused');

    await sql`UPDATE messages SET content='先别支付，只问价格' WHERE id=${directTurn.source}`;
    await api(`/chats/${direct.id}/story-branches/preview`, directBranchInput, 409);
    const failedInput = { ...directBranchInput, requestId: randomUUID() };
    await api(`/chats/${direct.id}/story-branches`, { input: failedInput, previewDigest: directPreview.digest }, 409);
    assert.equal((await sql`SELECT count(*)::int AS count FROM chat_creation_requests WHERE request_id=${failedInput.requestId}`)[0].count, 0);
    assert.equal((await sql`SELECT count(*)::int AS count FROM story_branches WHERE parent_id=${direct.id}`)[0].count, 0);
    assert.deepEqual((await state(direct)).values, purchased);
    await sql`UPDATE messages SET content='花20枚买票' WHERE id=${directTurn.source}`;
    await api(`/chats/${direct.id}/story-branches/preview`, directBranchInput);
    await sql`UPDATE messages SET extra=jsonb_set(extra,'{storyIntent,input}','"篡改的提案输入"'::jsonb) WHERE id=${proposal.reply.id}`;
    await api(`/chats/${compound.id}/story-branches/preview`, completeInput, 409);
    await sql`UPDATE messages SET extra=jsonb_set(extra,'{storyIntent,input}',${JSON.stringify(proposal.input)}::jsonb) WHERE id=${proposal.reply.id}`;
    checks.push('Unchanged resource totals cannot hide edited input or proposal proof; preview and creation reject corruption without leaving a branch or idempotency claim');

    await restartServer();
    await api(`/chats/${child.id}/story-branches/preview`, childInput);
    assert.deepEqual((await state(child)).values, completed);
    await page.goto(`${base}/chat/${child.id}`);
    await expect(page.locator('.story-dossier')).toContainText('85');
    await page.getByRole('button', { name: '纠正与分支', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('纠正 / 改变选择', { exact: true }).click();
    await dialog.getByRole('textbox', { name: '新分支方向' }).fill('从开局重新选择，不继承购买和奖励。');
    await dialog.getByRole('button', { name: '预览影响', exact: true }).click();
    await expect(dialog.getByLabel('分支影响预览')).toContainText('100');
    await page.screenshot({ path: `${directory}/transaction-branch-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog.getByLabel('分支影响预览')).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${directory}/transaction-branch-mobile.png`, fullPage: true });
    checks.push('Process restart preserves transaction provenance; desktop and 390px branch preview shows original balance instead of future earnings');
    assert.equal(getStreamCount(), streams);
    assert.deepEqual(errors, []);
    await writeFile(`${directory}/result.json`, JSON.stringify({ checks, providerCalls: 0, syntheticRules: true, groupChecks: false, browserErrors: errors }, null, 2), { mode: 0o600 });
    console.info(`PASS: ${checks.length} transaction groups; evidence ${directory}`);
  } catch (error) {
    await page.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${directory}/failure.json`, JSON.stringify({ message: error.message, checks, errors }, null, 2), { mode: 0o600 });
    console.info(`Transaction failure evidence: ${directory}`);
    throw error;
  } finally {
    await context.close(); loader.unregister();
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
