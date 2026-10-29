import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { z } from 'zod';
import { planStoryMemoryBackfill } from './story-memory-backfill-plan.mjs';

const scopeSchema = z.object({ chatId: z.string().uuid(), characterId: z.string().uuid(), maxJobs: z.number().int().min(1).max(100).default(100) }).strict();
const reviewSchema = z.string().regex(/^[a-f0-9]{64}$/);

async function loadPlan(transaction, scope, apply) {
  const [state] = await transaction`SELECT version FROM story_states WHERE chat_id = ${scope.chatId} ${apply ? transaction`FOR UPDATE` : transaction``}`;
  const [chat] = await transaction`SELECT content_snapshot_version FROM chats WHERE id = ${scope.chatId} ${apply ? transaction`FOR SHARE` : transaction``}`;
  if (!chat) throw new Error('MEMORY_BACKFILL_STORY_NOT_FOUND');
  if (chat.content_snapshot_version !== 1) throw new Error('MEMORY_BACKFILL_LEGACY_UNSUPPORTED');
  if (!state) throw new Error('MEMORY_BACKFILL_STATE_UNAVAILABLE');
  const [participant] = await transaction`SELECT 1 FROM story_content WHERE chat_id = ${scope.chatId}
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot->'characters') AS member WHERE member->>'id' = ${scope.characterId})`;
  if (!participant) throw new Error('MEMORY_BACKFILL_CHARACTER_UNAVAILABLE');
  const sources = [];
  let cursor = 0;
  let scanned = 0;
  while (true) {
    const events = await transaction`SELECT id, version, input_message_id, message_id FROM story_events
      WHERE chat_id = ${scope.chatId} AND status = 'confirmed' AND version > ${cursor}
      ORDER BY version LIMIT 200 ${apply ? transaction`FOR SHARE` : transaction``}`;
    if (!events.length) break;
    scanned += events.length;
    if (scanned > 100000) throw new Error('MEMORY_BACKFILL_LIMIT_EXCEEDED');
    const messageIds = events.flatMap(event => [event.input_message_id, event.message_id]).filter(Boolean);
    if (apply && messageIds.length) {
      await transaction`SELECT id FROM messages WHERE id IN ${transaction(messageIds)} ORDER BY id FOR SHARE`;
    }
    const rows = await transaction`SELECT event.id AS event_id, event.version, event.request_id,
    input.id AS input_id, encode(sha256(convert_to(input.content, 'UTF8')), 'hex') AS input_hash,
    input.chat_id AS input_chat, input.role AS input_role, input.extra->>'stateStatus' AS input_status,
    reply.id AS reply_id, encode(sha256(convert_to(reply.content, 'UTF8')), 'hex') AS reply_hash,
    reply.chat_id AS reply_chat, reply.role AS reply_role, reply.extra->>'stateStatus' AS reply_status,
    reply.extra->'storyVersion' AS reply_version, reply.extra->>'storyRequestId' AS reply_request,
    coalesce(reply.character_id, chat.character_id) AS character_id
    FROM story_events event JOIN chats chat ON chat.id = event.chat_id
    LEFT JOIN messages input ON input.id = event.input_message_id LEFT JOIN messages reply ON reply.id = event.message_id
    WHERE event.chat_id = ${scope.chatId} AND event.id IN ${transaction(events.map(event => event.id))} ORDER BY event.version`;
    for (const row of rows) {
    if (!row.character_id || row.input_chat !== scope.chatId || row.reply_chat !== scope.chatId || row.input_role !== 'user' || row.reply_role !== 'assistant' ||
      row.input_status === 'interrupted' || row.reply_status !== 'confirmed' || row.reply_version !== row.version ||
      row.reply_request !== row.request_id || !Number.isSafeInteger(Number(row.input_id)) || Number(row.input_id) < 1 ||
      !Number.isSafeInteger(Number(row.reply_id)) || Number(row.reply_id) < 1) {
      throw new Error('MEMORY_BACKFILL_SOURCE_INVALID');
    }
    if (row.character_id === scope.characterId) sources.push({ eventId: row.event_id, version: row.version,
      inputMessageId: Number(row.input_id), messageId: Number(row.reply_id), inputHash: row.input_hash, replyHash: row.reply_hash });
    }
    cursor = events.at(-1).version;
  }
  const jobs = [];
  let jobCursor;
  while (true) {
    const page = await transaction`SELECT id, source_event_ids FROM story_memory_jobs WHERE chat_id = ${scope.chatId}
      AND character_id = ${scope.characterId} ${jobCursor ? transaction`AND id > ${jobCursor}::uuid` : transaction``} ORDER BY id LIMIT 200`;
    if (!page.length) break;
    jobs.push(...page);
    if (jobs.length > 20000) throw new Error('MEMORY_BACKFILL_LIMIT_EXCEEDED');
    jobCursor = page.at(-1).id;
  }
  const [progress] = await transaction`SELECT event_ids FROM story_memory_progress WHERE chat_id = ${scope.chatId} AND character_id = ${scope.characterId}
    ${apply ? transaction`FOR UPDATE` : transaction``}`;
  return planStoryMemoryBackfill({ ...scope, version: state.version, sources,
    jobs: jobs.map(job => ({ id: job.id, sourceEventIds: job.source_event_ids })), progress: progress?.event_ids ?? [] });
}

