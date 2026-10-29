import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import postgres from 'postgres';

assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, '/credit_test', 'Requires a disposable credit_test database');
const sql = postgres(process.env.DATABASE_URL!, { max: 5 });
const execute = promisify(execFile);

try {
  const { creditBilling, InsufficientCreditsError } = await import('../src/server/services/credit-billing.service');
  const { creditRepository } = await import('../src/db/repositories/credit.repository');
  const [tenant] = await sql`INSERT INTO tenants (name) VALUES ('Exemption test') RETURNING id`;
  const [account] = await sql`INSERT INTO users (tenant_id, email) VALUES (${tenant.id}, 'exempt@example.test') RETURNING id`;
  const [normal] = await sql`INSERT INTO tenants (name) VALUES ('Normal test') RETURNING id`;
  const [normalAccount] = await sql`INSERT INTO users (tenant_id, email) VALUES (${normal.id}, 'normal@example.test') RETURNING id`;
  const change = async (operation: string, userId = account.id) => JSON.parse((await execute(process.execPath, ['scripts/credit-exemption.mjs', operation, userId])).stdout);
  assert.deepEqual(await change('grant'), { changed: true, unlimited: true });
  assert.deepEqual(await change('grant'), { changed: false, unlimited: true });
  assert.equal((await sql`SELECT count(*)::int AS count FROM audit_logs WHERE action = 'credit_exemption'`)[0].count, 1);
  await creditBilling.assertHasCredits(tenant.id);
  await assert.rejects(creditBilling.assertHasCredits(normal.id), InsufficientCreditsError);
  const holds = await Promise.all(Array.from({ length: 20 }, () => creditBilling.reserve({ tenantId: tenant.id, estimatedInputTokens: 1000, maxOutputTokens: 2000 })));
  assert.deepEqual(await creditRepository.getAvailability(tenant.id), { balance: 0, held: 0, available: 0, unlimited: true });
  await sql`UPDATE credit_reservations SET status = 'expired' WHERE id = ${holds[0].id}`;
  assert.deepEqual(await change('revoke'), { changed: true, unlimited: false });
  const results = await Promise.all(Array.from({ length: 10 }, () => creditBilling.settle(holds[0].id, { inputTokens: 1234, outputTokens: 567, messageId: null })));
  assert.deepEqual(results.filter(Boolean), [{ chargedTokens: 0, clamped: false }]);
  const [settled] = await sql`SELECT status, charged_tokens, metadata FROM credit_reservations WHERE id = ${holds[0].id}`;
  assert.equal(settled.status, 'settled');
  assert.equal(settled.charged_tokens, 0);
  assert.equal(settled.metadata.inputTokens, 1234);
  assert.equal(settled.metadata.outputTokens, 567);
  assert.equal((await sql`SELECT count(*)::int AS count FROM credit_ledger WHERE tenant_id = ${tenant.id}`)[0].count, 0);
  await assert.rejects(creditBilling.reserve({ tenantId: tenant.id, estimatedInputTokens: 1, maxOutputTokens: 1 }), InsufficientCreditsError);
  assert.equal(await creditBilling.release(holds[1].id), true);
  assert.equal(await creditBilling.settle(holds[1].id, { inputTokens: 1, outputTokens: 1 }), null);
  await sql`INSERT INTO credit_ledger (tenant_id, kind, amount) VALUES (${normal.id}, 'topup', 10000)`;
  const normalHold = await creditBilling.reserve({ tenantId: normal.id, estimatedInputTokens: 1000, maxOutputTokens: 2000, metadata: { creditExempt: true } });
  assert.deepEqual(await creditBilling.settle(normalHold.id, { inputTokens: 1000, outputTokens: 1000 }), { chargedTokens: 2000, clamped: false });
  assert.equal((await creditRepository.getAvailability(normal.id)).balance, 8000);
  await change('grant');
  await sql`INSERT INTO users (tenant_id, email) VALUES (${tenant.id}, 'peer@example.test')`;
  assert.equal((await creditRepository.getAvailability(tenant.id)).unlimited, undefined);
  await assert.rejects(change('grant'));
  await sql`UPDATE tenants SET settings = ${sql.json({ creditUnlimitedUserId: account.id })} WHERE id = ${normal.id}`;
  assert.equal((await creditRepository.getAvailability(normal.id)).unlimited, undefined);
  await assert.rejects(change('revoke', normalAccount.id));
  console.info('PASS: zero balance; 20 concurrent holds; isolated scope; actual usage; repeated/expired settlement; revoke; release; metadata forgery; shared-tenant denial; audit idempotency. No model calls.');
  await sql.end();
  process.exit(0);
} catch (error) {
  console.error(error);
  await sql.end();
  process.exit(1);
}
