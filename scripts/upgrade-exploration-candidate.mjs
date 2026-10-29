import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile, rm } from 'node:fs/promises';
import { parse } from 'dotenv';

const image = process.argv[2];
assert.match(image ?? '', /^small-squaretable:exploration-[a-zA-Z0-9._-]+$/);
const apply = process.argv.includes('--apply');
const identifier = randomUUID();
const directory = `backups/exploration/upgrade-${identifier}`;
const target = `squaretable-upgrade-${identifier}`;
const network = `${target}-network`;
const source = 'squaretable-exploration-postgres-1';
const app = 'squaretable-exploration-app-1';
const configurationPath = '.env.exploration';
const originalConfiguration = await readFile(configurationPath, 'utf8');
const configuration = parse(originalConfiguration);
assert.equal(configuration.BETA_PORT, '3081');
const compose = ['compose', '--env-file', configurationPath, '-f', 'compose.beta.yml', '-p', 'squaretable-exploration'];
await mkdir(directory, { recursive: true, mode: 0o700 });
const log = await open(`${directory}/operations.log`, 'wx', 0o600);
let stopped = false;
let changedConfiguration = false;
let completed = false;
let previousImage;

async function docker(args, options = {}) {
  const input = options.input ? await open(options.input, 'r') : null;
  const output = options.output ? await open(options.output, 'wx', 0o600) : null;
  try {
    const child = spawn('docker', args, { stdio: [input?.fd ?? 'ignore', output?.fd ?? 'pipe', log.fd], env: { ...process.env, BETA_IMAGE: options.image ?? image } });
    const chunks = [];
    child.stdout?.on('data', chunk => chunks.push(chunk));
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, `Docker ${args[0]} failed; see private operations.log`);
    return Buffer.concat(chunks).toString().trim();
  } finally { await input?.close(); await output?.close(); }
}
const query = (container, sql) => docker(['exec', container, 'psql', '-U', 'squaretable', '-d', 'squaretable_beta', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
const dump = path => docker(['exec', source, 'pg_dump', '-U', 'squaretable', '-d', 'squaretable_beta', '-Fc'], { output: path });

function fingerprintSql(tables) {
  for (const table of tables) assert.match(table, /^[a-z_][a-z0-9_]*$/);
  return `SELECT jsonb_object_agg(name, summary) FROM (${tables.map(table =>
    `SELECT '${table}' AS name, jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(item)::text),'' ORDER BY md5(to_jsonb(item)::text)),''))) AS summary FROM public."${table}" item`).join(' UNION ALL ')}) fingerprints`;
}

