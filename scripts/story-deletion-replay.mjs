import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { z } from 'zod';

const snapshotSchema = z.object({
  protocol: z.literal(1), lineageId: z.string().uuid(),
  deletions: z.array(z.object({
    chatId: z.string().uuid(), tenantId: z.string().uuid(), userId: z.string().uuid(), deletedAt: z.string().datetime(),
    creationRequests: z.array(z.object({ id: z.string().uuid(), requestId: z.string().uuid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime({ offset: true }) }).strict()),
  }).strict()),
}).strict();

export function parseStoryDeletionSnapshot(input) {
  return snapshotSchema.parse(input);
}

export async function withStoryDeletionSnapshot(source, consume) {
  return source.begin(async transaction => {
    await transaction`SET LOCAL lock_timeout = '5s'`;
    await transaction`LOCK TABLE chats, chat_creation_requests, story_deletions, story_restore_lineage IN SHARE MODE NOWAIT`;
    const lineage = await transaction`SELECT id FROM story_restore_lineage`;
    assert.equal(lineage.length, 1, 'Missing source deletion lineage');
    const rows = await transaction`SELECT chat_id, tenant_id, user_id, deleted_at, creation_requests FROM story_deletions ORDER BY chat_id`;
    const snapshot = snapshotSchema.parse({ protocol: 1, lineageId: lineage[0].id, deletions: rows.map(row => ({
      chatId: row.chat_id, tenantId: row.tenant_id, userId: row.user_id, deletedAt: row.deleted_at.toISOString(), creationRequests: row.creation_requests,
    })) });
    return consume(snapshot);
  });
}

export async function applyStoryDeletions(target, input) {
  const snapshot = snapshotSchema.parse(input);
  assert.equal(new Set(snapshot.deletions.map(row => row.chatId)).size, snapshot.deletions.length, 'Duplicate deletion receipts');
  return target.begin(async transaction => {
    await transaction`SET LOCAL lock_timeout = '5s'`;
    await transaction`LOCK TABLE chats, chat_creation_requests, story_deletions, story_id_reservations, story_restore_lineage IN ACCESS EXCLUSIVE MODE NOWAIT`;
    const lineage = await transaction`SELECT id FROM story_restore_lineage`;
    assert.equal(lineage.length, 1, 'Missing target deletion lineage');
    assert.equal(lineage[0].id, snapshot.lineageId, 'Deletion source and restored target must share the same lineage');
    const known = new Map(snapshot.deletions.map(row => [row.chatId, row]));
    const existingReceipts = await transaction`SELECT * FROM story_deletions`;
    for (const existing of existingReceipts) {
      const receipt = known.get(existing.chat_id);
      assert.ok(receipt, 'Source is missing deletion evidence already present on target');
      assert.equal(existing.user_id, receipt.userId, 'Deletion receipt owner conflict');
      assert.equal(existing.tenant_id, receipt.tenantId, 'Deletion receipt tenant conflict');
      assert.equal(existing.deleted_at.toISOString(), receipt.deletedAt, 'Deletion receipt timestamp conflict');
      assert.deepEqual(existing.creation_requests, receipt.creationRequests, 'Deletion receipt request conflict');
    }
    let deletedStories = 0;
    let restoredRequests = 0;
    let requestsWithoutOwner = 0;
    for (const receipt of snapshot.deletions) {
      const [chat] = await transaction`SELECT user_id, tenant_id FROM chats WHERE id = ${receipt.chatId}`;
      if (chat) {
        assert.equal(chat.user_id, receipt.userId, 'Restored story owner conflict');
        assert.equal(chat.tenant_id, receipt.tenantId, 'Restored story tenant conflict');
      }
      await transaction`INSERT INTO story_deletions (chat_id, tenant_id, user_id, deleted_at, creation_requests)
        VALUES (${receipt.chatId}, ${receipt.tenantId}, ${receipt.userId}, ${receipt.deletedAt}, ${transaction.json(receipt.creationRequests)}) ON CONFLICT DO NOTHING`;
      await transaction`INSERT INTO story_id_reservations (chat_id) VALUES (${receipt.chatId}) ON CONFLICT DO NOTHING`;
      const removed = await transaction`DELETE FROM chats WHERE id = ${receipt.chatId} RETURNING id`;
      deletedStories += removed.length;
      const [owner] = await transaction`SELECT tenant_id FROM users WHERE id = ${receipt.userId}`;
      if (!owner) { requestsWithoutOwner += receipt.creationRequests.length; continue; }
      assert.equal(owner.tenant_id, receipt.tenantId, 'Restored account tenant conflict');
      for (const request of receipt.creationRequests) {
        const [existing] = await transaction`SELECT chat_id, payload_hash FROM chat_creation_requests
          WHERE tenant_id = ${receipt.tenantId} AND user_id = ${receipt.userId} AND request_id = ${request.requestId}`;
        if (existing) {
          assert.equal(existing.chat_id, null, 'Creation request points at another live story');
          assert.equal(existing.payload_hash, request.payloadHash, 'Creation request payload conflict');
        } else {
          await transaction`INSERT INTO chat_creation_requests (id, tenant_id, user_id, request_id, payload_hash, chat_id, created_at)
            VALUES (${request.id}, ${receipt.tenantId}, ${receipt.userId}, ${request.requestId}, ${request.payloadHash}, NULL, ${request.createdAt})`;
          restoredRequests++;
        }
      }
    }
    const [leftovers] = await transaction`SELECT count(*)::int AS count FROM chats JOIN story_deletions ON chats.id = story_deletions.chat_id`;
    assert.equal(leftovers.count, 0, 'Deleted stories remain in the restored target');
    return { protocol: 1, result: 'replayed', receipts: snapshot.deletions.length, deletedStories, restoredRequests, requestsWithoutOwner };
  });
}

