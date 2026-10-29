import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { register } from 'tsx/esm/api';
import { expect } from '@playwright/test';
import { checkStoryStateSource } from './story-state-source-check.mjs';

export const stateClosureRules = { version: 1, fields: [
  { id: 'coins', label: '钱款', type: 'number', initial: 100, min: 0 },
  { id: 'location', label: '地图位置', type: 'string', initial: 'harbor', visible: false },
  { id: 'secret', label: '秘密标记', type: 'boolean', initial: false, visible: false },
], actions: [
  { id: 'pay', label: '支付20枚', intent: 'act', once: true, changes: [{ field: 'coins', operation: 'add', value: -20 }], outcome: '支付了20枚，钱款剩80枚。' },
  { id: 'wait', label: '停留观察', intent: 'observe', changes: [], outcome: '仍在原地观察，没有支付或移动。' },
], map: { locationField: 'location', nodes: [
  { id: 'harbor', label: '港口', links: ['secret'] },
  { id: 'secret', label: '秘密据点', links: ['harbor'], visibleWhen: [{ field: 'secret', operator: 'eq', value: true }] },
] } };

export async function checkStoryStateClosure({ page, base, sql, api, auth, serviceEnvironment, checks, evidence, waitBudget }) {
  const connection = postgres(serviceEnvironment.DATABASE_URL, { max: 3 });
  const database = drizzle(connection);
  const loader = register({ namespace: `state-closure-${randomUUID()}` });
  try {
    const { prepareStoryTurn, commitStoryTurn } = await loader.import('../src/server/services/story-state.service.ts', import.meta.url);
    const card = await api('/characters', { name: '04AB来源验收', cardData: { first_mes: '', extensions: { squaretable: { exploration: stateClosureRules } } } });
    const story = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
    let firstEvent;
    for (let index = 0; index < 35; index++) {
      const input = index ? '停留观察' : '支付20枚';
      const prepared = await prepareStoryTurn(story, input, undefined, database);
      const [source] = await connection`INSERT INTO messages (chat_id,role,content) VALUES (${story.id},'user',${input}) RETURNING id`;
      const reply = index ? `预写来源验收第${index + 1}轮：仍在原地。` : '预写来源验收：已支付20枚，剩余80枚。';
      await commitStoryTurn(prepared, Number(source.id), `state-source-${index}`, reply, false, database);
      if (!index) [firstEvent] = await connection`SELECT id FROM story_events WHERE chat_id=${story.id}`;
    }
    const state = await api(`/chats/${story.id}/story-state`);
    assert.equal(state.version, 35);
    assert.ok(!state.events.some(event => event.id === firstEvent.id));
    const other = await api('/chats', { characterId: card.id, clientRequestId: randomUUID() });
    const response = await fetch(`${base}/api/v1/chats/${other.id}/story-events/${firstEvent.id}`, { headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId } });
    assert.equal(response.status, 404);
    checks.push({ case: '35 service-committed rounds retain first state provenance; cross-story event lookup rejected', result: 'passed' });
    await checkStoryStateSource({ page, base, api, storyId: story.id, sourceEventId: firstEvent.id,
      sourceMessage: '预写来源验收：已支付20枚，剩余80枚。', checks, evidence, waitBudget });

    await waitBudget();
    const candidateCard = await api('/characters', { name: '04AB确认禁用验收', cardData: { first_mes: '', extensions: { squaretable: { exploration: stateClosureRules } } } });
    const candidateStory = await api('/chats', { characterId: candidateCard.id, clientRequestId: randomUUID() });
    const input = '我想支付20枚';
    const prepared = await prepareStoryTurn(candidateStory, input, undefined, database);
    const [source] = await connection`INSERT INTO messages (chat_id,role,content) VALUES (${candidateStory.id},'user',${input}) RETURNING id`;
    await commitStoryTurn(prepared, Number(source.id), 'candidate-guard', `待核对\n<story-intent>${JSON.stringify({ version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: 'pay', evidence: '支付20枚' }], facts: [] })}</story-intent>`, false, database);
    await page.goto(`${base}/chat/${candidateStory.id}`);
    await expect(page.getByRole('button', { name: '确认并继续', exact: true })).toBeEnabled();
    const stateRoute = `**/api/v1/chats/${candidateStory.id}/story-state`;
    await page.route(stateRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TEST_UNAVAILABLE', message: '状态读取故障注入' } }) }));
    await page.reload();
    await expect(page.getByRole('button', { name: '确认并继续', exact: true })).toBeDisabled();
    await expect(page.locator('.story-dossier header')).toContainText('读取失败');
    await page.unroute(stateRoute);
    await page.locator('.generation-error').filter({ hasText: '状态读取故障注入' }).getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByRole('button', { name: '确认并继续', exact: true })).toBeEnabled();
    assert.equal((await sql`SELECT count(*)::int AS count FROM generation_requests WHERE chat_id IN (${story.id},${candidateStory.id})`)[0].count, 0);
    checks.push({ case: 'state load failure disables proposal confirmation and shows failure; explicit refresh restores it without generation', result: 'passed' });
    return { storyId: story.id, candidateStoryId: candidateStory.id };
  } finally { loader.unregister(); await connection.end(); }
}
