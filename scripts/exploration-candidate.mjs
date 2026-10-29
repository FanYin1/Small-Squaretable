import { readFile, writeFile, mkdir, open, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parse } from 'dotenv';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';
import { storyExamples } from '../src/types/story-examples.ts';

const command = process.argv[2];
const configuration = '.env.exploration';
const backup = 'backups/exploration';
const compose = ['compose', '--env-file', configuration, '-f', 'compose.beta.yml', '-p', 'squaretable-exploration'];
async function run(args, options = {}) {
  const child = spawn('docker', args, { stdio: ['pipe', options.output ?? 'inherit', 'inherit'] });
  child.stdin.end(options.input);
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Docker command failed (${args[0]})`);
}
if (command === 'prepare') {
  const original = parse(await readFile('.env.beta'));
  const values = { ...original, BETA_PORT: '3081', APP_URL: 'http://localhost:3081', BETA_IMAGE: 'small-squaretable:exploration-20261024', EXPLORATION_CANDIDATE: '1',
    BETA_DB_PASSWORD: randomBytes(32).toString('hex'), JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex') };
  for (const value of Object.values(values)) if (/[\r\n']/.test(value)) throw new Error('Unsupported configuration quoting');
  await writeFile(configuration, Object.entries(values).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  await mkdir(backup, { recursive: true, mode: 0o700 });
  const dump = await open(`${backup}/source-beta.dump`, 'wx', 0o600);
  try { await run(['exec', 'squaretable-beta-postgres-1', 'pg_dump', '-U', 'squaretable', '-d', 'squaretable_beta', '-Fc'], { output: dump.fd }); }
  finally { await dump.close(); }
  await run([...compose, 'up', '-d', '--wait', 'postgres', 'redis']);
  await run([...compose, 'exec', '-T', 'postgres', 'pg_restore', '-U', 'squaretable', '-d', 'squaretable_beta', '--no-owner', '--no-privileges', '--exit-on-error'], { input: await readFile(`${backup}/source-beta.dump`) });
  await writeFile(`${backup}/restored.json`, JSON.stringify({ date: new Date().toISOString(), source: 'squaretable-beta-postgres-1', target: 'squaretable-exploration-postgres-1', sourcePort: 3080, candidatePort: 3081 }), { flag: 'wx', mode: 0o600 });
  console.info('Historical beta database backed up and restored into a separate candidate. Original services are unchanged.');
} else if (command === 'build') {
  await access(`${backup}/restored.json`);
  await run([...compose, 'build', 'app']);
} else if (command === 'start') {
  await access(`${backup}/restored.json`);
  await run([...compose, 'up', '-d', '--wait', 'app']);
} else if (command === 'seed') {
  const source = await readFile('docs/design/exploration-demo/app.js', 'utf8');
  const boundary = source.indexOf('const escapeText');
  const { artworks } = runInNewContext(`${source.slice(0, boundary)}; ({ artworks })`, {}, { timeout: 1000 });
  const examples = await Promise.all(storyExamples.map(async (example, index) => ({ ...example,
    avatarUrl: `data:image/png;base64,${(await sharp(Buffer.from(artworks[index === 0 ? 'orbit' : 'book'].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))).resize({ width: 1200 }).png().toBuffer()).toString('base64')}`,
  })));
  await run([...compose, 'exec', '-T', 'app', 'node', 'scripts/seed-exploration.mjs'], { input: JSON.stringify(examples) });
} else throw new Error('Usage: node scripts/exploration-candidate.mjs prepare|build|start|seed');