export async function replayStoryDeletions(source, target) {
  assert.notEqual(source, target, 'Source and target must use separate connections to different databases');
  return withStoryDeletionSnapshot(source, snapshot => applyStoryDeletions(target, snapshot));
}

export async function preflightStoryDeletionRestore(source, targetMaintenance, targetDatabase) {
  const [origin] = await source`SELECT system_identifier::text AS cluster, current_database() AS database FROM pg_control_system()`;
  const [destination] = await targetMaintenance`SELECT system_identifier::text AS cluster FROM pg_control_system()`;
  assert.ok(origin.cluster !== destination.cluster || origin.database !== targetDatabase, 'Restore must not overwrite its authoritative deletion source');
  return withStoryDeletionSnapshot(source, () => ({ result: 'preflight-passed' }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let source;
  let target;
  try {
    const args = process.argv.slice(2);
    const preflight = args[0] === '--preflight';
    assert.ok(preflight || args[0] === '--offline-target', 'Choose preflight or offline replay');
    const postgresEnvironment = args[1] === '--target-postgres-env';
    assert.equal(args.length, postgresEnvironment ? 2 : 1, 'Unexpected replay arguments');
    const sourceUrl = process.env.STORY_DELETION_SOURCE_DATABASE_URL;
    const targetUrl = process.env.STORY_DELETION_TARGET_DATABASE_URL;
    assert.ok(sourceUrl, 'An authoritative deletion source is required');
    let targetConfiguration;
    if (postgresEnvironment) {
      assert.ok(process.env.PGHOST && process.env.PGPORT && process.env.PGDATABASE && process.env.PGUSER, 'Target PostgreSQL configuration is required');
      targetConfiguration = { host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, username: process.env.PGUSER, password: process.env.PGPASSWORD };
    } else {
      assert.ok(targetUrl, 'A target database URL is required');
      assert.notEqual(sourceUrl, targetUrl, 'Source and target must be different databases');
    }
    source = postgres(sourceUrl, { max: 1, connect_timeout: 10 });
    let targetDatabase;
    if (preflight) {
      if (targetConfiguration) {
        targetDatabase = targetConfiguration.database;
        targetConfiguration.database = 'postgres';
      } else {
        const maintenance = new URL(targetUrl);
        targetDatabase = decodeURIComponent(maintenance.pathname.slice(1));
        maintenance.pathname = '/postgres';
        targetConfiguration = maintenance.toString();
      }
    }
    target = postgres(targetConfiguration ?? targetUrl, { max: 1, connect_timeout: 10 });
    console.info(JSON.stringify(preflight ? await preflightStoryDeletionRestore(source, target, targetDatabase) : await replayStoryDeletions(source, target)));
  } catch {
    console.error('Deletion replay failed. Keep the target offline; verify source availability, lineage, migrations, ownership and exclusive access. No partial replay is committed.');
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([source?.end({ timeout: 1 }), target?.end({ timeout: 1 })]);
  }
}
