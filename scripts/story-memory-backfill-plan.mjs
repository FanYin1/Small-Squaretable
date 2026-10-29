import { createHash } from 'node:crypto';

export function planStoryMemoryBackfill({ chatId, characterId, version, sources, jobs, progress, maxJobs = 100 }) {
  if (sources.length > 100000 || jobs.length > 20000) throw new Error('MEMORY_BACKFILL_LIMIT_EXCEEDED');
  if (!Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > 100) throw new Error('MEMORY_BACKFILL_ARGUMENTS_INVALID');
  const ordered = [...sources].sort((left, right) => left.version - right.version);
  const available = new Set(ordered.map(source => source.eventId));
  if (available.size !== ordered.length || new Set(ordered.map(source => source.version)).size !== ordered.length ||
    ordered.some(source => !Number.isSafeInteger(source.version) || source.version < 1 || source.version > version)) {
    throw new Error('MEMORY_BACKFILL_SOURCE_INVALID');
  }
  const covered = new Set();
  for (const job of jobs) {
    if (job.sourceEventIds.length !== 5) throw new Error('MEMORY_BACKFILL_COVERAGE_INVALID');
    for (const eventId of job.sourceEventIds) {
      if (!available.has(eventId) || covered.has(eventId)) throw new Error('MEMORY_BACKFILL_COVERAGE_INVALID');
      covered.add(eventId);
    }
  }
  if (progress.length >= 5 || new Set(progress).size !== progress.length || progress.some(eventId => !available.has(eventId) || covered.has(eventId))) {
    throw new Error('MEMORY_BACKFILL_COVERAGE_INVALID');
  }
  const missing = ordered.filter(source => !covered.has(source.eventId) && !progress.includes(source.eventId));
  const pending = ordered.filter(source => !covered.has(source.eventId)).map(source => source.eventId);
  const batches = [];
  const completeBatches = Math.floor(pending.length / 5);
  for (let offset = 0; offset < Math.min(completeBatches, maxJobs) * 5; offset += 5) batches.push(pending.slice(offset, offset + 5));
  const remaining = pending.slice(completeBatches * 5);
  const reviewHash = createHash('sha256').update(JSON.stringify({ protocol: 2, chatId, characterId, version, maxJobs, sources: ordered,
    jobs: [...jobs].sort((left, right) => left.id.localeCompare(right.id)), progress })).digest('hex');
  return { batches, remaining, report: { chatId, characterId, storyVersion: version, confirmedReplies: sources.length,
    existingJobs: jobs.length, existingProgress: progress.length, missingReplies: missing.length,
    jobsToCreate: batches.length, deferredJobs: completeBatches - batches.length, maxJobs, remainingProgress: remaining.length,
    progressChanged: JSON.stringify(progress) !== JSON.stringify(remaining), reviewHash } };
}
