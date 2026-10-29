import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { z } from 'zod';

const jobIdSchema = z.string().uuid();
const attemptsSchema = z.number().int().min(1).max(5);
const repairable = new Set(['ATTEMPTS_EXHAUSTED', 'EXTRACTION_FAILED', 'EXTRACTION_INVALID', 'CHECKPOINT_FAILED', 'EMBEDDING_FAILED', 'EMBEDDING_INVALID', 'COMMIT_FAILED', 'INPUT_BUDGET_EXCEEDED']);

export async function inspectStoryMemoryJob(client, jobId) {
  jobIdSchema.parse(jobId);
  const [job] = await client`SELECT id, status, attempts, error_code,
    extracted IS NOT NULL AS has_checkpoint, jsonb_array_length(replay_history) AS replays
    FROM story_memory_jobs WHERE id = ${jobId}`;
  if (!job) throw new Error('MEMORY_JOB_NOT_FOUND');
  return job;
}

export async function retryStoryMemoryJob(client, jobId, expectedAttempts) {
  jobIdSchema.parse(jobId);
  attemptsSchema.parse(expectedAttempts);
  return client.begin(async transaction => {
    const [job] = await transaction`SELECT status, attempts, error_code FROM story_memory_jobs WHERE id = ${jobId} FOR UPDATE`;
    if (!job) throw new Error('MEMORY_JOB_NOT_FOUND');
    if (job.status !== 'failed' || job.attempts !== expectedAttempts) throw new Error('MEMORY_JOB_REVIEW_STALE');
    if (!repairable.has(job.error_code)) throw new Error('MEMORY_JOB_SOURCE_REQUIRES_REVIEW');
    await transaction`UPDATE story_memory_jobs SET
      replay_history = replay_history || jsonb_build_array(jsonb_build_object('attempts', attempts, 'errorCode', error_code, 'replayedAt', now())),
      status = 'retry', attempts = 0, available_at = now(), lease_token = NULL, lease_until = NULL, error_code = NULL,
      completed_at = NULL WHERE id = ${jobId}`;
    return inspectStoryMemoryJob(transaction, jobId);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--apply' && !parsed.apply) parsed.apply = true;
    else if ((flag === '--job' || flag === '--expected-attempts') && parsed[flag] === undefined) parsed[flag] = args[++index];
    else throw new Error('MEMORY_JOB_ARGUMENTS_INVALID');
  }
  jobIdSchema.parse(parsed['--job']);
  if (parsed.apply) attemptsSchema.parse(Number(parsed['--expected-attempts']));
  if (!process.env.DATABASE_URL) throw new Error('MEMORY_JOB_DATABASE_REQUIRED');
  const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, connection: { statement_timeout: 10000 } });
  try {
    const result = parsed.apply
      ? await retryStoryMemoryJob(client, parsed['--job'], Number(parsed['--expected-attempts']))
      : await inspectStoryMemoryJob(client, parsed['--job']);
    console.info(JSON.stringify(result));
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error && /^MEMORY_JOB_[A-Z_]+$/.test(error.message) ? error.message : 'MEMORY_JOB_OPERATION_FAILED');
    process.exitCode = 1;
  });
}