export async function inspectStoryMemoryHistory(client, scope) {
  scope = scopeSchema.parse(scope);
  return client.begin('isolation level repeatable read read only', async transaction => {
    await transaction`SET LOCAL statement_timeout = '15s'`;
    return (await loadPlan(transaction, scope, false)).report;
  });
}

export async function backfillStoryMemoryHistory(client, scope, expectedReview) {
  scope = scopeSchema.parse(scope); reviewSchema.parse(expectedReview);
  return client.begin(async transaction => {
    await transaction`SET LOCAL lock_timeout = '2s'`;
    await transaction`SET LOCAL statement_timeout = '15s'`;
    const plan = await loadPlan(transaction, scope, true);
    if (plan.report.reviewHash !== expectedReview) throw new Error('MEMORY_BACKFILL_REVIEW_STALE');
    for (const batch of plan.batches) {
      await transaction`INSERT INTO story_memory_jobs (chat_id, character_id, source_event_ids) VALUES (${scope.chatId}, ${scope.characterId}, ${batch})`;
    }
    if (plan.report.progressChanged) {
      await transaction`INSERT INTO story_memory_progress (chat_id, character_id, event_ids) VALUES (${scope.chatId}, ${scope.characterId}, ${plan.remaining})
        ON CONFLICT (chat_id, character_id) DO UPDATE SET event_ids = EXCLUDED.event_ids`;
    }
    return { ...plan.report, applied: true, createdJobs: plan.batches.length };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--apply' && !parsed.apply) parsed.apply = true;
    else if (['--chat', '--character', '--expected-review', '--max-jobs'].includes(flag) && parsed[flag] === undefined) parsed[flag] = args[++index];
    else throw new Error('MEMORY_BACKFILL_ARGUMENTS_INVALID');
  }
  const scope = scopeSchema.parse({ chatId: parsed['--chat'], characterId: parsed['--character'],
    ...(parsed['--max-jobs'] !== undefined ? { maxJobs: Number(parsed['--max-jobs']) } : {}) });
  if (parsed.apply) reviewSchema.parse(parsed['--expected-review']);
  else if (parsed['--expected-review'] !== undefined) throw new Error('MEMORY_BACKFILL_ARGUMENTS_INVALID');
  if (!process.env.DATABASE_URL) throw new Error('MEMORY_BACKFILL_DATABASE_REQUIRED');
  const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  try {
    console.info(JSON.stringify(parsed.apply ? await backfillStoryMemoryHistory(client, scope, parsed['--expected-review'])
      : await inspectStoryMemoryHistory(client, scope)));
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof z.ZodError ? 'MEMORY_BACKFILL_ARGUMENTS_INVALID'
      : error instanceof Error && /^MEMORY_BACKFILL_[A-Z_]+$/.test(error.message) ? error.message : 'MEMORY_BACKFILL_OPERATION_FAILED');
    process.exitCode = 1;
  });
}
