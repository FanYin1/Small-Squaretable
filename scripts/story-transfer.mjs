import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { resolve, sep, extname, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { z } from 'zod';
import { transferTables, digest, localReferences, localReferencePattern, safeUploadPath, validateStoryBundle, memorySources } from './story-transfer-format.mjs';
import { readPrivateJson, writePrivateJson, writePrivateBytes, syncDirectory, validateDeletionJournal } from './story-deletion-journal.mjs';
import { transferPresentation } from './story-presentation-transfer.mjs';

const uuid = value => z.string().uuid().parse(value);
async function schemaFingerprint(client) {
  const dependencies = await client`SELECT DISTINCT relation.relname AS name FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_class referenced ON referenced.oid=constraint_row.confrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE constraint_row.contype='f' AND namespace.nspname='public' AND referenced.relname=ANY(${transferTables})`;
  assert.ok(dependencies.every(row => transferTables.includes(row.name) || row.name === 'chat_snapshots'), 'Unsupported new story dependency; update transfer protocol before export/import');
  return client`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY(${transferTables}) ORDER BY table_name, ordinal_position`;
}
async function selectRows(client, table, condition, parameters) {
  return (await client.unsafe(`SELECT to_jsonb(record) - 'search_vector' AS data FROM ${table} record WHERE ${condition}`, parameters)).map(item => item.data);
}
export async function exportStoryBundle(source, { chatId, userId, tenantId, uploadRoot }) {
  [chatId, userId, tenantId].forEach(uuid);
  const bundle = await source.begin('isolation level repeatable read read only', async transaction => {
    const chats = await selectRows(transaction, 'chats', 'id=$1 AND user_id=$2 AND tenant_id=$3', [chatId, userId, tenantId]);
    assert.equal(chats.length, 1, 'Story unavailable for this owner');
    const lineage = await transaction`SELECT id FROM story_restore_lineage`;
    assert.equal(lineage.length, 1);
    const tables = { chats };
    for (const table of transferTables.slice(1)) {
      const condition = table === 'character_memories' ? 'source_chat_id=$1' : table === 'character_memory_vectors'
        ? 'memory_id IN (SELECT id FROM character_memories WHERE source_chat_id=$1)' : table === 'story_memory_links'
          ? 'job_id IN (SELECT id FROM story_memory_jobs WHERE chat_id=$1)' : ['message_bookmarks', 'message_reactions'].includes(table)
            ? 'message_id IN (SELECT id FROM messages WHERE chat_id=$1) AND user_id=$2' : 'chat_id=$1';
      tables[table] = await selectRows(transaction, table, condition, condition.includes('$2') ? [chatId, userId] : [chatId]);
    }
    return { format: 'small-squaretable.admin-story', version: 1, exportedAt: new Date().toISOString(),
      lineageId: lineage[0].id, schema: Array.from(await schemaFingerprint(transaction)), tables, files: [] };
  });
  const root = await realpath(uploadRoot);
  let total = 0;
  for (const url of localReferences(bundle.tables)) {
    const path = resolve(root, safeUploadPath(url));
    const resolved = await realpath(path);
    assert.ok(resolved.startsWith(`${root}${sep}`) && resolved === path && !(await lstat(path)).isSymbolicLink(), 'Attachment escapes storage or uses symlink');
    const stat = await lstat(path);
    total += stat.size;
    assert.ok(stat.isFile() && total <= 64 * 1024 * 1024, 'Attachment budget exceeded');
    const bytes = await readFile(path);
    bundle.files.push({ url, sha256: digest(bytes), content: bytes.toString('base64') });
  }
  assert.ok(Buffer.byteLength(JSON.stringify(bundle)) <= 100 * 1024 * 1024, 'Portable bundle exceeds 100 MiB');
  return validateStoryBundle(bundle);
}

function remapReferences(tables, maps, owner) {
  const mapped = structuredClone(tables);
  const reference = (kind, value) => {
    if (value === null) return null;
    assert.ok(maps[kind].has(value), `Unknown ${kind} reference`);
    return maps[kind].get(value);
  };
  for (const [name, rows] of Object.entries(mapped)) for (const row of rows) {
    if ('id' in row && maps[name]) row.id = reference(name, row.id);
    for (const [field, kind] of Object.entries({ character_id: 'characters', source_message_id: 'messages', parent_message_id: 'messages',
      input_message_id: 'messages', message_id: 'messages', user_message_id: 'messages', trigger_message_id: 'messages', last_read_message_id: 'messages', memory_id: 'character_memories',
      job_id: 'story_memory_jobs', event_id: 'story_events' })) if (field in row) row[field] = reference(kind, row[field]);
    if ('user_id' in row) row.user_id = owner.userId;
    if ('tenant_id' in row) row.tenant_id = owner.tenantId;
    for (const field of ['event_ids', 'source_event_ids']) if (field in row) row[field] = row[field].map(value => reference('story_events', value));
  }
  const chat = mapped.chats[0];
  chat.persona_id = null;
  chat.metadata = { ...chat.metadata, storyTransfer: { originalOwner: tables.chats[0].user_id, originalTenant: tables.chats[0].tenant_id } };
  if (chat.metadata.mentionedCharacterIds) chat.metadata.mentionedCharacterIds = chat.metadata.mentionedCharacterIds.map(id => reference('characters', id));
  const identity = chat.identity_snapshot;
  identity.userId = owner.userId; identity.tenantId = owner.tenantId;
  if (identity.source === 'account') identity.sourceId = owner.userId;
  const { revision, capturedAt, ...identityContent } = identity;
  identity.revision = digest(identityContent);
  for (const character of mapped.story_content[0].snapshot.characters) {
    character.id = reference('characters', character.id);
    if (character.opening) character.opening.characterId = reference('characters', character.opening.characterId);
    if (character.adaptation) character.adaptation.characterId = reference('characters', character.adaptation.characterId);
  }
  mapped.story_content[0].snapshot.revision = digest(mapped.story_content[0].snapshot.characters);
  for (const binding of mapped.story_worldbooks[0].snapshot.bindings) {
    binding.characterId = reference('characters', binding.characterId);
    for (const book of binding.books) for (const entry of book.entries) entry.characterFilter = entry.characterFilter.map(id => maps.characters.get(id) ?? id);
  }
  mapped.story_worldbooks[0].snapshot.revision = digest(mapped.story_worldbooks[0].snapshot.bindings);
  for (const message of mapped.messages) if (message.extra?.storyAudience) message.extra.storyAudience = message.extra.storyAudience.map(id => reference('characters', id));
  mapped.story_states[0].sources = Object.fromEntries(Object.entries(mapped.story_states[0].sources).map(([key, value]) => [key, reference('story_events', value)]));
  for (const job of mapped.story_memory_jobs) if (job.extracted !== null) {
    const facts = Array.isArray(job.extracted) ? job.extracted : job.extracted.facts;
    for (const fact of facts) fact.sourceMessageIds = fact.sourceMessageIds.map(id => reference('messages', id));
    if (job.extracted.summary) job.extracted.summary.sourceMessageIds = job.extracted.summary.sourceMessageIds.map(id => reference('messages', id));
    job.source_digest = digest(memorySources(mapped, job));
  }
  return mapped;
}

async function insertRecord(transaction, table, row, columns) {
  const allowed = columns.filter(column => column.table_name === table).map(column => column.column_name);
  const keys = Object.keys(row);
  assert.ok(keys.length && keys.every(key => allowed.includes(key)), `Unsupported column in ${table}`);
  const names = keys.map(key => `"${key}"`).join(',');
  await transaction.unsafe(`INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_populate_record(NULL::${table}, $1::jsonb)`, [transaction.json(row)]);
}

export async function importStoryBundle(target, input, options) {
  const bundle = validateStoryBundle(input);
  const journal = validateDeletionJournal(options.deletionJournal);
  assert.equal(journal.sha256, options.trustedDeletionDigest, 'Trusted deletion digest required');
  assert.equal(journal.snapshot.lineageId, bundle.lineageId, 'Unrelated deletion evidence');
  assert.ok(Date.parse(journal.capturedAt) >= Date.parse(bundle.exportedAt), 'Deletion journal predates the bundle');
  assert.ok(Date.parse(journal.capturedAt) <= Date.now() + 1000, 'Deletion journal is from the future');
  const chatId = bundle.tables.chats[0].id;
  assert.ok(!journal.snapshot.deletions.some(item => item.chatId === chatId), 'Source story was deleted');
  [options.userId, options.tenantId].forEach(uuid);
  let createdDirectory;
  try {
    return await target.begin(async transaction => {
      await transaction`SET LOCAL lock_timeout = '5s'`;
      await transaction.unsafe(`LOCK TABLE ${transferTables.join(',')}, characters, users, story_id_reservations, story_deletions IN ACCESS EXCLUSIVE MODE NOWAIT`);
      const owner = await transaction`SELECT id FROM users WHERE id=${options.userId} AND tenant_id=${options.tenantId}`;
      assert.equal(owner.length, 1, 'Target account and tenant must already exist');
      assert.equal((await transaction`SELECT chat_id FROM story_id_reservations WHERE chat_id=${chatId}`).length, 0, 'Story ID already used or deleted; refusing overwrite');
      const columns = Array.from(await schemaFingerprint(transaction));
      assert.deepEqual(columns, bundle.schema, 'Incompatible source/target schema');
      const lineage = (await transaction`SELECT id FROM story_restore_lineage`)[0].id;
      const plan = { bundleSha256: digest(bundle), deletionSha256: journal.sha256, targetLineage: lineage,
        userId: options.userId, tenantId: options.tenantId, chatId, rows: Object.fromEntries(transferTables.map(table => [table, bundle.tables[table].length])), attachments: bundle.files.length };
      const planDigest = digest(plan);
      if (!options.apply) return { status: 'planned', planDigest, ...plan };
      assert.equal(options.expectedPlanDigest, planDigest, 'Import plan changed; review again');
      const maps = { characters: new Map(bundle.tables.story_content[0].snapshot.characters.map(character => [character.id, randomUUID()])) };
      for (const table of transferTables) if (table !== 'chats') {
        maps[table] = new Map();
        for (const row of bundle.tables[table]) if ('id' in row) {
          const nextId = table === 'messages' ? Number((await transaction`SELECT nextval(pg_get_serial_sequence('messages','id')) AS id`)[0].id) : randomUUID();
          assert.ok(table !== 'messages' || Number.isSafeInteger(nextId));
          maps[table].set(row.id, nextId);
        }
      }
      let tables = remapReferences(bundle.tables, maps, options);
      const root = await realpath(options.uploadRoot);
      assert.equal((await lstat(root)).uid, process.geteuid(), 'Run the import as the application storage owner');
      const replacements = new Map();
      if (bundle.files.length) {
        const parent = join(root, options.tenantId, 'story-transfer');
        for (const path of [join(root, options.tenantId), parent]) {
          try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
          const stat = await lstat(path);
          assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Target attachment directory uses symlink');
          await syncDirectory(dirname(path));
        }
        assert.equal(await realpath(parent), parent, 'Target attachment directory uses symlink');
        const directory = join(parent, `${chatId}-${randomUUID()}`);
        await mkdir(directory, { mode: 0o700 }); createdDirectory = directory;
        await syncDirectory(parent);
        for (const file of bundle.files) {
          const name = `${randomUUID()}${extname(file.url)}`;
          await writePrivateBytes(join(directory, name), Buffer.from(file.content, 'base64'));
          replacements.set(file.url, `/uploads/${options.tenantId}/story-transfer/${directory.split(sep).at(-1)}/${name}`);
        }
      }
      function rewrite(value) {
        if (typeof value === 'string') {
          return value.replace(localReferencePattern, path => replacements.get(path) ?? path);
        }
        if (Array.isArray(value)) return value.map(rewrite);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
        return value;
      }
      tables = rewrite(tables);
      for (const [index, character] of tables.story_content[0].snapshot.characters.entries()) {
        const original = bundle.tables.story_content[0].snapshot.characters[index];
        if (original.presentation) character.presentation = transferPresentation(original, character, rewrite);
      }
      tables.chats[0].metadata.storyTransfer = { ...tables.chats[0].metadata.storyTransfer,
        lineageId: bundle.lineageId, bundleSha256: digest(bundle), originalIdentityRevision: bundle.tables.chats[0].identity_snapshot.revision,
        originalContentRevision: bundle.tables.story_content[0].snapshot.revision, originalWorldbookRevision: bundle.tables.story_worldbooks[0].snapshot.revision };
      tables.story_content[0].snapshot.revision = digest(tables.story_content[0].snapshot.characters);
      tables.story_worldbooks[0].snapshot.revision = digest(tables.story_worldbooks[0].snapshot.bindings);
      for (const job of tables.story_memory_jobs) if (job.extracted !== null) job.source_digest = digest(memorySources(tables, job));
      const destinationFiles = bundle.files.map(file => ({ ...file, url: replacements.get(file.url) }));
      validateStoryBundle({ ...bundle, tables, files: destinationFiles });
      for (const character of tables.story_content[0].snapshot.characters) await transaction`
        INSERT INTO characters (id, tenant_id, creator_id, name, description, avatar_url, prompt_template, card_data, is_public, moderation_status)
        VALUES (${character.id}, ${options.tenantId}, ${options.userId}, ${character.name}, ${character.description}, ${character.avatarUrl},
          ${character.promptTemplate}, ${transaction.json(character.cardData)}, false, 'draft')`;
      const [enqueue] = await transaction`SELECT tgenabled FROM pg_trigger WHERE tgrelid='story_events'::regclass AND tgname='story_memory_enqueue'`;
      assert.equal(enqueue?.tgenabled, 'O', 'Memory enqueue trigger must be enabled before import');
      await transaction`ALTER TABLE story_events DISABLE TRIGGER story_memory_enqueue`;
      for (const table of transferTables) for (const row of tables[table]) await insertRecord(transaction, table, row, columns);
      await transaction`ALTER TABLE story_events ENABLE TRIGGER story_memory_enqueue`;
      return { status: 'imported', planDigest, ...plan, characters: Object.fromEntries(maps.characters), messageCount: tables.messages.length };
    });
  } catch (error) {
    if (createdDirectory) await rm(createdDirectory, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, file, userId, tenantId, argument, expectedPlanDigest] = process.argv.slice(2);
  assert.ok(['export', 'plan', 'apply'].includes(operation) && file && userId && tenantId, 'Usage: export FILE USER TENANT CHAT | plan FILE USER TENANT JOURNAL | apply FILE USER TENANT JOURNAL PLAN_SHA256');
  const url = process.env.STORY_TRANSFER_DATABASE_URL;
  assert.ok(url && process.env.STORY_TRANSFER_UPLOAD_ROOT, 'Explicit database and upload root required');
  const client = postgres(url, { max: 1 });
  try {
    const common = { userId, tenantId, uploadRoot: process.env.STORY_TRANSFER_UPLOAD_ROOT };
    if (operation === 'export') {
      const bundle = await exportStoryBundle(client, { ...common, chatId: argument });
      await writePrivateJson(file, bundle);
      console.info(JSON.stringify({ status: 'exported', sha256: digest(bundle), messages: bundle.tables.messages.length, attachments: bundle.files.length }));
    } else {
      const result = await importStoryBundle(client, await readPrivateJson(file), { ...common,
        deletionJournal: await readPrivateJson(argument), trustedDeletionDigest: process.env.STORY_TRANSFER_DELETION_SHA256,
        apply: operation === 'apply', expectedPlanDigest });
      console.info(JSON.stringify(result));
    }
  } finally { await client.end(); }
}
