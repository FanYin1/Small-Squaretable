import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, readdir, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { exportStoryBundle, importStoryBundle } from './story-transfer.mjs';
import { validateStoryBundle, digest } from './story-transfer-format.mjs';
import { captureDeletionJournal, writePrivateJson, readPrivateJson, replayDeletionJournal } from './story-deletion-journal.mjs';
import * as schema from '../src/db/schema/index.ts';
import { ChatCreationService } from '../src/server/services/chat-creation.service.ts';
import { prepareStoryTurn, commitStoryTurn, getStoryState, addStoryNote } from '../src/server/services/story-state.service.ts';
import { StoryMemoryWorker } from '../src/server/services/story-memory-worker.service.ts';
import { getStorySummaries } from '../src/server/services/story-summary.service.ts';
import { visibleStoryMemoryIds } from '../src/server/services/story-knowledge.service.ts';
import { MemoryRepository } from '../src/db/repositories/memory.repository.ts';
import { checkStoryDeletionRaces } from './story-deletion-races.mjs';
import { createCharacterWithWorldbook } from '../src/db/character-import.ts';
import { createAdapterJob, runNextAdapterJob } from '../src/server/services/story-adapter-jobs.service.ts';
import { saveCharacterPresentation } from '../src/server/services/character-presentation.service.ts';
import { collectPresentationSources, verifyPresentationSelection, revalidatePresentationDraft } from '../src/server/services/story-presentation-workflow.ts';
import { seedRitualTransfer, verifyRitualTransfer, verifyRitualRestart } from './story-ritual-transfer-check.mjs';

function connect(url) {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.pathname, '/squaretable_story_restore_test');
  return postgres(url, { max: 5 });
}
let activeTargetUrl = process.env.DATABASE_URL;
let client = connect(activeTargetUrl);
let raw = connect(activeTargetUrl);
let database = drizzle(client, { schema });
const creation = new ChatCreationService(database);
const base = JSON.parse(await readFile(process.env.STORY_RESTORE_FIXTURE, 'utf8'));
const vector = Array.from({ length: 384 }, (_, index) => index === 0 ? 1 : 0);
const settings = { maxAttempts: 3, timeoutMs: 1000, maxInputChars: 24000, memoryLimit: 100 };
const providers = { extract: async sources => ({ version: 1, facts: [{ type: 'event', content: '仅林澈知道蓝色票据的约定。', sourceMessageIds: [sources[0].messageId] }],
  summary: { content: '私下约定使用蓝色票据。', sourceMessageIds: sources.map(source => source.messageId) } }), embed: async texts => texts.map(() => vector) };