try {
  previousImage = await docker(['inspect', '--format', '{{.Image}}', app]);
  const imageId = await docker(['image', 'inspect', '--format', '{{.Id}}', image]);
  const historicalImage = await docker(['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1']);
  await writeFile(`${directory}/previous.env`, originalConfiguration, { mode: 0o600, flag: 'wx' });
  console.info('Backing up the candidate and restoring into an isolated migration rehearsal');
  await dump(`${directory}/rehearsal.dump`);
  const password = randomBytes(32).toString('hex');
  await writeFile(`${directory}/postgres.env`, `POSTGRES_USER=squaretable\nPOSTGRES_DB=squaretable_beta\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
  await writeFile(`${directory}/migration.env`, `DATABASE_URL=postgresql://squaretable:${password}@postgres:5432/squaretable_beta\n`, { mode: 0o600 });
  await docker(['network', 'create', '--internal', network]);
  await docker(['run', '--rm', '-d', '--name', target, '--network', network, '--network-alias', 'postgres', '--env-file', `${directory}/postgres.env`, 'pgvector/pgvector:pg15']);
  const deadline = Date.now() + 30000;
  while (true) {
    try { await query(target, 'SELECT 1'); break; }
    catch { assert.ok(Date.now() < deadline, 'Rehearsal database did not become ready'); await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  await docker(['exec', '-i', target, 'pg_restore', '-U', 'squaretable', '-d', 'squaretable_beta', '--no-owner', '--no-privileges', '--exit-on-error'], { input: `${directory}/rehearsal.dump` });
  const tables = (await query(target, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).split('\n').filter(Boolean);
  const before = JSON.parse(await query(target, fingerprintSql(tables)));
  await docker(['run', '--rm', '--network', network, '--env-file', `${directory}/migration.env`, image, 'node', 'dist/server/migrate.js', '--beta']);
  const after = JSON.parse(await query(target, fingerprintSql(tables)));
  assert.deepEqual(after, before, 'Migration changed existing data in the isolated rehearsal');
  const migrationCount = Number(await query(target, 'SELECT count(*) FROM beta_release.__drizzle_migrations'));
  const report = { date: new Date().toISOString(), image, imageId, previousImage, historicalImage, port: 3081,
    rehearsal: { passed: true, comparedTables: tables.length, existingRowsPreserved: true, migrationCount },
    deployed: false, paidProviderTokens: 0,
    limits: ['Migration rehearsal preserves existing rows; it is not complete semantic restore/continuation acceptance', 'No third-party scripts or paid model probes', 'User visual and real-device acceptance remain open'] };
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  if (apply) {
    console.info('Rehearsal passed; briefly stopping only 3081 for final backup and upgrade');
    await docker([...compose, 'stop', 'app']);
    stopped = true;
    await dump(`${directory}/before-upgrade.dump`);
    await docker(['run', '--rm', '--volumes-from', app, '--entrypoint', 'tar', previousImage, '-C', '/app/uploads', '-cf', '-', '.'], { output: `${directory}/uploads.tar` });
    const beta = parse(await readFile('.env.beta', 'utf8'));
    const next = { ...configuration, BETA_IMAGE: image };
    const providerKeys = ['CUSTOM_LLM_API_FORMAT', 'CUSTOM_LLM_BASE_URL', 'CUSTOM_LLM_API_KEY', 'CUSTOM_LLM_MODELS', 'CUSTOM_LLM_DEFAULT_MODEL', 'CUSTOM_LLM_MODEL_LIMITS'];
    for (const key of providerKeys) if (beta[key] !== undefined) next[key] = beta[key];
    for (const value of Object.values(next)) assert.ok(!/[\r\n']/.test(value), 'Unsupported configuration quoting');
    await writeFile(configurationPath, Object.entries(next).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n', { mode: 0o600 });
    changedConfiguration = true;
    await docker([...compose, 'up', '-d', '--wait', '--wait-timeout', '120', 'app']);
    assert.equal(await docker(['inspect', '--format', '{{.Image}}', app]), imageId);
    assert.equal(await docker(['inspect', '--format', '{{.Image}}', 'squaretable-beta-app-1']), historicalImage);
    const deployedMigrationCount = Number(await query(source, 'SELECT count(*) FROM beta_release.__drizzle_migrations'));
    assert.equal(deployedMigrationCount, migrationCount);
    const deployedEnvironment = new Map(JSON.parse(await docker(['inspect', '--format', '{{json .Config.Env}}', app]))
      .map(value => { const separator = value.indexOf('='); return [value.slice(0, separator), value.slice(separator + 1)]; }));
    for (const key of providerKeys) assert.ok(deployedEnvironment.get(key) === next[key], `Candidate provider setting ${key} was not applied`);
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) assert.ok(deployedEnvironment.get(key) === configuration[key], 'Existing login configuration changed');
    const html = await (await fetch('http://127.0.0.1:3081/')).text();
    const expectedHtml = await docker(['exec', app, 'cat', '/app/dist/client/index.html']);
    assert.equal(html.trim(), expectedHtml.trim());
    report.deployed = true;
    report.providerConfigurationSynced = true;
    report.htmlSha256 = createHash('sha256').update(expectedHtml).digest('hex');
    report.migrationCount = deployedMigrationCount;
    report.previousConfiguration = `${directory}/previous.env`;
    report.databaseBackup = `${directory}/before-upgrade.dump`;
    report.uploadBackup = `${directory}/uploads.tar`;
    await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    completed = true;
    console.info(`3081 upgraded with rollback files in ${directory}; 3080 unchanged; no model calls`);
  } else console.info(`Rehearsal passed; no candidate changes; ${directory}/report.json`);
} finally {
  try {
    if (stopped && !completed) {
      if (changedConfiguration) await writeFile(configurationPath, originalConfiguration, { mode: 0o600 });
      await docker([...compose, 'up', '-d', '--no-deps', '--wait', 'app'], { image: previousImage });
      console.info('Previous application/configuration restored; additive migrations are retained. Inspect private operations.log.');
    }
  } finally {
    await docker(['rm', '-f', '-v', target]).catch(() => {});
    await docker(['network', 'rm', network]).catch(() => {});
    await rm(`${directory}/postgres.env`, { force: true });
    await rm(`${directory}/migration.env`, { force: true });
    await log.close();
  }
}
