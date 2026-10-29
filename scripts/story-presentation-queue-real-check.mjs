import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, open, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'dotenv';
import { requireEngineeringGateway } from './lib/engineering-model-client.mjs';

export async function checkRealPresentationQueue({ loader, sql, owner, create, api }) {
  const configPath = process.env.PRESENTATION_REAL_GATEWAY_CONFIG;
  if (!configPath) return null;
  assert.equal((await sql`SELECT current_database() AS name`)[0].name, 'squaretable_beta_test');
  const directory = 'backups/exploration/presentation-queue-real-20261027';
  assert.equal((await stat(directory)).mode & 0o077, 0);
  const output = await open(`${directory}/report.json`, 'wx', 0o600);
  const report = { result: 'started', supplierCalls: null, scope: 'one original t1 card in disposable database, not user save or human gameplay acceptance' };
  async function persist() { await output.truncate(0); await output.write(`${JSON.stringify(report, null, 2)}\n`, 0, 'utf8'); await output.sync(); }
  try {
    await persist();
    const settings = parse(await readFile(configPath));
    const before = await requireEngineeringGateway(settings);
    assert.equal(before.batch.maxRequests, 1);
    assert.equal(before.batch.requests, 0);
    assert.ok(before.batch.maxTokens <= 30000);
    const cardPath = '/mnt/c/Users/19158/Desktop/t1.png';
    const bytes = await readFile(cardPath);
    const sha256 = value => createHash('sha256').update(value).digest('hex');
    report.originalFileSha256 = sha256(bytes);
    const { parseCharacterFile } = await loader.import('../src/types/character-card-import.ts', import.meta.url);
    const imported = (await parseCharacterFile(bytes)).character;
    const card = await create(imported);
    const workerConfig = `${directory}/worker.env`;
    await writeFile(workerConfig, Object.entries({ ...settings, PRESENTATION_WORKER_DATABASE_URL: process.env.DATABASE_URL,
      PRESENTATION_WORKER_USER_ID: owner.userId, PRESENTATION_WORKER_TENANT_ID: owner.tenantId,
    }).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600, flag: 'wx' });
    await promisify(execFile)(process.execPath, ['scripts/story-presentation-worker.mjs', '--config', workerConfig, '--max-jobs', '1'], { timeout: 120000 });
    const [job] = await sql`SELECT * FROM presentation_jobs WHERE character_id=${card.id}`;
    report.status = job.status;
    report.dispatchId = job.dispatch_id;
    report.usage = job.usage;
    const after = await requireEngineeringGateway(settings);
    report.supplierCalls = after.batch.requests - before.batch.requests;
    report.originalFileUnchanged = report.originalFileSha256 === sha256(await readFile(cardPath));
    assert.equal(report.supplierCalls, 1);
    assert.equal(job.status, 'complete');
    const detail = await api(`/characters/${card.id}`);
    assert.equal(detail.presentation.draft.text, job.draft.text);
    assert.equal(detail.description, card.description);
    report.derivedChars = job.draft.text.length;
    report.displayMatchesAdoptedVersion = true;
    report.result = 'passed';
    return report;
  } catch (error) {
    report.result = 'failed';
    report.error = 'Inspect private shared ledger and queue before any retry; report is intentionally non-overwritable';
    throw error;
  } finally { await persist(); await output.close(); }
}
