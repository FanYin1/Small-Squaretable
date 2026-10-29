import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/generation_request_test') {
  console.error('Refusing to run: DATABASE_URL must point at the disposable database generation_request_test');
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
  await firstConnection`CREATE TABLE chats (id uuid PRIMARY KEY)`;
  await firstConnection`CREATE TABLE messages (id bigserial PRIMARY KEY)`;
  const migration = await readFile(new URL('../src/db/migrations/0040_generation_requests.sql', import.meta.url), 'utf8');
  await firstConnection.begin(async (transaction) => {
    for (const statement of migration.split('--> statement-breakpoint')) {
      await transaction.unsafe(statement);
    }
  });

  const { GenerationRequestRepository } = await import('../src/db/repositories/generation-request.repository');
  const schema = await import('../src/db/schema');
  const firstRepository = new GenerationRequestRepository(drizzle(firstConnection, { schema }));
  const secondRepository = new GenerationRequestRepository(drizzle(secondConnection, { schema }));
  const chatId = randomUUID();
  const otherChatId = randomUUID();
  const payloadHash = 'a'.repeat(64);
  await firstConnection`INSERT INTO chats (id) VALUES (${chatId}), (${otherChatId})`;

  const results = await Promise.all(Array.from({ length: 40 }, (_, index) =>
    (index % 2 === 0 ? firstRepository : secondRepository).claim(chatId, 'same-request', payloadHash)
  ));
  const winner = results.find((result) => result.claimed)!;
  check('40 competing claims across two pools have exactly one winner', results.filter((result) => result.claimed).length === 1);
  check('all claimants see the same durable request', results.every((result) => result.request.id === winner.request.id));
  check('initial status is accepted', winner.request.status === 'accepted');
  check('the same request key in another chat is independent', (await secondRepository.claim(otherChatId, 'same-request', payloadHash)).claimed);

  const conflicting = await secondRepository.claim(chatId, 'same-request', 'b'.repeat(64));
  check('a conflicting payload cannot overwrite the original hash', !conflicting.claimed && conflicting.request.payloadHash === payloadHash);

  const [message] = await firstConnection`INSERT INTO messages DEFAULT VALUES RETURNING id`;
  await firstRepository.markRunning(winner.request.id, Number(message.id));
  const running = await secondRepository.findByRequest(chatId, 'same-request');
  check('running state and message association are durable', running?.status === 'running' && running.userMessageId === Number(message.id));

  await secondRepository.finish(winner.request.id, 'failed', 'MESSAGE_ERROR');
  const failed = await firstRepository.findByRequest(chatId, 'same-request');
  check('failure outcome is durable', failed?.status === 'failed' && failed.errorCode === 'MESSAGE_ERROR' && failed.finishedAt instanceof Date);
  await firstRepository.finish(winner.request.id, 'completed');
  check('a terminal outcome cannot be overwritten', (await secondRepository.findByRequest(chatId, 'same-request'))?.status === 'failed');
  await assert.rejects(() => firstRepository.markRunning(winner.request.id, Number(message.id)), /no longer accepted/);
  check('a terminal request cannot return to running', true);

  await firstConnection`DELETE FROM messages WHERE id = ${message.id}`;
  const afterDeletion = await secondRepository.claim(chatId, 'same-request', payloadHash);
  check('deleting a message does not remove the deduplication record', !afterDeletion.claimed && afterDeletion.request.userMessageId === null);

  const stranded = await firstRepository.claim(chatId, 'stranded-request', payloadHash);
  check('another instance cannot reclaim an unfinished request', !(await secondRepository.claim(chatId, 'stranded-request', payloadHash)).claimed);
  await secondRepository.finish(stranded.request.id, 'stopped');
  check('cancellation before saving a message is durable', (await firstRepository.findByRequest(chatId, 'stranded-request'))?.status === 'stopped');

  const completed = await firstRepository.claim(chatId, 'completed-request', payloadHash);
  await firstRepository.finish(completed.request.id, 'completed');
  check('completed requests also remain non-replayable', !(await secondRepository.claim(chatId, 'completed-request', payloadHash)).claimed);

  await assert.rejects(
    () => firstConnection`UPDATE generation_requests SET status = 'invalid' WHERE id = ${completed.request.id}`,
    (error: unknown) => error instanceof postgres.PostgresError && error.code === '23514'
  );
  check('the database rejects invalid statuses', true);
  await assert.rejects(
    () => firstRepository.claim(randomUUID(), 'missing-chat', payloadHash),
    (error: unknown) => error instanceof Error && error.cause instanceof postgres.PostgresError && error.cause.code === '23503'
  );
  check('the database rejects records for missing chats', true);

  await firstConnection`DELETE FROM chats WHERE id = ${chatId}`;
  check('deleting a chat cascades its generation records', await secondRepository.findByRequest(chatId, 'same-request') === null);
  check('deleting one chat does not affect another', await firstRepository.findByRequest(otherChatId, 'same-request') !== null);
  console.log(`${passed} checks passed`);
} finally {
  await Promise.all([firstConnection.end(), secondConnection.end()]);
}
