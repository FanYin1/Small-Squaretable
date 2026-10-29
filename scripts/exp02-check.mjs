import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { checkExplorationEntry } from './exploration-entry-browser-check.mjs';
import { checkCreatorAccount } from './creator-account-check.mjs';
import { checkAccountActivity } from './account-activity-check.mjs';
import { checkStoryOpeningPreparation } from './story-opening-browser-check.mjs';
import { checkStoryOverview } from './story-overview-check.mjs';
import { checkExp02Surfaces } from './exp02-surface-check.mjs';

export async function checkExp02(options) {
  assert.equal(options.base, 'http://127.0.0.1:55441');
  const directory = `/tmp/squaretable-exp02-evidence/${randomUUID()}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const artifacts = await Promise.all(['dist/client/index.html', 'dist/server/index.js'].map(async path => ({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
  const stages = [
    ['entry', checkExplorationEntry, '/tmp/squaretable-entry-integration-evidence'],
    ['creator', checkCreatorAccount, '/tmp/squaretable-creator-account-evidence'],
    ['account', checkAccountActivity, '/tmp/squaretable-account-evidence'],
    ['opening', checkStoryOpeningPreparation, '/tmp/squaretable-opening-evidence'],
    ['overview', checkStoryOverview, '/tmp/squaretable-overview-evidence'],
    ['surfaces', checkExp02Surfaces, '/tmp/squaretable-exp02-surfaces'],
  ];
  const results = [];
  const selection = process.env.EXP02_STAGES?.split(',');
  if (selection) assert.ok(selection.length > 0 && selection.every(name => stages.some(stage => stage[0] === name)), 'Unknown EXP-02 check selection');
  for (const [name, check, root] of stages) {
    if (selection && !selection.includes(name)) continue;
    const previous = new Set(await readdir(root).catch(() => []));
    const result = { name, startedAt: new Date().toISOString(), status: 'running', evidence: [] };
    console.info(`EXP-02: checking ${name}`);
    try {
      let stageOptions = options;
      if (['opening', 'overview', 'surfaces'].includes(name)) {
        const invitation = `EXP02-${randomUUID()}`.toUpperCase();
        await options.sql`INSERT INTO invite_codes(code,max_uses) VALUES (${invitation},1)`;
        const registration = await fetch(`${options.base}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: randomBytes(24).toString('hex'), ageConfirmed: true, inviteCode: invitation }), signal: AbortSignal.timeout(15000) });
        assert.equal(registration.status, 201);
        const auth = (await registration.json()).data;
        const csrfResponse = await fetch(`${options.base}/api/v1/csrf-token`, { headers: { Authorization: `Bearer ${auth.tokens.accessToken}`, 'X-Tenant-ID': auth.user.tenantId }, signal: AbortSignal.timeout(15000) });
        assert.equal(csrfResponse.status, 200);
        const csrf = (await csrfResponse.json()).csrfToken;
        assert.ok(typeof csrf === 'string' && csrf.length > 0);
        await options.sql`INSERT INTO credit_ledger(tenant_id,kind,amount) VALUES (${auth.user.tenantId},'topup',100000)`;
        stageOptions = { ...options, auth, csrf };
      }
      await check(stageOptions); result.status = 'passed';
    }
    catch (error) { result.status = 'failed'; result.message = error.message; result.cause = error.cause?.message; console.error(`EXP-02 ${name}: ${error.stack}`, error.cause ?? ''); }
    result.finishedAt = new Date().toISOString();
    result.evidence = (await readdir(root).catch(() => [])).filter(item => !previous.has(item) && item !== 'latest.json').map(item => `${root}/${item}`);
    results.push(result);
    await writeFile(`${directory}/report.json`, JSON.stringify({ scope: 'EXP-02 consolidated isolated engineering checks; not real-provider or user/device acceptance', partial: Boolean(selection), artifacts, results, paidProviderCalls: 0 }, null, 2), { mode: 0o600 });
  }
  assert.ok(results.every(result => result.status === 'passed'), `EXP-02 failed; retain evidence at ${directory}/report.json`);
  console.info(`PASS: EXP-02 ${selection ? 'targeted checks only' : 'complete engineering suite'}, ${results.length} stages; ${directory}/report.json`);
}
