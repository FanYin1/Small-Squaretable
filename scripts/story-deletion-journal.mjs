import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open, constants } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import postgres from 'postgres';
import { z } from 'zod';
import { withStoryDeletionSnapshot, applyStoryDeletions, parseStoryDeletionSnapshot } from './story-deletion-replay.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function writePrivateJson(path, value) {
  return writePrivateBytes(path, Buffer.from(`${JSON.stringify(value)}\n`));
}
export async function syncDirectory(path) {
  const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await directory.sync(); } finally { await directory.close(); }
}
export async function writePrivateBytes(path, bytes) {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(bytes); await file.sync(); }
  finally { await file.close(); }
  await syncDirectory(dirname(path));
}
export async function readPrivateJson(path, maxBytes = 100 * 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    assert.ok(stat.isFile() && stat.size <= maxBytes && (stat.mode & 0o077) === 0, 'Expected bounded private regular file (chmod 600)');
    return JSON.parse(await file.readFile('utf8'));
  } finally { await file.close(); }
}
export function validateDeletionJournal(input) {
  const parsed = z.object({ format: z.literal('small-squaretable.deletion-journal'), version: z.literal(1),
    capturedAt: z.string().datetime(), snapshot: z.unknown(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().parse(input);
  assert.equal(parsed.sha256, digest({ capturedAt: parsed.capturedAt, snapshot: parsed.snapshot }), 'Deletion journal digest mismatch');
  return { ...parsed, snapshot: parseStoryDeletionSnapshot(parsed.snapshot) };
}
export async function captureDeletionJournal(source) {
  return withStoryDeletionSnapshot(source, async snapshot => {
    const data = { capturedAt: new Date().toISOString(), snapshot };
    return { format: 'small-squaretable.deletion-journal', version: 1, ...data, sha256: digest(data) };
  });
}
export async function replayDeletionJournal(target, input, expectedDigest) {
  const journal = validateDeletionJournal(input);
  assert.equal(journal.sha256, expectedDigest, 'Explicit trusted deletion journal digest required');
  return applyStoryDeletions(target, journal.snapshot);
}
export async function preflightDeletionJournal(target, input, expectedDigest) {
  const journal = validateDeletionJournal(input);
  assert.equal(journal.sha256, expectedDigest, 'Explicit trusted deletion journal digest required');
  assert.ok(Date.parse(journal.capturedAt) <= Date.now() + 1000, 'Deletion journal is from the future');
  const [available] = await target`SELECT to_regclass('public.story_restore_lineage') AS lineage, to_regclass('public.story_deletions') AS deletions`;
  if (available.lineage) {
    const rows = await target`SELECT id FROM story_restore_lineage`;
    assert.equal(rows.length, 1, 'Missing target lineage');
    assert.equal(rows[0].id, journal.snapshot.lineageId, 'Refusing overwrite of unrelated target lineage');
  }
  if (available.deletions) {
    const receipts = await target`SELECT chat_id, user_id, tenant_id FROM story_deletions`;
    for (const receipt of receipts) {
      const recorded = journal.snapshot.deletions.find(item => item.chatId === receipt.chat_id);
      assert.ok(recorded && recorded.userId === receipt.user_id && recorded.tenantId === receipt.tenant_id, 'Journal is missing current target deletion evidence');
    }
  }
  return { status: 'preflight-passed', capturedAt: journal.capturedAt, sha256: journal.sha256 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [operation, path, expectedDigest] = process.argv.slice(2);
  if (['--preflight', '--offline-target'].includes(operation)) {
    assert.equal(path, '--target-postgres-env');
    assert.ok(process.env.STORY_DELETION_JOURNAL && process.env.STORY_DELETION_JOURNAL_SHA256, 'Trusted independent deletion journal required');
    const target = postgres({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE,
      username: process.env.PGUSER, password: process.env.PGPASSWORD, max: 1 });
    try {
      const journal = await readPrivateJson(process.env.STORY_DELETION_JOURNAL);
      const result = await (operation === '--preflight' ? preflightDeletionJournal : replayDeletionJournal)(target, journal, process.env.STORY_DELETION_JOURNAL_SHA256);
      console.info(JSON.stringify(result));
    } finally { await target.end(); }
  } else {
  assert.ok(['export', 'replay'].includes(operation) && path, 'Usage: story-deletion-journal.mjs export FILE | replay FILE TRUSTED_SHA256');
  const url = process.env[operation === 'export' ? 'STORY_DELETION_SOURCE_DATABASE_URL' : 'STORY_DELETION_TARGET_DATABASE_URL'];
  assert.ok(url, 'Explicit deletion source/target connection required');
  const client = postgres(url, { max: 1 });
  try {
    if (operation === 'export') {
      const journal = await captureDeletionJournal(client);
      await writePrivateJson(path, journal);
      console.info(JSON.stringify({ capturedAt: journal.capturedAt, sha256: journal.sha256, deletions: journal.snapshot.deletions.length }));
    } else console.info(JSON.stringify(await replayDeletionJournal(client, await readPrivateJson(path), expectedDigest)));
  } finally { await client.end(); }
  }
}
