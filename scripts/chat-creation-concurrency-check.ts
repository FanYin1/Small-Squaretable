import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/chat_creation_test') {
  console.error('Refusing to run: DATABASE_URL must point at the disposable database chat_creation_test');
  process.exit(2);
}

const firstConnection = postgres(databaseUrl, { max: 10 });
const secondConnection = postgres(databaseUrl, { max: 10 });
let passed = 0;

function check(name: string, condition: boolean): void {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  await firstConnection.begin(async transaction => {
    await transaction.unsafe(`
      CREATE TABLE tenants (id uuid PRIMARY KEY);
      CREATE TABLE users (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), display_name text DEFAULT 'Account');
      CREATE TABLE characters (id uuid PRIMARY KEY, creator_id uuid, tenant_id uuid, name text NOT NULL DEFAULT 'Mara',
        description text DEFAULT 'Original description', avatar_url text, prompt_template text DEFAULT 'default',
        card_data jsonb NOT NULL DEFAULT '{"first_mes":"Original opening","system_prompt":"Original rules"}',
        is_public boolean NOT NULL DEFAULT true, moderation_status text NOT NULL DEFAULT 'approved');
      CREATE TABLE worldbooks (
        id uuid PRIMARY KEY, character_id uuid, user_id uuid NOT NULL, tenant_id uuid NOT NULL,
        name text NOT NULL, scope text NOT NULL DEFAULT 'character', is_enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE worldbook_entries (
        id uuid PRIMARY KEY, worldbook_id uuid NOT NULL REFERENCES worldbooks(id) ON DELETE CASCADE,
        keyword text NOT NULL, content text NOT NULL, position integer NOT NULL DEFAULT 0,
        is_enabled boolean NOT NULL DEFAULT true, priority integer NOT NULL DEFAULT 0,
        settings jsonb NOT NULL DEFAULT '{}', character_filter jsonb NOT NULL DEFAULT '[]',
        scan_depth integer, context_percentage integer, recursive boolean NOT NULL DEFAULT true,
        prevent_recursion boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(), search_vector tsvector
      );
      CREATE TABLE user_personas (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
        name text NOT NULL DEFAULT 'Traveler', description text DEFAULT 'Original biography'
      );
      CREATE TABLE chats (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
        persona_id uuid REFERENCES user_personas(id) ON DELETE SET NULL,
        title varchar(500), summary text, metadata jsonb NOT NULL DEFAULT '{}',
        last_read_message_id bigint, unread_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE chat_characters (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (chat_id, character_id)
      );
      CREATE TABLE messages (
        id bigserial PRIMARY KEY, chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role text NOT NULL, content text NOT NULL, attachments jsonb, extra jsonb,
        character_id uuid, parent_message_id bigint, pinned boolean DEFAULT false,
        importance integer DEFAULT 5, search_vector tsvector, sent_at timestamptz DEFAULT now()
      );
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE character_memories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, type varchar(20) NOT NULL, content text NOT NULL,
        importance decimal(3,2) DEFAULT 0.5, access_count integer DEFAULT 0,
        source_chat_id uuid REFERENCES chats(id) ON DELETE SET NULL, source_message_id integer,
        created_at timestamptz NOT NULL DEFAULT now(), last_accessed timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT unique_memory UNIQUE (character_id, user_id, content)
      );
      CREATE TABLE character_memory_vectors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), memory_id uuid NOT NULL REFERENCES character_memories(id) ON DELETE CASCADE,
        embedding vector(384), created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const migration = await readFile(new URL('../src/db/migrations/0041_chat_creation_requests.sql', import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) await transaction.unsafe(statement);
    const identityMigration = await readFile(new URL('../src/db/migrations/0042_story_identity_snapshot.sql', import.meta.url), 'utf8');
    for (const statement of identityMigration.split('--> statement-breakpoint')) await transaction.unsafe(statement);
    const worldbookMigration = await readFile(new URL('../src/db/migrations/0043_story_worldbooks.sql', import.meta.url), 'utf8');
    for (const statement of worldbookMigration.split('--> statement-breakpoint')) await transaction.unsafe(statement);
    const contentMigration = await readFile(new URL('../src/db/migrations/0044_story_content.sql', import.meta.url), 'utf8');
    for (const statement of contentMigration.split('--> statement-breakpoint')) await transaction.unsafe(statement);
    const stateMigration = await readFile(new URL('../src/db/migrations/0045_story_state.sql', import.meta.url), 'utf8');
    for (const statement of stateMigration.split('--> statement-breakpoint')) await transaction.unsafe(statement);
    const memoryMigration = await readFile(new URL('../src/db/migrations/0046_story_memory_scope.sql', import.meta.url), 'utf8');
    for (const statement of memoryMigration.split('--> statement-breakpoint')) await transaction.unsafe(statement);
    await transaction.unsafe(await readFile(new URL('../src/db/migrations/0053_story_adapter_jobs.sql', import.meta.url), 'utf8'));
  });

  const { ChatCreationService } = await import('../src/server/services/chat-creation.service');
  const { AppError } = await import('../src/core/errors');
  const schema = await import('../src/db/schema');
  const firstService = new ChatCreationService(drizzle(firstConnection, { schema }));
  const secondService = new ChatCreationService(drizzle(secondConnection, { schema }));
  const { loadStoryWorldbookEntries } = await import('../src/server/services/story-worldbooks.service');
  const { loadStoryContent } = await import('../src/server/services/story-content.service');
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const sameTenantUserId = randomUUID();
  const otherUserId = randomUUID();
  const firstCharacterId = randomUUID();
  const secondCharacterId = randomUUID();
  const personaId = randomUUID();
  const otherPersonaId = randomUUID();
  const foreignPersonaId = randomUUID();
  await firstConnection`INSERT INTO tenants (id) VALUES (${tenantId}), (${otherTenantId})`;
  await firstConnection`INSERT INTO users (id, tenant_id) VALUES (${userId}, ${tenantId}), (${sameTenantUserId}, ${tenantId}), (${otherUserId}, ${otherTenantId})`;
  await firstConnection`INSERT INTO characters (id, creator_id, tenant_id) VALUES (${firstCharacterId}, ${userId}, ${tenantId}), (${secondCharacterId}, ${userId}, ${tenantId})`;
  const bookId = randomUUID();
  const entryId = randomUUID();
  const globalBookId = randomUUID();
  const foreignBookId = randomUUID();
  await firstConnection`INSERT INTO worldbooks (id, character_id, user_id, tenant_id, name, scope) VALUES
    (${bookId}, ${firstCharacterId}, ${userId}, ${tenantId}, 'Bound setting', 'character'),
    (${globalBookId}, NULL, ${userId}, ${tenantId}, 'Unbound global setting', 'global'),
    (${foreignBookId}, ${firstCharacterId}, ${otherUserId}, ${otherTenantId}, 'Untrusted attachment', 'character')`;
  await firstConnection`INSERT INTO worldbook_entries (id, worldbook_id, keyword, content) VALUES
    (${entryId}, ${bookId}, 'harbor', 'The harbor opens at dawn.'),
    (${randomUUID()}, ${globalBookId}, 'harbor', 'Unbound setting.'),
    (${randomUUID()}, ${foreignBookId}, 'harbor', 'Foreign setting.')`;
  await firstConnection`INSERT INTO user_personas (id, tenant_id, user_id) VALUES
    (${personaId}, ${tenantId}, ${userId}), (${otherPersonaId}, ${tenantId}, ${userId}),
    (${foreignPersonaId}, ${otherTenantId}, ${otherUserId})`;

  const input = {
    characterIds: [firstCharacterId, secondCharacterId], personaId, title: 'The lantern room',
    metadata: { scene: { weather: 'rain', hour: 8 }, tags: ['mystery', 'quiet'] }, clientRequestId: randomUUID(),
  };
  check('lookup of an unknown key is not_found', (await firstService.lookup(userId, tenantId, input.clientRequestId)).status === 'not_found');
  const results = await Promise.all(Array.from({ length: 40 }, (_, index) =>
    (index % 2 === 0 ? firstService : secondService).create(userId, tenantId, input)
  ));
  const winner = results.find(result => result.created)!;
  assert.deepEqual(await secondService.lookup(userId, tenantId, input.clientRequestId), { protocol: 1, status: 'created', chatId: winner.chat.id });
  check('another pool can look up the committed story', true);
  check('lookup does not disclose a different user result', (await firstService.lookup(sameTenantUserId, tenantId, input.clientRequestId)).status === 'not_found');
  check('lookup does not disclose a different tenant result', (await firstService.lookup(userId, otherTenantId, input.clientRequestId)).status === 'not_found');
  const inFlightKey = randomUUID();
  let signalClaim!: () => void;
  let releaseClaim!: () => void;
  const claimReady = new Promise<void>(resolve => { signalClaim = resolve; });
  const claimRelease = new Promise<void>(resolve => { releaseClaim = resolve; });
  const inFlight = firstConnection.begin(async transaction => {
    await transaction`INSERT INTO chat_creation_requests (tenant_id, user_id, request_id, payload_hash, chat_id)
      VALUES (${tenantId}, ${userId}, ${inFlightKey}, ${'a'.repeat(64)}, ${winner.chat.id})`;
    signalClaim();
    await claimRelease;
  });
  try {
    await Promise.race([claimReady, inFlight]);
    check('an uncommitted request is not_found rather than proof of failure', (await secondService.lookup(userId, tenantId, inFlightKey)).status === 'not_found');
  } finally {
    releaseClaim();
    await inFlight;
  }
  check('the same lookup sees the result after commit', (await secondService.lookup(userId, tenantId, inFlightKey)).status === 'created');
  await firstConnection`DELETE FROM chat_creation_requests WHERE request_id = ${inFlightKey}`;
  check('40 creates across two pools have exactly one winner', results.filter(result => result.created).length === 1);
  check('all requests return the same story', results.every(result => result.chat.id === winner.chat.id));
  const [counts] = await firstConnection`SELECT
    (SELECT count(*)::int FROM chats) AS chats,
    (SELECT count(*)::int FROM chat_creation_requests) AS requests,
    (SELECT count(*)::int FROM chat_characters) AS characters`;
  check('one story, one request and one complete group are committed', counts.chats === 1 && counts.requests === 1 && counts.characters === 2);
  const members = await firstConnection`SELECT character_id FROM chat_characters WHERE chat_id = ${winner.chat.id} ORDER BY sort_order`;
  check('group order and selected identity are preserved', members[0].character_id === firstCharacterId && members[1].character_id === secondCharacterId && winner.chat.personaId === personaId);

  const reordered = await secondService.create(userId, tenantId, {
    ...input, metadata: { tags: ['mystery', 'quiet'], scene: { hour: 8, weather: 'rain' } },
  });
  check('nested object property order does not cause a conflict', !reordered.created && reordered.chat.id === winner.chat.id);
  const deduplicated = await firstService.create(userId, tenantId, { ...input, characterIds: [...input.characterIds, firstCharacterId] });
  check('duplicate group members are normalized', !deduplicated.created);

  for (const [name, changed] of Object.entries({
    identity: { personaId: otherPersonaId }, title: { title: 'Another room' },
    metadata: { metadata: { tags: ['quiet', 'mystery'], scene: { hour: 8, weather: 'rain' } } },
    characterOrder: { characterIds: [secondCharacterId, firstCharacterId] },
  })) {
    await assert.rejects(() => secondService.create(userId, tenantId, { ...input, ...changed }),
      error => error instanceof AppError && error.statusCode === 409 && error.code === 'IDEMPOTENCY_CONFLICT');
    check(`changing ${name} with the same request key is rejected`, true);
  }

  const noPersonaInput = { characterId: firstCharacterId, clientRequestId: input.clientRequestId };
  const sameTenant = await firstService.create(sameTenantUserId, tenantId, noPersonaInput);
  const otherTenant = await secondService.create(otherUserId, otherTenantId, noPersonaInput);
  check('the same key is independent for another user', sameTenant.created && sameTenant.chat.id !== winner.chat.id);
  check('the same key is independent for another tenant', otherTenant.created && otherTenant.chat.id !== winner.chat.id);

  const failingInput = { characterIds: [firstCharacterId, randomUUID()], clientRequestId: randomUUID() };
  const [beforeFailure] = await firstConnection`SELECT count(*)::int AS count FROM chats`;
  await assert.rejects(() => firstService.create(userId, tenantId, failingInput),
    error => error instanceof AppError && error.code === 'NOT_FOUND');
  const [afterFailure] = await firstConnection`SELECT count(*)::int AS count FROM chats`;
  const failedClaims = await firstConnection`SELECT id FROM chat_creation_requests WHERE request_id = ${failingInput.clientRequestId}`;
  check('group insertion failure rolls back the story and claim', beforeFailure.count === afterFailure.count && failedClaims.length === 0);
  const orphanMembers = await firstConnection`SELECT id FROM chat_characters WHERE chat_id NOT IN (SELECT id FROM chats)`;
  check('a failed group leaves no orphan associations', orphanMembers.length === 0);
  await firstConnection`INSERT INTO characters (id) VALUES (${failingInput.characterIds[1]})`;
  const repaired = await secondService.create(userId, tenantId, failingInput);
  check('the same key can retry after a rolled-back transaction', repaired.created);

  for (const invalidPersonaId of [foreignPersonaId, randomUUID()]) {
    const clientRequestId = randomUUID();
    await assert.rejects(() => firstService.create(userId, tenantId, { ...noPersonaInput, personaId: invalidPersonaId, clientRequestId }),
      error => error instanceof AppError && error.statusCode === 404);
    const claims = await firstConnection`SELECT id FROM chat_creation_requests WHERE request_id = ${clientRequestId}`;
    check('unowned or missing identity is rejected without leaving a claim', claims.length === 0);
  }
  const wrongTenantKey = randomUUID();
  await assert.rejects(() => secondService.create(userId, otherTenantId, { ...noPersonaInput, personaId, clientRequestId: wrongTenantKey }),
    error => error instanceof AppError && error.statusCode === 404);
  check('identity validation also checks tenant ownership', true);

  const originalIdentity = winner.chat.identitySnapshot;
  check('creation atomically records a versioned identity', originalIdentity?.name === 'Traveler'
    && originalIdentity.description === 'Original biography' && originalIdentity.revision.length === 64);
  await firstConnection`UPDATE user_personas SET name = 'Changed traveler', description = 'Changed biography' WHERE id = ${personaId}`;
  assert.deepEqual((await secondService.create(userId, tenantId, input)).chat.identitySnapshot, originalIdentity);
  check('replaying a request after persona edits keeps the original snapshot', true);
  const nextStory = await secondService.create(userId, tenantId, { ...input, clientRequestId: randomUUID() });
  check('a new story receives the edited identity and a different revision', nextStory.chat.identitySnapshot?.name === 'Changed traveler'
    && nextStory.chat.identitySnapshot.revision !== originalIdentity?.revision);
  await assert.rejects(() => firstConnection`UPDATE chats SET identity_snapshot = '{}'::jsonb WHERE id = ${winner.chat.id}`,
    error => error instanceof postgres.PostgresError && error.code === '23514');
  check('the database prevents identity snapshot overwrite', true);
  await firstConnection`UPDATE users SET display_name = 'Changed account' WHERE id = ${sameTenantUserId}`;
  check('account-only stories also preserve their opening name', (await firstService.create(sameTenantUserId, tenantId, noPersonaInput)).chat.identitySnapshot?.name === 'Account');

  const snapshotDatabase = drizzle(secondConnection, { schema });
  const originalContent = await loadStoryContent(winner.chat.id, userId, snapshotDatabase);
  await firstConnection`UPDATE characters SET name = 'Changed Mara', card_data = '{"first_mes":"Changed opening","system_prompt":"Changed rules"}'::jsonb WHERE id = ${firstCharacterId}`;
  check('source card edits do not change saved character names or opening rules',
    JSON.stringify(await loadStoryContent(winner.chat.id, userId, snapshotDatabase)) === JSON.stringify(originalContent));
  await assert.rejects(() => loadStoryContent(winner.chat.id, otherUserId, snapshotDatabase));
  check('saved character content is isolated to the story owner', true);
  await assert.rejects(() => firstConnection`UPDATE story_content SET snapshot = '{}'::jsonb WHERE chat_id = ${winner.chat.id}`,
    error => error instanceof postgres.PostgresError && error.code === '23514');
  check('the database rejects overwriting saved character content', true);
  const privateId = randomUUID();
  await firstConnection`INSERT INTO characters (id, creator_id, is_public) VALUES (${privateId}, ${otherUserId}, false)`;
  await assert.rejects(() => firstService.create(userId, tenantId, { characterId: privateId, clientRequestId: randomUUID() }),
    error => error instanceof AppError && error.code === 'NOT_FOUND');
  check('private cards cannot be captured by an unrelated player', true);
  const loadEntries = (chatId: string, ownerId = userId, characterId = firstCharacterId) =>
    loadStoryWorldbookEntries(chatId, ownerId, characterId, snapshotDatabase);
  const originalEntries = await loadEntries(winner.chat.id);
  check('creation freezes only explicitly bound author worldbooks', originalEntries.length === 1 && originalEntries[0].id === entryId);
  check('an empty character binding does not load unrelated books', (await loadEntries(winner.chat.id, userId, secondCharacterId)).length === 0);
  await firstConnection`UPDATE worldbook_entries SET content = 'The harbor now opens at midnight.' WHERE id = ${entryId}`;
  check('source edits do not change existing story rules', (await loadEntries(winner.chat.id))[0].content === originalEntries[0].content);
  const later = await firstService.create(userId, tenantId, { characterIds: input.characterIds, clientRequestId: randomUUID() });
  check('a new story receives the revised character and opening', (await loadStoryContent(later.chat.id, userId, snapshotDatabase)).characters[0].cardData.first_mes === 'Changed opening');
  check('a new story receives current worldbook content', (await loadEntries(later.chat.id))[0].content.includes('midnight'));
  const revisions = await firstConnection`SELECT snapshot->>'revision' AS revision FROM story_worldbooks WHERE chat_id IN (${winner.chat.id}, ${later.chat.id})`;
  check('changed worldbooks produce a distinct content revision', new Set(revisions.map(row => row.revision)).size === 2);
  await assert.rejects(() => loadEntries(winner.chat.id, otherUserId));
  check('a different owner cannot read saved worldbooks', true);
  await assert.rejects(() => firstConnection`UPDATE story_worldbooks SET snapshot = '{}'::jsonb WHERE chat_id = ${winner.chat.id}`,
    error => error instanceof postgres.PostgresError && error.code === '23514');
  check('the database rejects overwriting saved worldbooks', true);
  await assert.rejects(() => firstConnection`UPDATE chats SET worldbook_snapshot_version = NULL WHERE id = ${winner.chat.id}`,
    error => error instanceof postgres.PostgresError && error.code === '23514');
  check('the database rejects downgrading a saved binding to legacy mode', true);
  await firstConnection`DELETE FROM worldbooks WHERE id = ${bookId}`;
  check('deleting the source book preserves the saved entries', (await loadEntries(winner.chat.id))[0].content === originalEntries[0].content);
  const afterBookDeletion = await secondService.create(userId, tenantId, input);
  check('creation replay after source deletion preserves the original binding', !afterBookDeletion.created && (await loadEntries(afterBookDeletion.chat.id)).length === 1);
  const empty = await firstService.create(userId, tenantId, { characterId: firstCharacterId, clientRequestId: randomUUID() });
  check('new stories after source deletion persist an explicit empty binding', (await loadEntries(empty.chat.id)).length === 0);
  await firstConnection`DELETE FROM story_worldbooks WHERE chat_id = ${empty.chat.id}`;
  await assert.rejects(() => loadEntries(empty.chat.id), error => error instanceof AppError && error.code === 'STORY_WORLDBOOKS_UNAVAILABLE');
  check('a missing saved binding fails instead of falling back to live books', true);

  await firstConnection`DELETE FROM user_personas WHERE id = ${personaId}`;
  const afterPersonaDeletion = await secondService.create(userId, tenantId, input);
  check('replay after identity deletion returns the existing story', !afterPersonaDeletion.created && afterPersonaDeletion.chat.id === winner.chat.id && afterPersonaDeletion.chat.personaId === null);
  assert.deepEqual(afterPersonaDeletion.chat.identitySnapshot, originalIdentity);
  check('deleting the source persona preserves the full starting identity', true);

  await firstConnection`UPDATE chats SET title = 'Renamed story' WHERE id = ${winner.chat.id}`;
  check('replay returns current story data after rename', (await firstService.create(userId, tenantId, input)).chat.title === 'Renamed story');
  assert.deepEqual(await firstService.lookup(userId, tenantId, input.clientRequestId), { protocol: 1, status: 'created', chatId: winner.chat.id });
  check('lookup keeps the original ID after rename and identity deletion', true);
  await firstConnection`DELETE FROM chats WHERE id = ${winner.chat.id}`;
  check('deleting a story also removes its private worldbook snapshot', (await firstConnection`SELECT chat_id FROM story_worldbooks WHERE chat_id = ${winner.chat.id}`).length === 0);
  await assert.rejects(() => secondService.create(userId, tenantId, input),
    error => error instanceof AppError && error.statusCode === 410 && error.code === 'CREATED_CHAT_DELETED');
  const [tombstone] = await firstConnection`SELECT chat_id FROM chat_creation_requests WHERE request_id = ${input.clientRequestId} AND user_id = ${userId}`;
  check('deleted stories retain a tombstone and cannot be recreated by replay', tombstone.chat_id === null);
  assert.deepEqual(await secondService.lookup(userId, tenantId, input.clientRequestId), { protocol: 1, status: 'deleted' });
  check('lookup distinguishes deletion from a missing request', true);
  check('deleting one story leaves another owner replayable', !(await firstService.create(sameTenantUserId, tenantId, noPersonaInput)).created);
  const [legacy] = await firstConnection`INSERT INTO chats (tenant_id, user_id, character_id, title)
    VALUES (${tenantId}, ${userId}, ${firstCharacterId}, 'Legacy story') RETURNING id, identity_snapshot`;
  check('legacy rows remain explicitly without an identity snapshot', legacy.identity_snapshot === null);
  await firstConnection`UPDATE chats SET title = 'Legacy renamed' WHERE id = ${legacy.id}`;
  check('ordinary legacy story updates remain valid', (await firstConnection`SELECT title FROM chats WHERE id = ${legacy.id}`)[0].title === 'Legacy renamed');
  const { storyExamples } = await import('../src/types/story-examples');
  const { prepareStoryTurn, commitStoryTurn, getStoryState, getStoryEvents, getStoryEvent, addStoryNote, deleteStoryNote } = await import('../src/server/services/story-state.service');
  const firstDatabase = drizzle(firstConnection, { schema });
  const secondDatabase = drizzle(secondConnection, { schema });
  const nativeCharacterId = randomUUID();
  await firstConnection`INSERT INTO characters (id, creator_id, card_data) VALUES (${nativeCharacterId}, ${userId}, ${JSON.stringify(storyExamples[0].cardData)}::jsonb)`;
  const native = (await firstService.create(userId, tenantId, { characterId: nativeCharacterId, clientRequestId: randomUUID() })).chat;
  const initialState = await getStoryState(native.id, userId, firstDatabase);
  const originalReplyCount = Number((await firstConnection`SELECT count(*) AS count FROM messages WHERE chat_id=${native.id} AND role='assistant'`)[0].count);
  check('native opening has authored resources, unknown source and no secret clue', initialState.fields.find(field => field.id === 'coins')?.value === 120 && initialState.fields.find(field => field.id === 'source')?.value === null && !initialState.fields.some(field => field.id === 'seal'));
  const [refusedSource] = await firstConnection`INSERT INTO messages (chat_id, role, content)
    VALUES (${native.id}, 'user', '我拒绝购买，也没有查看信封。') RETURNING id`;
  for (const [input, actionId] of [['花 20 枚钱购买临时通行凭证', 'permit'], ['仔细看看信封上的蜡印', 'inspect'], ['我只询问价格', null]] as const) {
    const prepared = await prepareStoryTurn(native, input, actionId ? { actionId, expectedVersion: 0 } : undefined, firstDatabase);
    for (const interrupted of [false, true]) {
      await assert.rejects(() => commitStoryTurn(prepared!, Number(refusedSource.id), randomUUID(), '不应保存的回复', interrupted, secondDatabase),
        error => error instanceof AppError && error.code === 'STORY_SOURCE_UNAVAILABLE');
    }
    assert.deepEqual(await getStoryState(native.id, userId, firstDatabase), initialState);
  }
  check('native costs, once-only clue and free expression reject mismatched input, including interrupted turns, without changing state or provenance', true);
  const missingInput = await prepareStoryTurn(native, '我拒绝购买，也没有查看信封。', undefined, firstDatabase);
  await assert.rejects(() => commitStoryTurn({ ...missingInput!, input: undefined as unknown as string }, Number(refusedSource.id), randomUUID(), '不应保存', false, secondDatabase),
    error => error instanceof AppError && error.code === 'STORY_SOURCE_UNAVAILABLE');
  check('a malformed internal prepared turn cannot bypass the saved-input guard', true);
  check('rejected sources create neither replies nor events', Number((await firstConnection`SELECT count(*) AS count FROM messages WHERE chat_id=${native.id} AND role='assistant'`)[0].count) === originalReplyCount
    && Number((await firstConnection`SELECT count(*) AS count FROM story_events WHERE chat_id=${native.id}`)[0].count) === 0);
  const question = await prepareStoryTurn(native, '我不买凭证，能先问问价格吗？', undefined, firstDatabase);
  check('negation and price questions do not mutate resources', question?.action === null && question?.nextValues.coins === 120);
  const action = { actionId: 'permit', expectedVersion: 0 };
  const purchase = await prepareStoryTurn(native, '花 20 枚钱购买临时通行凭证', action, firstDatabase);
  const concurrent = await prepareStoryTurn(native, '仔细看看信封上的蜡印', { actionId: 'inspect', expectedVersion: 0 }, secondDatabase);
  const [inputMessage] = await firstConnection`INSERT INTO messages (chat_id, role, content) VALUES (${native.id}, 'user', ${purchase!.input}) RETURNING id`;
  const inputId = Number(inputMessage.id);
  const [inspectionMessage] = await secondConnection`INSERT INTO messages (chat_id, role, content) VALUES (${native.id}, 'user', ${concurrent!.input}) RETURNING id`;
  const inspectionId = Number(inspectionMessage.id);
  const stateResults = await Promise.allSettled([
    commitStoryTurn(purchase!, inputId, 'purchase', '购买已完成。', false, firstDatabase),
    commitStoryTurn(concurrent!, inspectionId, 'inspection', '已查看。', false, secondDatabase),
  ]);
  check('two independent database clients commit at most one action at one state version', stateResults.filter(result => result.status === 'fulfilled').length === 1);
  const winnerIndex = stateResults.findIndex(result => result.status === 'fulfilled');
  const winnerTurn = winnerIndex === 0 ? purchase! : concurrent!;
  const winnerRequest = winnerIndex === 0 ? 'purchase' : 'inspection';
  const winnerInputId = winnerIndex === 0 ? inputId : inspectionId;
  const committed = await getStoryState(native.id, userId, secondDatabase);
  check('the committed turn and its source are available after reconnect', committed.version === 1 && committed.events.length === 1 && committed.events[0].inputMessageId === winnerInputId);
  const replayMessage = await commitStoryTurn(winnerTurn, winnerInputId, winnerRequest, 'duplicate', false, secondDatabase);
  check('replaying a committed action returns the original response without another event', replayMessage.content !== 'duplicate' && (await getStoryEvents(native.id, userId, undefined, firstDatabase)).length === 1);
  await assert.rejects(() => prepareStoryTurn(native, '花 20 枚钱购买临时通行凭证', action, firstDatabase), error => error instanceof AppError && error.code === 'STORY_STATE_CONFLICT');
  check('stale suggested actions fail before committing', true);
  const stopTurn = await prepareStoryTurn(native, '仔细看看信封上的蜡印', undefined, firstDatabase);
  const [stopInput] = await firstConnection`INSERT INTO messages (chat_id, role, content) VALUES (${native.id}, 'user', ${stopTurn!.input}) RETURNING id`;
  await commitStoryTurn(stopTurn!, Number(stopInput.id), 'stopped', '未完成的片段', true, secondDatabase);
  const stoppedState = await getStoryState(native.id, userId, firstDatabase);
  check('stopped generation retains confirmed values and records an interrupted source', JSON.stringify(stoppedState.fields) === JSON.stringify(committed.fields) && stoppedState.events[0].status === 'interrupted');
  await assert.rejects(() => getStoryState(native.id, sameTenantUserId, secondDatabase));
  await assert.rejects(() => addStoryNote(native.id, otherUserId, { kind: 'note', content: 'foreign' }, secondDatabase));
  check('state and notes enforce owner isolation within and across tenants', true);
  const note = await addStoryNote(native.id, userId, { kind: 'style', content: '克制对白，不替我作决定。' }, firstDatabase);
  check('saved style notes enter only this story prompt', (await prepareStoryTurn(native, '继续', undefined, secondDatabase))!.prompt.includes(note.content));
  await deleteStoryNote(native.id, userId, note.id, secondDatabase);
  check('deleting a note removes it from subsequent prompts', !(await prepareStoryTurn(native, '继续', undefined, firstDatabase))!.prompt.includes(note.content));
  const { MessageRepository } = await import('../src/db/repositories/message.repository');
  const messageReader = new MessageRepository(secondDatabase);
  for (let turnIndex = 0; turnIndex < 100; turnIndex++) {
    const turn = await prepareStoryTurn(native, `第${turnIndex}次询问`, undefined, firstDatabase);
    const [source] = await firstConnection`INSERT INTO messages (chat_id, role, content) VALUES (${native.id}, 'user', ${turn!.input}) RETURNING id`;
    await commitStoryTurn(turn!, Number(source.id), `long-${turnIndex}`, `记录 ${turnIndex}`, false, secondDatabase);
  }
  const longState = await getStoryState(native.id, userId, secondDatabase);
  check('100 subsequent free-text turns preserve confirmed resources and sources', longState.version === 102 && JSON.stringify(longState.fields) === JSON.stringify(committed.fields));
  const latestMessages = await messageReader.findByChatId(native.id, { limit: 2 });
  check('resume pagination reads the most recent messages in reading order', latestMessages[0].content === '第99次询问' && latestMessages[1].content === '记录 99');
  const sourceMessage = (await messageReader.findByChatId(native.id, { before: replayMessage.id + 1, limit: 1 }))[0];
  check('an old event source resolves to its exact message', sourceMessage.id === replayMessage.id);
  const otherStory = (await firstService.create(userId, tenantId, { characterId: nativeCharacterId, clientRequestId: randomUUID() })).chat;
  const { MemoryRepository } = await import('../src/db/repositories/memory.repository');
  const memoryWriter = new MemoryRepository(firstDatabase);
  const memoryReader = new MemoryRepository(secondDatabase);
  const memoryInput = { characterId: nativeCharacterId, userId, type: 'fact', content: '相同的句子，发生在不同故事', importance: '0.80', accessCount: 5 };
  const memoryOne = await memoryWriter.create({ ...memoryInput, sourceChatId: native.id });
  const memoryTwo = await memoryWriter.create({ ...memoryInput, sourceChatId: otherStory.id });
  const globalMemory = await memoryWriter.create({ ...memoryInput, sourceChatId: null });
  check('identical memory content in different stories does not collide or merge', memoryOne.id !== memoryTwo.id && memoryTwo.id !== globalMemory.id);
  const embedding = Array.from({ length: 384 }, () => 0.1);
  for (const memory of [memoryOne, memoryTwo, globalMemory]) await memoryWriter.createVector({ memoryId: memory.id, embedding });
  const similar = await memoryReader.findSimilar(nativeCharacterId, userId, embedding, 0.85, 10, native.id);
  check('semantic deduplication searches only the current story', similar.length === 1 && similar[0].id === memoryOne.id);
  check('story memories cannot be promoted into global account memories', (await memoryReader.findPromotionCandidates(nativeCharacterId, userId)).length === 0);
  await memoryWriter.promoteToGlobal(memoryOne.id);
  check('direct promotion also preserves the source story', await memoryReader.countByCharacterUser(nativeCharacterId, userId, native.id) === 1);
  await memoryWriter.deleteOldest(nativeCharacterId, userId, 1, otherStory.id);
  check('retention removes only memories in its target story', await memoryReader.countByCharacterUser(nativeCharacterId, userId, otherStory.id) === 0 && await memoryReader.countByCharacterUser(nativeCharacterId, userId, native.id) === 1);
  check('automatic consolidation reads only explicitly global memories', (await memoryReader.findByCharacterAndUser(nativeCharacterId, userId, 100, null)).every(memory => memory.id === globalMemory.id));
  await firstConnection`DELETE FROM chats WHERE id = ${native.id}`;
  check('deleting a story cascades its state, events and notes', (await firstConnection`SELECT id FROM story_events WHERE chat_id = ${native.id}`).length === 0 && (await firstConnection`SELECT chat_id FROM story_states WHERE chat_id = ${native.id}`).length === 0);
  check('deleting a story removes its derived memories instead of promoting them to global scope', await memoryReader.countByCharacterUser(nativeCharacterId, userId, null) === 1 && await memoryReader.countByCharacterUser(nativeCharacterId, userId, native.id) === 0);
  const revisionCharacter = randomUUID();
  const revisionBook = randomUUID();
  const revisionEntry = randomUUID();
  await firstConnection`INSERT INTO characters (id, creator_id, tenant_id, name) VALUES (${revisionCharacter}, ${userId}, ${tenantId}, 'Before edit')`;
  await firstConnection`INSERT INTO worldbooks (id, character_id, user_id, tenant_id, name) VALUES (${revisionBook}, ${revisionCharacter}, ${userId}, ${tenantId}, 'Revision reference')`;
  await firstConnection`INSERT INTO worldbook_entries (id, worldbook_id, keyword, content) VALUES (${revisionEntry}, ${revisionBook}, 'revision', 'Before edit')`;
  let interleaved = false;
  const afterSourceRead = async () => {
    await secondConnection.begin(async transaction => {
      await transaction`UPDATE characters SET name = 'After edit' WHERE id = ${revisionCharacter}`;
      await transaction`UPDATE worldbook_entries SET content = 'After edit' WHERE id = ${revisionEntry}`;
    });
  };
  function observeQuery(query: any): any {
    return new Proxy(query, { get(target, property) {
      if (property === 'then') return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        target.then(async (rows: unknown) => {
          if (!interleaved && target.toSQL().sql.includes('"worldbooks"')) {
            interleaved = true;
            await afterSourceRead();
          }
          return rows;
        }).then(resolve, reject);
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? (...args: unknown[]) => observeQuery(value.apply(target, args)) : value;
    } });
  }
  const interleavedDatabase = new Proxy(firstDatabase, { get(target, property) {
    if (property === 'transaction') return (callback: (transaction: unknown) => unknown) => target.transaction(async transaction =>
      callback(new Proxy(transaction, { get(inner, key) {
        if (key === 'select') return (...args: unknown[]) => observeQuery((inner.select as Function).apply(inner, args));
        const value = Reflect.get(inner, key);
        return typeof value === 'function' ? value.bind(inner) : value;
      } })));
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const coherent = await new ChatCreationService(interleavedDatabase).create(userId, tenantId, { characterId: revisionCharacter, clientRequestId: randomUUID() });
  assert.equal(interleaved, true);
  const coherentContent = await loadStoryContent(coherent.chat.id, userId, firstDatabase);
  const coherentBooks = await loadStoryWorldbookEntries(coherent.chat.id, userId, revisionCharacter, firstDatabase);
  check('an author transaction between source read and snapshot write cannot mix card/book revisions',
    coherentContent.characters[0].name === 'Before edit' && coherentBooks[0].content === 'Before edit');
  const newer = await firstService.create(userId, tenantId, { characterId: revisionCharacter, clientRequestId: randomUUID() });
  check('a later start captures both newly committed card and book revisions',
    (await loadStoryContent(newer.chat.id, userId, firstDatabase)).characters[0].name === 'After edit'
    && (await loadStoryWorldbookEntries(newer.chat.id, userId, revisionCharacter, firstDatabase))[0].content === 'After edit');
  function interleaveStateRead(onRead: () => Promise<unknown>) {
    let fired = false;
    function observe(query: any): any {
      return new Proxy(query, { get(target, property) {
        if (property === 'then') return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          target.then(async (rows: unknown) => {
            if (!fired && target.toSQL().sql.includes('from "story_states"')) { fired = true; await onRead(); }
            return rows;
          }).then(resolve, reject);
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? (...args: unknown[]) => observe(value.apply(target, args)) : value;
      } });
    }
    function wrap(reader: any): any {
      return new Proxy(reader, { get(target, property) {
        if (property === 'select') return (...args: unknown[]) => observe(target.select(...args));
        if (property === 'transaction') return (callback: (transaction: unknown) => unknown, config: unknown) =>
          target.transaction((transaction: unknown) => callback(wrap(transaction)), config);
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    }
    return { database: wrap(firstDatabase), didRun: () => fired };
  }
  const consistentStory = (await firstService.create(userId, tenantId, { characterId: nativeCharacterId, clientRequestId: randomUUID() })).chat;
  const consistentPurchase = await prepareStoryTurn(consistentStory, '花 20 枚钱购买临时通行凭证', undefined, secondDatabase);
  const [consistentInput] = await secondConnection`INSERT INTO messages (chat_id,role,content) VALUES (${consistentStory.id},'user',${consistentPurchase!.input}) RETURNING id`;
  const viewRace = interleaveStateRead(() => commitStoryTurn(consistentPurchase!, Number(consistentInput.id), 'coherent-view', 'CONCURRENT_PURCHASE', false, secondDatabase));
  const coherentView = await getStoryState(consistentStory.id, userId, viewRace.database);
  check('state view does not combine old balances with a newly committed event', viewRace.didRun() && coherentView.version === 0 && coherentView.events.length === 0 && coherentView.fields.find(field => field.id === 'coins')?.value === 120);
  const afterView = await getStoryState(consistentStory.id, userId, firstDatabase);
  check('next state read includes both committed balance and event source', afterView.version === 1 && afterView.events.length === 1 && afterView.fields.find(field => field.id === 'coins')?.sourceEventId === afterView.events[0].id);
  const writerInspection = await prepareStoryTurn(consistentStory, '仔细看看信封上的蜡印', undefined, secondDatabase);
  const [inspectionInput] = await secondConnection`INSERT INTO messages (chat_id,role,content) VALUES (${consistentStory.id},'user',${writerInspection!.input}) RETURNING id`;
  const promptRace = interleaveStateRead(() => commitStoryTurn(writerInspection!, Number(inspectionInput.id), 'coherent-prompt', 'CONCURRENT_INSPECTION', false, secondDatabase));
  const coherentTurn = await prepareStoryTurn(consistentStory, '继续询问', undefined, promptRace.database);
  check('generation preparation uses the same version for validation, prompt, events and state', promptRace.didRun() && coherentTurn?.version === 1 && coherentTurn.prompt.includes('Confirmed state version 1:') && !coherentTurn.prompt.includes('CONCURRENT_INSPECTION'));
  await assert.rejects(() => commitStoryTurn(coherentTurn!, Number(inspectionInput.id), 'stale-read', 'stale', false, firstDatabase), error => error instanceof AppError && error.code === 'STORY_STATE_CONFLICT');
  check('consistent reads preserve commit-time optimistic version protection', true);
  const sourceEvent = await getStoryEvent(consistentStory.id, userId, afterView.events[0].id, firstDatabase);
  assert.equal(sourceEvent.messageId, afterView.events[0].messageId);
  await assert.rejects(() => getStoryEvent(consistentStory.id, otherUserId, sourceEvent.id, firstDatabase));
  await assert.rejects(() => getStoryEvent(newer.chat.id, userId, sourceEvent.id, firstDatabase));
  check('direct event provenance enforces account and story scope without returning private changes', !('changes' in sourceEvent));
  const hiddenLocationCard = structuredClone(storyExamples[0].cardData);
  const hiddenRules = (hiddenLocationCard.extensions as any).squaretable.exploration;
  hiddenRules.map.nodes.find((node: any) => node.id === 'harbor').visibleWhen = [{ field: 'seal', operator: 'eq', value: true }];
  const hiddenLocationId = randomUUID();
  await firstConnection`INSERT INTO characters (id,creator_id,tenant_id,card_data) VALUES (${hiddenLocationId},${userId},${tenantId},${JSON.stringify(hiddenLocationCard)}::jsonb)`;
  const hiddenStory = (await firstService.create(userId, tenantId, { characterId: hiddenLocationId, clientRequestId: randomUUID() })).chat;
  const hiddenView = await getStoryState(hiddenStory.id, userId, firstDatabase);
  check('undiscovered map nodes are excluded from current marker, nodes and links', hiddenView.map?.location === null && !hiddenView.map.nodes.some(node => node.id === 'harbor') && hiddenView.map.nodes.every(node => !node.links.includes('harbor')));
  hiddenRules.actions[0].requires = [{ field: 'coins', operator: 'gte', value: '120' }];
  await firstConnection`UPDATE characters SET card_data=${JSON.stringify(hiddenLocationCard)}::jsonb WHERE id=${hiddenLocationId}`;
  const invalidRequest = randomUUID();
  await assert.rejects(() => firstService.create(userId, tenantId, { characterId: hiddenLocationId, clientRequestId: invalidRequest }), error => error instanceof AppError && error.code === 'STORY_RULES_INVALID');
  check('invalid typed author conditions roll back the entire new-story creation', (await firstService.lookup(userId, tenantId, invalidRequest)).status === 'not_found');
  const { collectStorySources } = await import('../src/server/services/story-diagnostics.service');
  const { captureStoryContent } = await import('../src/server/services/story-content.service');
  const { buildStoryEntryProfile } = await import('../src/server/services/story-entry.service');
  const { storyCharacterPreview } = await import('../src/types/story-content');
  const openingCardId = randomUUID();
  const openingCard = { first_mes: '<VariableInsert>setup only</VariableInsert>[开场白]', alternate_greetings: [null, 'At the station, {{user}} meets {{char}}.', 'Different story.'] };
  await firstConnection`INSERT INTO characters (id,creator_id,tenant_id,name,card_data) VALUES (${openingCardId},${userId},${tenantId},'Guide',${JSON.stringify(openingCard)}::jsonb)`;
  const openingSources = await collectStorySources(firstDatabase, [openingCardId]);
  const openingProfile = buildStoryEntryProfile(captureStoryContent([openingCardId], userId, openingSources), openingSources);
  const openingSelection = { characterId: openingCardId, revision: openingProfile.revision, reference: { source: 'alternate_greetings' as const, index: 1 }, reviewed: false };
  const selectedInput = { characterId: openingCardId, clientRequestId: randomUUID(), opening: openingSelection };
  let openingGates = 0;
  const gate = async () => { openingGates++; };
  const selectedResults = await Promise.all([
    firstService.create(userId, tenantId, selectedInput, gate), secondService.create(userId, tenantId, selectedInput, gate),
  ]);
  const selectedChat = selectedResults[0].chat;
  check('selected-opening concurrent requests create one story and run the quota gate once', selectedResults.filter(result => result.created).length === 1 && selectedResults.every(result => result.chat.id === selectedChat.id) && openingGates === 1);
  const selectedMessages = await firstConnection`SELECT role,content FROM messages WHERE chat_id=${selectedChat.id}`;
  check('selected opening and expanded frozen identity are persisted during creation', selectedMessages.length === 1 && selectedMessages[0].role === 'assistant' && selectedMessages[0].content === `At the station, ${(selectedChat.identitySnapshot as any).name} meets Guide.`);
  const selectedContent = await loadStoryContent(selectedChat.id, userId, firstDatabase);
  check('snapshot preserves the original source index and reader hides unselected openings', selectedContent.characters[0].opening?.reference.index === 1 && storyCharacterPreview(selectedContent.characters[0], 0).cardData.alternate_greetings.length === 0);
  check('selected-opening creation also initializes its state row', (await firstConnection`SELECT chat_id FROM story_states WHERE chat_id=${selectedChat.id}`).length === 1);
  assert.deepEqual(selectedContent.characters[0].adaptationReport, openingProfile.openings[2].adaptationReport);
  check('compatibility report is frozen atomically with the exact opening and preview version', selectedContent.characters[0].adaptationReport?.entryRevision === openingSelection.revision);
  await assert.rejects(() => firstService.create(userId, tenantId, { ...selectedInput, opening: { ...openingSelection, reference: { source: 'alternate_greetings', index: 2 } } }), error => error instanceof AppError && error.code === 'IDEMPOTENCY_CONFLICT');
  check('changing an opening under the same request id is rejected', true);
  const missingIndexRequest = randomUUID();
  await assert.rejects(() => firstService.create(userId, tenantId, { ...selectedInput, clientRequestId: missingIndexRequest, opening: { ...openingSelection, reference: { source: 'alternate_greetings', index: 0 } } }), error => error instanceof AppError && error.code === 'STORY_OPENING_INVALID');
  check('invalid source entries leave no creation receipt', (await firstService.lookup(userId, tenantId, missingIndexRequest)).status === 'not_found');
  const quotaRequest = randomUUID();
  await assert.rejects(() => firstService.create(userId, tenantId, { ...selectedInput, clientRequestId: quotaRequest }, async () => { throw new Error('Quota rejected'); }), /Quota rejected/);
  check('quota failure rolls back the story, opening and receipt', (await firstService.lookup(userId, tenantId, quotaRequest)).status === 'not_found');
  const openingBookId = randomUUID();
  await firstConnection`INSERT INTO worldbooks (id,character_id,user_id,tenant_id,name) VALUES (${openingBookId},${openingCardId},${userId},${tenantId},'Changed binding')`;
  const staleRequest = randomUUID();
  await assert.rejects(() => firstService.create(userId, tenantId, { ...selectedInput, clientRequestId: staleRequest }), error => error instanceof AppError && error.code === 'STORY_ENTRY_CHANGED');
  check('a binding change invalidates preparation without creating a story', (await firstService.lookup(userId, tenantId, staleRequest)).status === 'not_found');
  const replay = await secondService.create(userId, tenantId, selectedInput, gate);
  check('a committed request remains recoverable after the author changes sources', !replay.created && replay.chat.id === selectedChat.id && openingGates === 1);
  check('saved selection and opening survive a fresh database reader', (await loadStoryContent(selectedChat.id, userId, secondDatabase)).characters[0].opening?.reference.index === 1 && (await secondConnection`SELECT id FROM messages WHERE chat_id=${selectedChat.id}`).length === 1);
  const blankId = randomUUID();
  await firstConnection`INSERT INTO characters (id,creator_id,tenant_id,card_data) VALUES (${blankId},${userId},${tenantId},'{"first_mes":"<VariableInsert>init</VariableInsert>"}'::jsonb)`;
  const blankSources = await collectStorySources(firstDatabase, [blankId]);
  const blankProfile = buildStoryEntryProfile(captureStoryContent([blankId], userId, blankSources), blankSources);
  const blankChat = (await firstService.create(userId, tenantId, { characterId: blankId, clientRequestId: randomUUID(), opening: { characterId: blankId, revision: blankProfile.revision, reference: { source: 'none', index: 0 }, reviewed: true } })).chat;
  check('explicit text-first start creates no invented opening and hides setup-only greetings', (await firstConnection`SELECT id FROM messages WHERE chat_id=${blankChat.id}`).length === 0 && storyCharacterPreview((await loadStoryContent(blankChat.id, userId, firstDatabase)).characters[0], 0).cardData.first_mes === '');
  check('selected opening record remains frozen across source edits and idempotent replay', JSON.stringify((await getStoryState(selectedChat.id, userId, secondDatabase)).openingRecord) === JSON.stringify(selectedContent.characters[0].openingRecord));
  assert.deepEqual((await getStoryState(selectedChat.id, userId, secondDatabase)).adaptationReport, selectedContent.characters[0].adaptationReport);
  check('compatibility report survives binding changes, replay and a fresh state reader without recomputation', true);
  const conflictingId = randomUUID();
  const conflictingCard = { first_mes: '<VariableInsert>{"coins":1000}</VariableInsert>A quiet station.', extensions: { squaretable: { exploration: { version: 1, fields: [], actions: [] } } } };
  await firstConnection`INSERT INTO characters (id,creator_id,tenant_id,card_data) VALUES (${conflictingId},${userId},${tenantId},${JSON.stringify(conflictingCard)}::jsonb)`;
  const conflictingSources = await collectStorySources(firstDatabase, [conflictingId]);
  const conflictingProfile = buildStoryEntryProfile(captureStoryContent([conflictingId], userId, conflictingSources), conflictingSources);
  const conflictingRequest = randomUUID();
  await assert.rejects(() => firstService.create(userId, tenantId, { characterId: conflictingId, clientRequestId: conflictingRequest,
    opening: { characterId: conflictingId, revision: conflictingProfile.revision, reference: { source: 'first_mes', index: 0 }, reviewed: false } }),
  error => error instanceof AppError && error.code === 'STORY_INITIAL_RULES_CONFLICT');
  check('conflicting native and external initialization leaves no story or creation receipt', (await firstService.lookup(userId, tenantId, conflictingRequest)).status === 'not_found' && (await firstConnection`SELECT id FROM chats WHERE character_id=${conflictingId}`).length === 0);
  console.log(`${passed} checks passed`);
} finally {
  await Promise.all([firstConnection.end(), secondConnection.end()]);
}
