import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

const command = process.argv[2];
if (!['invite', 'first-admin'].includes(command)) throw new Error('Usage: node scripts/beta-admin.mjs invite|first-admin');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  const [state] = await sql`SELECT to_regclass('beta_release.__drizzle_migrations') IS NOT NULL AS initialized`;
  if (!state.initialized) throw new Error('This command requires an installed beta database');
  if (command === 'invite') {
    const code = `BETA-${randomBytes(16).toString('hex').toUpperCase()}`;
    await sql`INSERT INTO invite_codes (code, max_uses, expires_at, note)
      VALUES (${code}, 1, now() + interval '24 hours', 'Initial beta operator signup')`;
    console.info(`One-use invite (expires in 24 hours): ${code}`);
  } else {
    const email = process.env.BETA_ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) throw new Error('Set BETA_ADMIN_EMAIL to the account registered through the normal signup page');
    await sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(73429002)`;
      const admins = await transaction`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
      if (admins.length) throw new Error('An administrator already exists; use the authenticated admin UI for further role changes');
      const [user] = await transaction`UPDATE users SET role = 'admin', updated_at = now()
        WHERE email = ${email} AND is_active AND age_confirmed_at IS NOT NULL RETURNING id, tenant_id`;
      if (!user) throw new Error('No active, age-confirmed registered account matches BETA_ADMIN_EMAIL');
      await transaction`INSERT INTO audit_logs (tenant_id, actor_id, action, target_type, target_id, metadata)
        VALUES (${user.tenant_id}, 'system', 'beta_first_admin', 'user', ${user.id}, ${sql.json({ source: 'beta-admin-cli' })})`;
    });
    console.info('First administrator initialized. Sign out and sign in again to use the admin UI.');
  }
} catch (error) {
  console.error(error.code ? `Beta administration failed (${error.code})` : error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
