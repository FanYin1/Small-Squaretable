import { dirname, join, resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { tsImport } from 'tsx/esm/api';
import { createPresentationQueueProvider } from './lib/presentation-queue-provider.mjs';
import { readPresentationWorkerConfig } from './lib/presentation-worker-config.mjs';
import { prepareReceiptDirectory, verifyReceiptDirectory } from './lib/presentation-receipts.mjs';

async function main() {
  const options = {};
  const argumentsList = process.argv.slice(2);
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    if (!['--config', '--max-jobs', '--watch-seconds'].includes(key) || options[key] || !argumentsList[index + 1]) throw new Error('PRESENTATION_WORKER_ARGUMENTS');
    options[key] = argumentsList[index + 1];
  }
  const maxJobs = Number(options['--max-jobs']);
  const watchSeconds = Number(options['--watch-seconds'] ?? 0);
  if (!options['--config'] || !Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 20
    || !Number.isInteger(watchSeconds) || watchSeconds < 0 || watchSeconds > 3600) throw new Error('PRESENTATION_WORKER_ARGUMENTS');
  const path = resolve(options['--config']);
  const settings = await readPresentationWorkerConfig(path);
  const target = new URL(settings.PRESENTATION_WORKER_DATABASE_URL);
  settings.PRESENTATION_WORKER_RECEIPTS_DIR = settings.PRESENTATION_WORKER_RECEIPTS_DIR || join(dirname(path), 'presentation-receipts');
  try { await prepareReceiptDirectory(settings.PRESENTATION_WORKER_RECEIPTS_DIR); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await verifyReceiptDirectory(settings.PRESENTATION_WORKER_RECEIPTS_DIR);
  process.env.DATABASE_URL = target.href;
  const adapter = settings.CUSTOM_LLM_API_FORMAT === 'gemini' ? await tsImport('../src/server/services/gemini-adapter.ts', import.meta.url) : null;
  const provider = createPresentationQueueProvider(settings, adapter);
  const { runNextPresentationJob } = await tsImport('../src/server/services/presentation-jobs.service.ts', import.meta.url);
  const sql = postgres(target.href, { max: 3, idle_timeout: 5, connect_timeout: 5 });
  const database = drizzle(sql);
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const until = Date.now() + watchSeconds * 1000;
  let processed = 0;
  try {
    while (!stopped && processed < maxJobs) {
      if (await runNextPresentationJob(provider, database)) processed++;
      else if (Date.now() >= until) break;
      else await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.info(JSON.stringify({ result: 'stopped', processed, maxJobs, scope: 'bounded-owner-engineering-worker' }));
  } finally {
    process.off('SIGTERM', stop); process.off('SIGINT', stop);
    await sql.end({ timeout: 5 });
  }
}

main().catch(() => { console.error('PRESENTATION_WORKER_STOPPED: inspect private queue and shared budget before resuming'); process.exitCode = 1; });
