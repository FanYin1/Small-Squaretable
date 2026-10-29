import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';

export async function checkAdapterSourceGates({ loader, database, sql, api, auth, page, base, directory, restartServer, budget }) {
  const jobs = await loader.import('../src/server/services/story-adapter-jobs.service.ts', import.meta.url);
  const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
  const owner = [auth.user.id, auth.user.tenantId];
  const rules = { version: 1, fields: [{ id: 'coins', label: '测试金币', type: 'number', initial: 10, min: 0 }],
    actions: [{ id: 'pay', label: '测试支付3枚', intent: 'act', requires: [{ field: 'coins', operator: 'gte', value: 3 }],
      changes: [{ field: 'coins', operation: 'add', value: -3 }], outcome: '测试支付3枚。' }] };
  const declaration = `\u0060\u0060\u0060squaretable-rules-v1\n${JSON.stringify(rules)}\n\u0060\u0060\u0060`;
  const card = await api('/characters', { name: '规则来源条件隔离验收', description: '合成来源条件测试，不是真实卡玩法。', cardData: {
    first_mes: '这里是隔离规则检查。', character_book: { entries: [{ keys: ['金币'], content: declaration, constant: true }] },
  } }, 201);
  const beforeCredits = await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`;
  const [entry] = await sql`SELECT entry.* FROM worldbook_entries entry JOIN worldbooks book ON book.id=entry.worldbook_id WHERE book.character_id=${card.id}`;
  async function check() {
    const job = await jobs.createAdapterJob(card.id, ...owner, randomUUID(), database);
    assert.equal(await jobs.runNextAdapterJob(database), true);
    const [stored] = await sql`SELECT * FROM story_adapter_jobs WHERE id=${job.id}`;
    assert.equal(stored.status, 'ready');
    return stored;
  }
  const ready = await check();
  assert.equal(ready.artifact.conclusion, 'supported');
  const oldStory = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() }, 201);
  const [frozen] = await sql`SELECT snapshot FROM story_content WHERE chat_id=${oldStory.id}`;
  const newStory = () => api('/chats', { characterId: card.id, clientRequestId: randomUUID() }, 201);
  const state = chat => api(`/chats/${chat.id}/story-state`);
  async function pay(chat) {
    const current = await state(chat);
    const prepared = await prepareStoryTurn(chat, '测试支付3枚', { actionId: 'pay', expectedVersion: current.version }, database);
    const [message] = await sql`INSERT INTO messages(chat_id,role,content) VALUES(${chat.id},'user','测试支付3枚') RETURNING id`;
    const request = randomUUID();
    await commitStoryTurn(prepared, Number(message.id), request, '受控回应：测试支付3枚。', false, database);
    await commitStoryTurn(prepared, Number(message.id), request, '受控回应：测试支付3枚。', false, database);
  }
  await pay(oldStory);
  assert.equal((await state(oldStory)).fields[0].value, 7);
  const cases = [
    { name: 'keyword', settings: { ...entry.settings, constant: false } },
    { name: 'probability', settings: { ...entry.settings, probability: 50 } },
    { name: 'delay', settings: { ...entry.settings, delay: 2 } },
    { name: 'cooldown', settings: { ...entry.settings, cooldown: 2 } },
    { name: 'sticky', settings: { ...entry.settings, sticky: 2 } },
    { name: 'character-filter', settings: entry.settings, filter: [randomUUID()] },
  ];
  for (const scenario of cases) {
    await sql`UPDATE worldbook_entries SET settings=${JSON.stringify(scenario.settings)}::jsonb,character_filter=${JSON.stringify(scenario.filter ?? [])}::jsonb WHERE id=${entry.id}`;
    const result = await check();
    assert.equal(result.artifact.reason, 'conditional-source', scenario.name);
    assert.equal(result.artifact.rules, undefined);
    const profile = await api(`/characters/${card.id}/story-entry`);
    assert.notEqual(profile.rulesStatus, 'adapted');
    const chat = await newStory();
    assert.deepEqual((await state(chat)).actions, []);
    assert.deepEqual((await state(chat)).fields, []);
  }
  const current = (await sql`SELECT * FROM story_adapter_jobs WHERE character_id=${card.id} ORDER BY created_at DESC,id DESC LIMIT 1`)[0];
  const historicalGrant = { ...ready.artifact, jobId: current.id, sourceRevision: current.source_revision };
  await sql`UPDATE story_adapter_jobs SET artifact=${JSON.stringify(historicalGrant)}::jsonb WHERE id=${current.id}`;
  const views = await jobs.listAdapterJobs(card.id, ...owner, database);
  assert.equal(views[0].current, false);
  assert.equal(views[0].result.inspection, undefined);
  assert.notEqual((await api(`/characters/${card.id}/story-entry`)).rulesStatus, 'adapted');
  assert.deepEqual((await state(await newStory())).fields, []);
  assert.deepEqual((await sql`SELECT artifact FROM story_adapter_jobs WHERE id=${current.id}`)[0].artifact, historicalGrant);
  const screenshots = [];
  async function inspectPanel(prefix, expected, forbidden) {
    for (const width of [1440, 390]) {
      await budget();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`${base}/characters/${card.id}`);
      const panel = page.getByRole('region', { name: '整理与兼容检查', exact: true });
      await expect(panel).toContainText(expected);
      await expect(panel).not.toContainText(forbidden);
      await panel.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1));
      const filename = `${prefix}-${width}.png`;
      await page.screenshot({ path: `${directory}/${filename}`, fullPage: true, animations: 'disabled' });
      screenshots.push(filename);
    }
  }
  await inspectPanel('adapter-obsolete-source', '规则检查要求已更新', '项有限行动');
  assert.equal((await check()).artifact.reason, 'conditional-source');
  await inspectPanel('adapter-conditional-source', '不要仅为通过检查删除原有条件', '项有限行动');
  await restartServer();
  assert.deepEqual((await sql`SELECT snapshot FROM story_content WHERE chat_id=${oldStory.id}`)[0].snapshot, frozen.snapshot);
  assert.equal((await state(oldStory)).fields[0].value, 7);
  await pay(oldStory);
  assert.equal((await state(oldStory)).fields[0].value, 4);
  await sql`UPDATE worldbook_entries SET settings=${JSON.stringify(entry.settings)}::jsonb,character_filter='[]'::jsonb WHERE id=${entry.id}`;
  assert.equal((await check()).artifact.conclusion, 'supported');
  assert.equal((await state(await newStory())).fields[0].value, 10);
  assert.equal((await state(oldStory)).fields[0].value, 4);
  assert.deepEqual(await sql`SELECT * FROM credit_ledger WHERE tenant_id=${auth.user.tenantId} ORDER BY id`, beforeCredits);
  return { cases: cases.map(scenario => scenario.name), obsoleteReceiptRejected: true, receiptUnchanged: true,
    oldSnapshotUnchanged: true, oldStoryValues: [10, 7, 4], recheckedUnconditionalInitial: 10, screenshots,
    scope: 'Synthetic declarations, real isolated persistence and controlled turn commits; no real supplier or third-party rule conversion' };
}
