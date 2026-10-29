import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { storyExamples } from '../src/types/story-examples.ts';

export async function checkUndeclaredCharacters({ browser, base, sql, api, auth, restartServer, evidence, getRequests, waitBudget }) {
  const checks = [];
  await waitBudget();
  const original = {
    name: '03C无声明 · 夜航值班', description: 'AUTHOR_ROLE_OLD 玩家是值班船长，与领航员已经共事三年。',
    personality: 'NAVIGATOR_OLD 领航员谨慎；报务员说话简短，两个人物有各自的经历。',
    scenario: 'SCENARIO_OLD 夜航前，玩家作为船长在船桥与两人交谈。',
    first_mes: '船长{{user}}，领航员和报务员在船桥等你。',
    system_prompt: 'AUTHOR_BOUNDARY_OLD 保留作者设定的共同经历；不要把玩家自述自动当成已经发生的事实。',
    post_history_instructions: 'AUTHOR_STYLE_OLD 用简短对白回应，保留玩家决定。',
    character_book: { name: '夜航资料', entries: [
      { keys: [], content: 'WORLD_OLD 船桥是本次场景。', constant: true },
      { keys: [], content: 'KNOWLEDGE_OLD 航海钟用于核对值班时间。', constant: true },
      { keys: [], content: 'STYLE_OLD 报务员用简短句子。', constant: true },
      { keys: [], content: 'RULE_OLD 问航线不表示已经离港。', constant: true },
      { keys: ['蓝灯'], content: 'KEYWORD_OLD 蓝灯表示有人请求通话。', constant: false },
    ] },
  };
  const form = new FormData();
  form.append('files', new Blob([JSON.stringify(original)], { type: 'application/json' }), 'undeclared-identity.json');
  const imported = await api('/characters/import/batch', form, 'POST', 200);
  assert.equal(imported.failed.length, 0);
  const characterId = imported.imported[0].id;
  const report = await api(`/characters/${characterId}/compatibility`);
  assert.equal(report.identity.status, 'unverified');
  assert.equal(report.books.undeclaredPurpose, true);
  assert.deepEqual(report.books.purposes, []);
  assert.equal(report.books.bound, 1);
  assert.equal(report.multipleCharacters, false);
  const persona = await api('/personas', { name: '叶舟', description: 'PLAYER_CLAIM_OLD 我是第一次登船的乘客，从未见过领航员。' });
  const story = await api('/chats', { characterId, personaId: persona.id, clientRequestId: randomUUID() });
  const readSnapshots = async chatId => ({
    content: (await sql`SELECT snapshot FROM story_content WHERE chat_id = ${chatId}`)[0].snapshot,
    books: (await sql`SELECT snapshot FROM story_worldbooks WHERE chat_id = ${chatId}`)[0].snapshot,
    identity: (await sql`SELECT identity_snapshot FROM chats WHERE id = ${chatId}`)[0].identity_snapshot,
  });
  const frozen = await readSnapshots(story.id);
  assert.deepEqual(frozen.content.characters[0].cardData._squaretableImport.original, original);
  assert.equal(frozen.content.characters.length, 1);
  assert.equal(frozen.content.characters[0].diagnostics.identity.status, 'unverified');
  assert.equal(frozen.identity.description, 'PLAYER_CLAIM_OLD 我是第一次登船的乘客，从未见过领航员。');
  checks.push('Unannotated prose identity, multi-person prose and four undeclared book purposes retain their original data; reports do not claim semantic validation or create extra agents');

  await api('/worldbooks/import-file', { name: '夜航资料', entries: [{ content: 'UNBOUND_SECRET_MUST_NOT_LOAD', constant: true }] });
  const other = await api('/characters', { name: 'Other owned story', cardData: { name: 'Other owned story', first_mes: 'Another story.' } });
  const foreignBook = await api('/worldbooks/import-file', { name: '夜航资料', entries: [{ content: 'OTHER_CHARACTER_SECRET_MUST_NOT_LOAD', constant: true }] });
  await api(`/characters/${other.id}/worldbooks/${foreignBook.worldBookId}`, { action: 'bind', expectedCharacterId: null }, 'PUT', 200);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  await context.addInitScript(({ tokens, user }) => {
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('tenantId', user.tenantId);
    localStorage.setItem('locale', 'zh-CN');
  }, auth);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function generate(chatId, input) {
    await waitBudget();
    const before = getRequests().length;
    const version = (await api(`/chats/${chatId}/story-state`)).version;
    await page.locator('.message-input textarea').fill(input);
    await page.locator('.message-input textarea').press('Enter');
    await expect.poll(async () => (await api(`/chats/${chatId}/story-state`)).version, { timeout: 25000 }).toBe(version + 1);
    const requests = getRequests().slice(before);
    assert.equal(requests.length, 1);
    const prompt = requests[0].messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
    for (const forbidden of ['UNBOUND_SECRET_MUST_NOT_LOAD', 'OTHER_CHARACTER_SECRET_MUST_NOT_LOAD']) assert.ok(!prompt.includes(forbidden));
    return prompt;
  }
  try {
    await waitBudget();
    await page.goto(`${base}/characters/${characterId}`);
    await expect(page.locator('.story-diagnostics')).toContainText('文字中的身份、经历与关系尚未自动核对');
    await expect(page.locator('.story-diagnostics')).toContainText('部分资料未声明用途');
    await expect(page.locator('.story-diagnostics')).toContainText('不会据此要求你重新选择世界');
    await page.screenshot({ path: `${evidence}/undeclared-detail-mobile.png`, fullPage: true });
    await page.goto(`${base}/chat/${story.id}`);
    await expect(page.locator('.greeting-bubble')).toContainText('叶舟');
    const initial = await generate(story.id, '请描述现在船桥上的情形，先不要出发。');
    for (const marker of ['AUTHOR_ROLE_OLD', 'NAVIGATOR_OLD', 'SCENARIO_OLD', 'AUTHOR_BOUNDARY_OLD', 'AUTHOR_STYLE_OLD', 'PLAYER_CLAIM_OLD', 'WORLD_OLD', 'KNOWLEDGE_OLD', 'STYLE_OLD', 'RULE_OLD']) assert.ok(initial.includes(marker), `Production prompt retains ${marker}`);
    assert.ok(!initial.includes('KEYWORD_OLD'));
    const triggered = await generate(story.id, '我只是问一下蓝灯是什么意思，不要替我行动。');
    assert.ok(triggered.includes('KEYWORD_OLD'));
    checks.push('Actual production generation keeps unannotated author identity, player claim and constant book material; keyword entry triggers only when requested; unrelated books stay out');
    checks.push('Mobile detail explicitly marks identity unverified and purpose undeclared; opening uses the chosen saved name without an extra world-selection step');

    await waitBudget();
    const changed = { ...original, description: 'AUTHOR_ROLE_NEW 玩家现在是岸上调度员。', scenario: 'SCENARIO_NEW 岸上办公室。' };
    await api(`/characters/${characterId}`, { description: changed.description, cardData: changed }, 'PATCH', 200);
    await api(`/personas/${persona.id}`, { name: '新称呼', description: 'PLAYER_CLAIM_NEW 新的个人经历。' }, 'PATCH', 200);
    const [entry] = await sql`SELECT entry.id, entry.worldbook_id FROM worldbook_entries entry JOIN worldbooks book ON book.id = entry.worldbook_id WHERE book.character_id = ${characterId} AND entry.content LIKE 'WORLD_OLD%'`;
    await api(`/worldbooks/${entry.worldbook_id}/entries/${entry.id}`, { content: 'WORLD_NEW 岸上的新背景。' }, 'PATCH', 200);
    const nextStory = await api('/chats', { characterId, personaId: persona.id, clientRequestId: randomUUID() });
    const nextFrozen = await readSnapshots(nextStory.id);
    assert.equal(nextFrozen.identity.name, '新称呼');
    assert.equal(nextFrozen.content.characters[0].cardData.description, changed.description);
    assert.ok(JSON.stringify(nextFrozen.books).includes('WORLD_NEW'));
    assert.deepEqual(await readSnapshots(story.id), frozen);
    await restartServer();
    assert.deepEqual(await readSnapshots(story.id), frozen);
    await waitBudget();
    await page.reload();
    await expect(page.locator('.message-input textarea')).toBeVisible();
    const resumed = await generate(story.id, '接着刚才的话题，请先描述船桥。');
    for (const marker of ['AUTHOR_ROLE_OLD', 'SCENARIO_OLD', 'PLAYER_CLAIM_OLD', 'WORLD_OLD', '[User Persona: 叶舟]']) assert.ok(resumed.includes(marker));
    for (const marker of ['AUTHOR_ROLE_NEW', 'SCENARIO_NEW', 'PLAYER_CLAIM_NEW', 'WORLD_NEW']) assert.ok(!resumed.includes(marker));
    await page.locator('.reading-settings summary').click();
    await expect(page.locator('.story-diagnostics')).toContainText('文字中的身份、经历与关系尚未自动核对');
    await page.screenshot({ path: `${evidence}/undeclared-resumed-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `${evidence}/undeclared-resumed-desktop.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await waitBudget();
    await page.goto(`${base}/chat/${nextStory.id}`);
    const fresh = await generate(nextStory.id, '请描述眼前的情形。');
    for (const marker of ['AUTHOR_ROLE_NEW', 'SCENARIO_NEW', 'PLAYER_CLAIM_NEW', 'WORLD_NEW', '[User Persona: 新称呼]']) assert.ok(fresh.includes(marker));
    for (const marker of ['AUTHOR_ROLE_OLD', 'SCENARIO_OLD', 'PLAYER_CLAIM_OLD', 'WORLD_OLD']) assert.ok(!fresh.includes(marker));
    checks.push('Source card, persona and book edits affect a new story; old frozen sources and actual resumed generation survive an API restart unchanged');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }

  await waitBudget();
  const native = await api('/characters', { name: 'Native group boundary', cardData: storyExamples[0].cardData });
  const before = Number((await sql`SELECT count(*) AS count FROM chats WHERE user_id = ${auth.user.id}`)[0].count);
  const requestId = randomUUID();
  const rejected = await api('/chats', { characterIds: [native.id, other.id], clientRequestId: requestId }, 'POST', 400);
  assert.equal(rejected.error.code, 'STORY_RULES_GROUP_UNSUPPORTED');
  assert.equal(Number((await sql`SELECT count(*) AS count FROM chats WHERE user_id = ${auth.user.id}`)[0].count), before);
  assert.equal((await sql`SELECT * FROM chat_creation_requests WHERE request_id = ${requestId}`).length, 0);
  checks.push('Native-rule multi-card stories reject transactionally; one prose card with several people remains one card, distinct from ordinary multi-card generation');
  return { checks, pageErrors: errors, provider: 'controlled loopback', paidProviderTokens: 0,
    limits: ['Prose conflicts remain unverified and explicitly disclosed; preserving both inputs does not prove resolution', 'No real-model narrative or character-knowledge isolation claim'],
    source: 'owned unannotated legacy card and owned books; no third-party text sent to provider' };
}
