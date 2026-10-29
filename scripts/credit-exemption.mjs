import assert from 'node:assert/strict';
import postgres from 'postgres';

const [operation, userId] = process.argv.slice(2);
assert.ok(['grant', 'revoke'].includes(operation), 'Usage: node scripts/credit-exemption.mjs grant|revoke <user-id>');
assert.match(userId ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  const result = await sql.begin(async transaction => {
    const [user] = await transaction`SELECT id, tenant_id FROM users WHERE id = ${userId} AND is_active`;
    assert.ok(user, 'No active account matches this ID');
    await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${`credit:${user.tenant_id}`}, 0))`;
    const [tenant] = await transaction`SELECT settings FROM tenants WHERE id = ${user.tenant_id} FOR UPDATE`;
    assert.ok(tenant, 'Tenant not found');
    if (operation === 'grant') {
      const [{ count }] = await transaction`SELECT count(*)::int AS count FROM users WHERE tenant_id = ${user.tenant_id}`;
      assert.equal(count, 1, 'Shared tenants cannot receive an account exemption');
    }
    const previous = tenant.settings.creditUnlimitedUserId ?? null;
    if (operation === 'revoke') assert.ok(previous === null || previous === userId, 'Exemption belongs to another account');
    const next = operation === 'grant' ? userId : null;
    if (previous === next) return { changed: false, unlimited: next !== null };
    if (next) {
      await transaction`UPDATE tenants SET settings = settings || ${sql.json({ creditUnlimitedUserId: next })}, updated_at = now() WHERE id = ${user.tenant_id}`;
    } else {
      await transaction`UPDATE tenants SET settings = settings - 'creditUnlimitedUserId', updated_at = now() WHERE id = ${user.tenant_id}`;
    }
    await transaction`INSERT INTO audit_logs (tenant_id, actor_id, action, target_type, target_id, metadata)
      VALUES (${user.tenant_id}, 'system', 'credit_exemption', 'user', ${userId}, ${sql.json({ operation, previous, source: 'credit-exemption-cli', authorization: 'explicit-user-request' })})`;
    return { changed: true, unlimited: next !== null };
  });
  console.info(JSON.stringify(result));
} finally {
  await sql.end();
}
