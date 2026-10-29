import assert from 'node:assert/strict';

export const restoreTables = {
  tenants: ['tenants', 'id'], users: ['users', 'id'], characters: ['characters', 'id'],
  personas: ['user_personas', 'id'], books: ['worldbooks', 'id'], entries: ['worldbook_entries', 'id'],
  chats: ['chats', 'id'], participants: ['chat_characters', 'id'], creationRequests: ['chat_creation_requests', 'id'],
  messages: ['messages', 'id'], content: ['story_content', 'chat_id'], worldbooks: ['story_worldbooks', 'chat_id'],
  state: ['story_states', 'chat_id'], events: ['story_events', 'id'], notes: ['story_notes', 'id'],
  memories: ['character_memories', 'id'], vectors: ['character_memory_vectors', 'id'],
  lineage: ['story_restore_lineage', 'id'], reservations: ['story_id_reservations', 'chat_id'], deletions: ['story_deletions', 'chat_id'],
  migrations: ['beta_release.__drizzle_migrations', 'id'],
  memoryProgress: ['story_memory_progress', 'chat_id, character_id'],
  memoryJobs: ['story_memory_jobs', 'id'], memoryLinks: ['story_memory_links', 'memory_id, event_id, message_id'],
  branches: ['story_branches', 'chat_id'], readings: ['story_readings', 'id'],
};

export const storyRestoreFingerprintSql = `SELECT jsonb_build_object(
  'protocol', 2,
  'tables', jsonb_build_object(${Object.entries(restoreTables).map(([name, [table, order]]) =>
    `'${name}', (SELECT jsonb_build_object('rows', count(*), 'digest', md5(coalesce(string_agg(row_to_json(item)::text, '' ORDER BY ${order}), ''))) FROM ${table} item)`
  ).join(',\n')}),
  'coverage', jsonb_build_object(
    'identities', (SELECT count(*) FROM chats WHERE identity_snapshot IS NOT NULL),
    'confirmedEvents', (SELECT count(*) FROM story_events WHERE status = 'confirmed'),
    'interruptedEvents', (SELECT count(*) FROM story_events WHERE status = 'interrupted'),
    'boundEntries', (SELECT count(*) FROM story_worldbooks,
      LATERAL jsonb_array_elements(snapshot->'bindings') binding,
      LATERAL jsonb_array_elements(binding->'books') book,
      LATERAL jsonb_array_elements(book->'entries') entry),
    'sourcedMemories', (SELECT count(*) FROM character_memories memory
      JOIN messages message ON message.id = memory.source_message_id AND message.chat_id = memory.source_chat_id
      JOIN character_memory_vectors vector ON vector.memory_id = memory.id WHERE vector.embedding IS NOT NULL),
    'invalidMemorySources', (SELECT count(*) FROM character_memories memory LEFT JOIN messages message ON message.id = memory.source_message_id
      WHERE memory.source_message_id IS NOT NULL AND (message.id IS NULL OR message.chat_id IS DISTINCT FROM memory.source_chat_id)),
    'invalidEventSources', (SELECT count(*) FROM story_events event
      LEFT JOIN messages input ON input.id = event.input_message_id LEFT JOIN messages output ON output.id = event.message_id
      WHERE input.id IS NULL OR output.id IS NULL OR input.chat_id <> event.chat_id OR output.chat_id <> event.chat_id
        OR input.role <> 'user' OR output.role <> 'assistant'),
    'invalidMemoryLinks', (SELECT count(*) FROM story_memory_links link
      JOIN character_memories memory ON memory.id = link.memory_id JOIN story_memory_jobs job ON job.id = link.job_id
      JOIN story_events event ON event.id = link.event_id JOIN messages message ON message.id = link.message_id
      WHERE memory.source_chat_id IS DISTINCT FROM event.chat_id OR message.chat_id <> event.chat_id OR job.chat_id <> event.chat_id
        OR memory.character_id <> job.character_id OR event.status <> 'confirmed' OR NOT (event.id = ANY(job.source_event_ids))
        OR message.id NOT IN (event.input_message_id, event.message_id)),
    'invalidStateSources', (SELECT count(*) FROM story_states state, LATERAL jsonb_each_text(state.sources) source
      LEFT JOIN story_events event ON event.id::text = source.value
      WHERE event.id IS NULL OR event.chat_id <> state.chat_id OR event.status <> 'confirmed')
  )
) AS fingerprint`;

const requiredTables = ['chats', 'messages', 'content', 'worldbooks', 'state', 'events', 'notes', 'memories', 'vectors', 'migrations'];
const requiredCoverage = ['identities', 'confirmedEvents', 'interruptedEvents', 'boundEntries', 'sourcedMemories'];
const invalidCoverage = ['invalidMemorySources', 'invalidEventSources', 'invalidStateSources', 'invalidMemoryLinks'];

export function assertNonemptyStoryCoverage(fingerprint) {
  assert.equal(fingerprint.protocol, 2, 'Restore evidence must include counts, vectors and source checks');
  for (const name of requiredTables) {
    assert.ok(Number.isInteger(fingerprint.tables?.[name]?.rows) && fingerprint.tables[name].rows > 0, `Nonempty restore sample required: ${name}`);
    assert.match(fingerprint.tables[name].digest, /^[a-f0-9]{32}$/);
    assert.notEqual(fingerprint.tables[name].digest, 'd41d8cd98f00b204e9800998ecf8427e', `Empty digest cannot prove ${name} recovery`);
  }
  for (const name of invalidCoverage) assert.equal(fingerprint.coverage?.[name], 0, `Broken restore source links: ${name}`);
  for (const name of requiredCoverage) assert.ok(fingerprint.coverage?.[name] > 0, `Missing restore coverage: ${name}`);
}

export function assertMatchingStoryRestore(before, restored) {
  assertNonemptyStoryCoverage(before);
  assertNonemptyStoryCoverage(restored);
  assert.deepEqual(restored, before, 'Restored story counts, contents, vectors and source links must match');
}