let source;
const checks = [];
const check = name => checks.push(name);
try {
  await mkdir(process.env.STORY_TRANSFER_SOURCE_UPLOADS, { recursive: true });
  await mkdir(process.env.STORY_TRANSFER_TARGET_UPLOADS, { recursive: true });
  if (process.argv[2] === 'seed') {
    const ritual = process.env.RITUAL_CARD_PATH ? await seedRitualTransfer(database, base) : null;
    const { collectStorySources } = await import('../src/server/services/story-diagnostics.service.ts');
    const { captureStoryContent } = await import('../src/server/services/story-content.service.ts');
    const { buildStoryEntryProfile } = await import('../src/server/services/story-entry.service.ts');
    let openingCardData = { first_mes: 'Morning.', alternate_greetings: ['Evening, {{user}}.'] };
    if (process.env.STORY_OPENING_RECORD_SAMPLE_PATH) {
      const { parseCharacterFile } = await import('../src/types/character-card-import.ts');
      openingCardData = (await parseCharacterFile(await readFile(process.env.STORY_OPENING_RECORD_SAMPLE_PATH))).character.cardData;
    }
    const openingCharacter = await createCharacterWithWorldbook(database, { tenantId: base.tenantId, creatorId: base.userId,
      name: '开场迁移卡', cardData: openingCardData });
    const openingSources = await collectStorySources(database, [openingCharacter.id]);
    const openingProfile = buildStoryEntryProfile(captureStoryContent([openingCharacter.id], base.userId, openingSources), openingSources);
    const openingStory = (await creation.create(base.userId, base.tenantId, { characterId: openingCharacter.id, clientRequestId: randomUUID(), opening: {
      characterId: openingCharacter.id, revision: openingProfile.revision, reference: { source: 'alternate_greetings', index: 0 }, reviewed: false,
    } })).chat;
    const openingRecord = (await getStoryState(openingStory.id, base.userId, database)).openingRecord;
    const adaptationReport = (await getStoryState(openingStory.id, base.userId, database)).adaptationReport;
    const adapterRules = { version: 1, fields: [{ id: 'coins', label: '金币', type: 'number', initial: 10, min: 0 }], actions: [
      { id: 'pay', label: '支付3枚', intent: 'act', requires: [{ field: 'coins', operator: 'gte', value: 3 }], changes: [{ field: 'coins', operation: 'add', value: -3 }], outcome: '已支付3枚。' },
    ] };
    const adapterCharacter = await createCharacterWithWorldbook(database, { tenantId: base.tenantId, creatorId: base.userId,
      name: '显式规则迁移合成卡', cardData: { first_mes: '你站在港口，船长耐心地询问你的来意。', character_book: { entries: [
        { keys: ['金币'], content: `\u0060\u0060\u0060squaretable-rules-v1\n${JSON.stringify(adapterRules)}\n\u0060\u0060\u0060`, constant: true },
      ] } } });
    const adapterJob = await createAdapterJob(adapterCharacter.id, base.userId, base.tenantId, randomUUID(), database);
    await runNextAdapterJob(database);
    const presentationCharacter = { ...adapterCharacter, cardData: adapterCharacter.cardData };
    const presentationSources = collectPresentationSources(presentationCharacter);
    const presentation = await saveCharacterPresentation({ characterId: adapterCharacter.id, userId: base.userId, tenantId: base.tenantId,
      requestId: randomUUID(), draft: verifyPresentationSelection(presentationCharacter, presentationSources,
        { version: 1, candidateId: presentationSources.candidates[0].id }) }, database);
    const adapterStory = (await creation.create(base.userId, base.tenantId, { characterId: adapterCharacter.id, clientRequestId: randomUUID() })).chat;
    const adapterTurn = await prepareStoryTurn(adapterStory, '支付3枚', { actionId: 'pay', expectedVersion: 0 }, database);
    const [adapterInput] = await database.insert(schema.messages).values({ chatId: adapterStory.id, role: 'user', content: '支付3枚' }).returning();
    await commitStoryTurn(adapterTurn, adapterInput.id, randomUUID(), '已支付3枚。', false, database);
    const adapterArtifact = (await raw`SELECT snapshot FROM story_content WHERE chat_id=${adapterStory.id}`)[0].snapshot.characters[0].adaptation;
    assert.equal(adapterArtifact.jobId, adapterJob.id);
    if (process.env.STORY_OPENING_RECORD_SAMPLE_PATH) assert.equal(adaptationReport.runtime, 'unsupported');
    if (process.env.STORY_OPENING_RECORD_SAMPLE_PATH) assert.equal(openingRecord.status, 'initial-only');
    await database.update(schema.characters).set({ cardData: { first_mes: 'Source changed after creation.' } }).where(eq(schema.characters.id, openingCharacter.id));
    const proposal = (await creation.create(base.userId, base.tenantId, { characterId: base.characterId, clientRequestId: randomUUID() })).chat;
    const input = '我想领取一张通行证，听说仓库有金币但未证实。';
    const prepared = await prepareStoryTurn(proposal, input, undefined, database);
    const [message] = await database.insert(schema.messages).values({ chatId: proposal.id, role: 'user', content: input }).returning();
    const output = `待确认\n<story-intent>${JSON.stringify({ version: 1, disposition: 'proposal', steps: [{ kind: 'execute', actionId: 'permit', evidence: '我想领取一张通行证' }],
      facts: [{ kind: 'claim', content: '仓库金币为未证实传闻', evidence: '听说仓库有金币但未证实', speaker: 'player' }] })}</story-intent>`;
    const acceptedRequest = randomUUID();
    await commitStoryTurn(prepared, message.id, acceptedRequest, output, false, database, undefined, output);
    await database.insert(schema.generationRequests).values({ chatId: proposal.id, requestId: acceptedRequest, payloadHash: digest({ content: input, mentionedCharacterIds: [] }),
      status: 'completed', userMessageId: message.id, finishedAt: new Date() });
    await database.insert(schema.messageBookmarks).values({ userId: base.userId, messageId: message.id, note: '稍后核对通行证' });
    await database.insert(schema.messageReactions).values({ userId: base.userId, messageId: message.id, emoji: '✓' });
    await database.insert(schema.characterEmotions).values({ userId: base.userId, characterId: base.characterId, chatId: proposal.id,
      valence: '0.100', arousal: '0.200', triggerMessageId: message.id, triggerContent: '原创合成情绪记录' });
    await addStoryNote(proposal.id, base.userId, { kind: 'style', content: '用简短克制的对白回应。' }, database);
    const members = [];
    for (const name of ['林澈', '苏遥']) members.push((await database.insert(schema.characters).values({ tenantId: base.tenantId, creatorId: base.userId,
      name, cardData: { name, description: '原创迁移验证人物。' } }).returning())[0]);
    const group = (await creation.create(base.userId, base.tenantId, { characterIds: members.map(item => item.id), clientRequestId: randomUUID() })).chat;
    const relative = `${base.tenantId}/images/ticket.png`;
    await mkdir(join(process.env.STORY_TRANSFER_SOURCE_UPLOADS, base.tenantId, 'images'), { recursive: true });
    const bytes = Buffer.from('owned-attachment-test-bytes');
    await writeFile(join(process.env.STORY_TRANSFER_SOURCE_UPLOADS, relative), bytes);
    const audience = [members[0].id];
    for (let index = 0; index < 5; index++) {
      const text = `这是蓝色票据的私下约定${index}。`;
      const turn = await prepareStoryTurn(group, text, undefined, database, { characterId: members[0].id, audience });
      const [inputMessage] = await database.insert(schema.messages).values({ chatId: group.id, role: 'user', content: text,
        extra: { storyAudience: audience }, ...(index === 0 ? { attachments: [{ url: `/uploads/${relative}`, type: 'image' }] } : {}) }).returning();
      await commitStoryTurn(turn, inputMessage.id, randomUUID(), '林澈答应保管蓝色票据。', false, database, members[0].id);
    }
    assert.equal(await new StoryMemoryWorker(database, providers, settings).runOnce(), 'succeeded');
    const active = (await creation.create(base.userId, base.tenantId, { characterId: base.characterId, clientRequestId: randomUUID() })).chat;
    await database.insert(schema.generationRequests).values({ chatId: active.id, requestId: randomUUID(), payloadHash: 'a'.repeat(64), status: 'running' });
    await writeFile(process.env.STORY_TRANSFER_FIXTURE, JSON.stringify({ ritual, presentation, adapterStoryId: adapterStory.id, adapterArtifact, openingStoryId: openingStory.id, openingRecord, adaptationReport, proposalId: proposal.id, acceptedRequest, activeId: active.id, groupId: group.id,
      characterIds: audience.concat(members[1].id), attachmentDigest: digest(bytes) }), { mode: 0o600 });
  } else {
    source = connect(process.env.STORY_TRANSFER_SOURCE_DATABASE_URL);
    const fixture = JSON.parse(await readFile(process.env.STORY_TRANSFER_FIXTURE, 'utf8'));
    const memoryFixture = JSON.parse(await readFile(process.env.STORY_MEMORY_FIXTURE, 'utf8'));
    const [tenant] = await database.insert(schema.tenants).values({ name: '迁移目标', slug: `transfer-${randomUUID()}` }).returning();
    const [user] = await database.insert(schema.users).values({ tenantId: tenant.id, email: `transfer-${randomUUID()}@example.test`, displayName: '迁移验收' }).returning();
    const options = { userId: user.id, tenantId: tenant.id, uploadRoot: process.env.STORY_TRANSFER_TARGET_UPLOADS };
    const exportOptions = { userId: base.userId, tenantId: base.tenantId, uploadRoot: process.env.STORY_TRANSFER_SOURCE_UPLOADS };
    const packageFor = chatId => exportStoryBundle(source, { ...exportOptions, chatId });
    await assert.rejects(() => packageFor(fixture.activeId), /Drain active generation/);
    await assert.rejects(() => exportStoryBundle(source, { ...exportOptions, chatId: fixture.groupId, userId: randomUUID() }), /unavailable/);
    check('Export rejects wrong owner and in-flight generation instead of creating an incomplete portable story');
    const group = await packageFor(fixture.groupId);
    const candidate = await packageFor(fixture.proposalId);
    const branchBundle = await packageFor(base.branchId);
    const checkpoint = await packageFor(memoryFixture.checkpoint.id);
    const partial = await packageFor(memoryFixture.partial.id);
    const openingBundle = await packageFor(fixture.openingStoryId);
    const adapterBundle = await packageFor(fixture.adapterStoryId);
    const ritualBundle = fixture.ritual ? await packageFor(fixture.ritual.chatId) : null;
    const journal = await captureDeletionJournal(source);
    Object.assign(options, { deletionJournal: journal, trustedDeletionDigest: journal.sha256 });
    const path = join(process.env.STORY_TRANSFER_TARGET_UPLOADS, 'owned-story.json');
    await writePrivateJson(path, group);
    assert.deepEqual(await readPrivateJson(path), group);
    await assert.rejects(() => writePrivateJson(path, group), error => error.code === 'EEXIST');
    check('Private portable file roundtrip retains full story and refuses overwriting an existing package');
    const fingerprint = async () => (await raw`SELECT (SELECT count(*) FROM chats)::int AS chats, (SELECT count(*) FROM characters)::int AS characters, (SELECT count(*) FROM messages)::int AS messages`)[0];
    const empty = await fingerprint();
    const plan = await importStoryBundle(raw, group, options);
    assert.equal(plan.status, 'planned'); assert.deepEqual(await fingerprint(), empty);
    await assert.rejects(() => importStoryBundle(raw, group, { ...options, apply: true, expectedPlanDigest: 'wrong' }), /plan changed/);
    await assert.rejects(() => importStoryBundle(raw, group, { ...options, userId: randomUUID() }), /Target account/);
    assert.deepEqual(await fingerprint(), empty);
    check('Read-only plan, changed digest and wrong destination owner cannot write story or characters');
    for (const mutate of [
      value => { value.tables.messages[0].extra.storyAudience = [randomUUID()]; },
      value => { value.tables.story_events[0].input_message_id = 987654321; },
      value => { value.tables.story_memory_jobs[0].source_digest = '0'.repeat(64); },
      value => { value.tables.character_memory_vectors[0].embedding = '[0]'; },
      value => { value.files[0].content = Buffer.from('changed').toString('base64'); },
      value => { value.files[0].url = '/uploads/../escape'; },
      value => { value.tables.story_memory_jobs[0].status = 'running'; },
    ]) {
      const changed = structuredClone(group); mutate(changed);
      assert.throws(() => validateStoryBundle(changed));
    }
    check('Corrupt audience, cross-story source, checkpoint, vector, attachment, path and active lease all fail closed');
    const importOne = async value => {
      const reviewed = await importStoryBundle(raw, value, options);
      return importStoryBundle(raw, value, { ...options, apply: true, expectedPlanDigest: reviewed.planDigest });
    };
    let ritualBranchId;
    if (fixture.ritual) {
      for (const mutate of [
        value => { value.tables.story_states[0].values['kakaa-strength'] = 600; },
        value => { value.tables.story_events.find(event => event.version === 3).changes['kakaa-strength'].after = 600;
          value.tables.story_states[0].values['kakaa-strength'] = 600; },
        value => { value.tables.story_states[0].completed_actions = ['invented']; },
      ]) {
        const corrupted = structuredClone(ritualBundle); mutate(corrupted);
        await assert.rejects(() => importOne(corrupted), /disagree/);
        assert.deepEqual(await fingerprint(), empty);
      }
      check('Real-card corrupted state, coherent forged delta/value and invented completion reject before target writes');
    }
    const outside = join(options.uploadRoot, 'outside');
    await mkdir(outside);
    const tenantDirectory = join(options.uploadRoot, tenant.id);
    await symlink(outside, tenantDirectory);
    await assert.rejects(() => importOne(group), /symlink/);
    assert.deepEqual(await readdir(outside), []);
    await unlink(tenantDirectory);
    check('Destination symlink is rejected before creating files outside the chosen storage root');
    await raw.unsafe(`CREATE FUNCTION reject_transfer_vector() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Controlled import failure'; END; $$;
      CREATE TRIGGER reject_transfer_vector BEFORE INSERT ON character_memory_vectors FOR EACH ROW EXECUTE FUNCTION reject_transfer_vector()`);
    try {
      await assert.rejects(() => importOne(group), /Controlled import failure/);
      assert.deepEqual(await fingerprint(), empty);
      assert.deepEqual(await readdir(join(options.uploadRoot, tenant.id, 'story-transfer')), []);
      assert.equal((await raw`SELECT tgenabled FROM pg_trigger WHERE tgname='story_memory_enqueue'`)[0].tgenabled, 'O');
    } finally { await raw.unsafe('DROP TRIGGER reject_transfer_vector ON character_memory_vectors; DROP FUNCTION reject_transfer_vector()'); }
    check('Late import failure rolls back story, private characters and memory rows, restores enqueue trigger, and removes staged attachments');
    const imported = await importOne(group);
    await importOne(branchBundle);
    const [branchOrigin] = await raw`SELECT * FROM story_branches WHERE chat_id=${base.branchId}`;
    assert.equal(branchOrigin.parent_id, base.mainId);
    const [branchReading] = await raw`SELECT reading.*, message.chat_id AS source_chat FROM story_readings reading JOIN messages message ON message.id=reading.message_id WHERE reading.chat_id=${base.branchId}`;
    assert.equal(branchReading.source_chat, base.branchId);
    assert.equal(branchReading.content, branchBundle.tables.story_readings[0].content);
    check('Independent branch imports without parent: provenance survives and reading source is remapped into the child');
    assert.equal(imported.status, 'imported');
    const [restored] = await database.select().from(schema.chats).where(eq(schema.chats.id, fixture.groupId));
    assert.equal(restored.userId, user.id);
    const firstCharacter = imported.characters[fixture.characterIds[0]];
    const otherCharacter = imported.characters[fixture.characterIds[1]];
    assert.notEqual(firstCharacter, fixture.characterIds[0]);
    const summaries = await getStorySummaries(restored.id, user.id, tenant.id, firstCharacter, database, [firstCharacter]);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].content, '私下约定使用蓝色票据。');
    assert.deepEqual(await getStorySummaries(restored.id, user.id, tenant.id, otherCharacter, database, [otherCharacter]), []);
    assert.deepEqual(await getStorySummaries(restored.id, user.id, tenant.id, firstCharacter, database), []);
    check('Target account and new private cast retain frozen identity and source-valid private summaries, excluded from public/other-character contexts');
    const memories = new MemoryRepository(database);
    const retrieved = await memories.hybridSearch({ characterId: firstCharacter, userId: user.id, chatId: restored.id, embedding: vector });
    assert.equal(retrieved.length, 1);
    const ids = retrieved.map(item => item.id);
    assert.equal((await visibleStoryMemoryIds(restored.id, firstCharacter, ids, [firstCharacter], database)).size, 1);
    assert.equal((await visibleStoryMemoryIds(restored.id, otherCharacter, ids, [otherCharacter], database)).size, 0);
    check('Real pgvector retrieval and whole-batch provenance survive identifier remapping without leaking private memory');
    const [attachment] = await raw`SELECT attachments FROM messages WHERE chat_id=${restored.id} AND attachments IS NOT NULL`;
    const file = attachment.attachments[0].url;
    assert.match(file, new RegExp(`^/uploads/${tenant.id}/story-transfer/`));
    assert.equal(digest(await readFile(join(options.uploadRoot, file.slice('/uploads/'.length)))), fixture.attachmentDigest);
    const reexport = await exportStoryBundle(raw, { ...options, chatId: restored.id });
    assert.equal(reexport.files.length, 1);
    check('Local attachment bytes are verified, moved under target tenant and reexportable with no source filesystem dependency');
    await assert.rejects(() => importOne(group), /already used/);
    await importOne(candidate);
    await importOne(openingBundle);
    const adapterImport = await importOne(adapterBundle);
    const [adapterChat] = await database.select().from(schema.chats).where(eq(schema.chats.id, fixture.adapterStoryId));
    const adapterCharacter = (await raw`SELECT snapshot FROM story_content WHERE chat_id=${fixture.adapterStoryId}`)[0].snapshot.characters[0];
    assert.equal(adapterCharacter.adaptation.characterId, adapterCharacter.id);
    assert.equal(adapterCharacter.id, adapterImport.characters[fixture.adapterArtifact.characterId]);
    assert.deepEqual(adapterCharacter.adaptation, { ...fixture.adapterArtifact, characterId: adapterCharacter.id });
    assert.equal(adapterCharacter.presentation.id, fixture.presentation.id);
    assert.equal(adapterCharacter.presentation.draft.text, fixture.presentation.draft.text);
    assert.notEqual(adapterCharacter.presentation.draft.sourceRevision, fixture.presentation.draft.sourceRevision);
    revalidatePresentationDraft(adapterCharacter, adapterCharacter.presentation.draft);
    check('Frozen sourced presentation survives database restore and single-story transfer with a rebuilt character-bound proof, without original derived-version rows');
    assert.equal((await raw`SELECT count(*)::int AS count FROM story_adapter_jobs`)[0].count, 0);
    assert.equal((await getStoryState(adapterChat.id, user.id, database)).fields[0].value, 7);
    const adapterTurn = await prepareStoryTurn(adapterChat, '支付3枚', { actionId: 'pay', expectedVersion: 1 }, database);
    const [adapterInput] = await database.insert(schema.messages).values({ chatId: adapterChat.id, role: 'user', content: '支付3枚' }).returning();
    await commitStoryTurn(adapterTurn, adapterInput.id, randomUUID(), '再次支付3枚。', false, database);
    assert.equal((await getStoryState(adapterChat.id, user.id, database)).fields[0].value, 4);
    check('Frozen finite adapter transfers to remapped private character with original version/proofs; continued actions require neither source books nor original adapter job');
    if (fixture.ritual) {
      await importOne(ritualBundle);
      ritualBranchId = await verifyRitualTransfer(database, fixture.ritual, options);
      await exportStoryBundle(raw, { ...options, chatId: fixture.ritual.chatId });
      await exportStoryBundle(raw, { ...options, chatId: ritualBranchId });
      check('Original ritual card transfers without adapter jobs to another owner; pending/interrupted turns stay uncounted, continuation 6→9 and duplicate receipt add once, independent branch 3→6 reexports');
    }
    const [transferredOpening] = await raw`SELECT snapshot FROM story_content WHERE chat_id=${fixture.openingStoryId}`;
    const openingCharacter = transferredOpening.snapshot.characters[0];
    assert.equal(openingCharacter.opening.characterId, openingCharacter.id);
    assert.notEqual(openingCharacter.id, openingBundle.tables.story_content[0].snapshot.characters[0].id);
    assert.deepEqual(openingCharacter.opening.reference, { source: 'alternate_greetings', index: 0 });
    const [openingMessage] = await raw`SELECT content FROM messages WHERE chat_id=${fixture.openingStoryId} ORDER BY id LIMIT 1`;
    assert.equal(openingMessage.content, openingBundle.tables.messages[0].content);
    assert.deepEqual(openingCharacter.openingRecord, fixture.openingRecord);
    const initialView = await getStoryState(fixture.openingStoryId, user.id, database);
    assert.deepEqual(initialView.openingRecord, fixture.openingRecord);
    assert.deepEqual(openingCharacter.adaptationReport, fixture.adaptationReport);
    assert.deepEqual(initialView.adaptationReport, fixture.adaptationReport);
    check('Frozen compatibility report survives portable character remapping and source edits without recomputation');
    assert.deepEqual(initialView.fields, []);
    assert.equal(initialView.native, false);
    check('Frozen opening record survives portable export/import and changed source without becoming current state');
    check('Selected-opening story remaps its character reference while preserving source index, revision and original opening text');
    let view = await getStoryState(fixture.proposalId, user.id, database);
    assert.equal(view.events[0].status, 'proposed');
    assert.equal((await raw`SELECT count(*)::int AS count FROM story_memory_progress WHERE chat_id=${fixture.proposalId}`)[0].count, 0);
    const [proposalMessage] = await database.select().from(schema.messages).where(eq(schema.messages.chatId, fixture.proposalId)).orderBy(schema.messages.id);
    const [assistant] = await raw`SELECT id, extra FROM messages WHERE chat_id=${fixture.proposalId} AND role='assistant'`;
    assert.equal(assistant.extra.storyIntent.intent.facts[0].kind, 'claim');
    const [accepted] = await raw`SELECT user_message_id, status FROM generation_requests WHERE chat_id=${fixture.proposalId} AND request_id=${fixture.acceptedRequest}`;
    assert.equal(Number(accepted.user_message_id), proposalMessage.id);
    assert.equal(accepted.status, 'completed');
    assert.equal(Number((await raw`SELECT message_id FROM message_bookmarks WHERE user_id=${user.id}`)[0].message_id), proposalMessage.id);
    assert.equal(Number((await raw`SELECT message_id FROM message_reactions WHERE user_id=${user.id}`)[0].message_id), proposalMessage.id);
    assert.equal(Number((await raw`SELECT trigger_message_id FROM character_emotions WHERE chat_id=${fixture.proposalId}`)[0].trigger_message_id), proposalMessage.id);
    assert.equal((await raw`SELECT count(*)::int AS count FROM chat_creation_requests WHERE chat_id=${fixture.proposalId} AND user_id=${user.id}`)[0].count, 1);
    check('Completed generation receipt and remapped user-message source preserve duplicate-request rejection without copying platform credit balances');
    check('Creation receipt, owner bookmarks/reactions and story-scoped emotion retain mapped owners and message references');
    const [proposalChat] = await database.select().from(schema.chats).where(eq(schema.chats.id, fixture.proposalId));
    const turn = await prepareStoryTurn(proposalChat, proposalMessage.content, { proposalMessageId: Number(assistant.id), expectedVersion: view.version }, database);
    const [confirmation] = await database.insert(schema.messages).values({ chatId: proposalChat.id, role: 'user', content: proposalMessage.content }).returning();
    await commitStoryTurn(turn, confirmation.id, randomUUID(), '取得通行凭证。', false, database);
    view = await getStoryState(proposalChat.id, user.id, database);
    assert.equal(view.fields.find(field => field.id === 'permit').value, true);
    check('Restored pending candidate does not enter memory or execute early; explicit confirmation continues through real state transaction');
    await importOne(checkpoint);
    await raw`UPDATE story_memory_jobs SET available_at=now()-interval '1 second' WHERE chat_id=${memoryFixture.checkpoint.id}`;
    assert.equal(await new StoryMemoryWorker(database, { extract: async () => { throw new Error('Must reuse restored checkpoint'); }, embed: providers.embed }, settings).runOnce(), 'succeeded');
    await importOne(partial);
    assert.equal((await raw`SELECT cardinality(event_ids)::int AS count FROM story_memory_progress WHERE chat_id=${memoryFixture.partial.id}`)[0].count, 3);
    check('Restored retry reuses extracted checkpoint without another model call; unfinished batch and interrupted history remain intact');
    assert.match(process.env.STORY_TRANSFER_TARGET_CONTAINER, /^squaretable-story-transfer-target-[0-9a-f-]{36}$/);
    await Promise.all([client.end(), raw.end()]);
    await promisify(execFile)('docker', ['restart', process.env.STORY_TRANSFER_TARGET_CONTAINER]);
    const { stdout } = await promisify(execFile)('docker', ['port', process.env.STORY_TRANSFER_TARGET_CONTAINER, '5432/tcp']);
    const hostPort = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/);
    assert.ok(hostPort, 'Restarted disposable database must remain on loopback');
    const restartedUrl = new URL(activeTargetUrl);
    restartedUrl.port = hostPort[1];
    activeTargetUrl = restartedUrl.toString();
    client = connect(activeTargetUrl); raw = connect(activeTargetUrl); database = drizzle(client, { schema });
    const deadline = Date.now() + 30000;
    while (true) {
      try { await raw`SELECT 1`; break; }
      catch { assert.ok(Date.now() < deadline, 'Isolated target did not restart'); await new Promise(resolve => setTimeout(resolve, 300)); }
    }
    assert.deepEqual(await getStorySummaries(restored.id, user.id, tenant.id, firstCharacter, database, [firstCharacter]), summaries);
    assert.equal((await new MemoryRepository(database).hybridSearch({ characterId: firstCharacter, userId: user.id, chatId: restored.id, embedding: vector })).length, 1);
    assert.equal((await getStoryState(proposalChat.id, user.id, database)).version, view.version);
    assert.equal((await getStoryState(adapterChat.id, user.id, database)).fields[0].value, 4);
    check('Actual target database restart preserves imported summaries, vector retrieval, private scope and confirmed action state');
    if (fixture.ritual) {
      await verifyRitualRestart(database, fixture.ritual, ritualBranchId, options);
      await exportStoryBundle(raw, { ...options, chatId: fixture.ritual.chatId });
      check('Restarted independent target continues frozen ritual 9→12 while branch remains 6, with reexport state replay validation');
    }
    await database.delete(schema.chats).where(eq(schema.chats.id, restored.id));
    await assert.rejects(() => importOne(group), /already used/);
    assert.equal((await raw`SELECT count(*)::int AS count FROM character_memories WHERE source_chat_id=${restored.id}`)[0].count, 0);
    check('Deleting an imported story cascades derived memories and permanently rejects reimport of the same story ID');
    const busy = connect(activeTargetUrl);
    try {
      await busy.begin(async transaction => {
        await transaction`LOCK TABLE chats IN ACCESS SHARE MODE`;
        const unused = await packageFor(base.otherId);
        const freshJournal = await captureDeletionJournal(source);
        await assert.rejects(() => importStoryBundle(raw, unused, { ...options, deletionJournal: freshJournal, trustedDeletionDigest: freshJournal.sha256 }), error => error.code === '55P03');
      });
    } finally { await busy.end(); }
    check('An active target reader prevents offline import instead of racing running application writes');
    await assert.rejects(() => replayDeletionJournal(raw, journal, 'wrong'), /digest required/);
    await assert.rejects(() => replayDeletionJournal(raw, journal, journal.sha256), /same lineage/);
    check('Standalone deletion artifact requires explicit trusted digest and cannot be replayed across unrelated database lineage');
    const cliBundle = join(options.uploadRoot, 'cli-story.json');
    const cliJournal = join(options.uploadRoot, 'cli-deletions.json');
    const execute = promisify(execFile);
    const sourceEnvironment = { ...process.env, STORY_TRANSFER_DATABASE_URL: process.env.STORY_TRANSFER_SOURCE_DATABASE_URL,
      STORY_TRANSFER_UPLOAD_ROOT: exportOptions.uploadRoot, STORY_DELETION_SOURCE_DATABASE_URL: process.env.STORY_TRANSFER_SOURCE_DATABASE_URL };
    const exported = await execute(process.execPath, ['--import', 'tsx', 'scripts/story-transfer.mjs', 'export', cliBundle, base.userId, base.tenantId, base.otherId], { env: sourceEnvironment });
    assert.equal(JSON.parse(exported.stdout).status, 'exported');
    const captured = await execute(process.execPath, ['scripts/story-deletion-journal.mjs', 'export', cliJournal], { env: sourceEnvironment });
    const targetEnvironment = { ...process.env, STORY_TRANSFER_DATABASE_URL: activeTargetUrl,
      STORY_TRANSFER_UPLOAD_ROOT: options.uploadRoot, STORY_TRANSFER_DELETION_SHA256: JSON.parse(captured.stdout).sha256 };
    const planned = await execute(process.execPath, ['--import', 'tsx', 'scripts/story-transfer.mjs', 'plan', cliBundle, user.id, tenant.id, cliJournal], { env: targetEnvironment });
    const applied = await execute(process.execPath, ['--import', 'tsx', 'scripts/story-transfer.mjs', 'apply', cliBundle, user.id, tenant.id, cliJournal, JSON.parse(planned.stdout).planDigest], { env: targetEnvironment });
    assert.equal(JSON.parse(applied.stdout).status, 'imported');
    assert.equal((await getStoryState(base.otherId, user.id, database)).version, 1);
    check('Real CLI export, independent deletion snapshot, read-only plan and digest-confirmed apply restore a nonempty story to the target owner');
    await checkStoryDeletionRaces({ database, raw, userId: user.id, tenantId: tenant.id, characterId: proposalChat.characterId, check });
    await writeFile(process.env.STORY_TRANSFER_BEHAVIOR, JSON.stringify({ checks, modelCalls: 0, target: 'fresh independent PostgreSQL with different owner', artifacts: 'private synthetic bundles and local attachments, removed after run' }, null, 2), { mode: 0o600 });
    console.info(`PASS: ${checks.length} portable story checks`);
  }
} finally {
  await Promise.all([client.end(), raw.end(), source?.end()]);
}
