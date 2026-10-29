import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for migrations');

const client = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
try {
  await client`SELECT pg_advisory_lock(73429001)`;
  const beta = process.argv.includes('--beta');
  if (beta) {
    const [state] = await client`
      SELECT to_regclass('beta_release.__drizzle_migrations') IS NOT NULL AS initialized,
        EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            AND table_type = 'BASE TABLE') AS occupied
    `;
    if (!state.initialized && state.occupied) {
      throw Object.assign(new Error('Beta baseline requires an empty database'), { code: 'BETA_REQUIRES_EMPTY_DATABASE' });
    }
  }
  await migrate(drizzle(client), beta ? {
    migrationsFolder: './src/db/beta-migrations',
    migrationsSchema: 'beta_release',
  } : { migrationsFolder: './src/db/migrations' });
  console.info('Database migrations completed');
} catch (error) {
  const code = error instanceof Error && 'code' in error ? String(error.code) : 'MIGRATION_FAILED';
  console.error(`Database migration failed (${code}); inspect the database migration state before retrying`);
  process.exitCode = 1;
} finally {
  await client.end();
}
