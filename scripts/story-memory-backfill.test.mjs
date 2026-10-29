import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planStoryMemoryBackfill } from './story-memory-backfill-plan.mjs';

const sources = Array.from({ length: 13 }, (_, index) => ({ eventId: `event-${index + 1}`, version: index + 1,
  inputMessageId: index * 2 + 1, messageId: index * 2 + 2, input: '合成输入', reply: '合成回应' }));
const base = { chatId: 'story', characterId: 'character', version: 13, sources, jobs: [], progress: [] };

test('plans chronological batches and preserves a partial tail without exposing story text', () => {
  const plan = planStoryMemoryBackfill({ ...base, sources: [...sources].reverse() });
  assert.deepEqual(plan.batches, [sources.slice(0, 5).map(source => source.eventId), sources.slice(5, 10).map(source => source.eventId)]);
  assert.deepEqual(plan.remaining, sources.slice(10).map(source => source.eventId));
  assert.equal(plan.report.missingReplies, 13);
  assert.ok(!JSON.stringify(plan.report).includes('合成'));
});

test('preserves existing batches and combines only unbatched progress with missing history', () => {
  const jobs = [{ id: 'job', sourceEventIds: sources.slice(5, 10).map(source => source.eventId) }];
  const progress = sources.slice(10).map(source => source.eventId);
  const plan = planStoryMemoryBackfill({ ...base, jobs, progress });
  assert.deepEqual(plan.batches, [sources.slice(0, 5).map(source => source.eventId)]);
  assert.deepEqual(plan.remaining, progress);
  assert.equal(plan.report.missingReplies, 5);
  assert.equal(plan.report.progressChanged, false);
});

test('complete coverage produces no changes and empty history stays empty', () => {
  const jobs = [0, 5].map(offset => ({ id: `job-${offset}`, sourceEventIds: sources.slice(offset, offset + 5).map(source => source.eventId) }));
  const plan = planStoryMemoryBackfill({ ...base, jobs, progress: sources.slice(10).map(source => source.eventId) });
  assert.equal(plan.report.jobsToCreate, 0); assert.equal(plan.report.missingReplies, 0); assert.equal(plan.report.progressChanged, false);
  assert.deepEqual(planStoryMemoryBackfill({ ...base, version: 0, sources: [] }).remaining, []);
});

test('review fingerprint changes on source edits, coverage edits, scope or new state version', () => {
  const original = planStoryMemoryBackfill(base).report.reviewHash;
  for (const changes of [{ version: 14 }, { chatId: 'other' }, { characterId: 'other' }, { progress: ['event-1'] },
    { sources: sources.map((source, index) => index ? source : { ...source, reply: '修订' }) }]) {
    assert.notEqual(planStoryMemoryBackfill({ ...base, ...changes }).report.reviewHash, original);
  }
});

test('rejects duplicate, missing, interrupted or overlapping tracked sources', () => {
  const valid = sources.slice(0, 5).map(source => source.eventId);
  for (const changes of [{ jobs: [{ id: 'short', sourceEventIds: valid.slice(1) }] },
    { jobs: [{ id: 'duplicate', sourceEventIds: Array(5).fill('event-1') }] },
    { jobs: [{ id: 'foreign', sourceEventIds: [...valid.slice(1), 'foreign-event'] }] },
    { jobs: [{ id: 'one', sourceEventIds: valid }, { id: 'two', sourceEventIds: valid }] },
    { jobs: [{ id: 'job', sourceEventIds: valid }], progress: ['event-1'] },
    { progress: ['event-1', 'event-1'] }, { progress: ['interrupted-event'] }]) {
    assert.throws(() => planStoryMemoryBackfill({ ...base, ...changes }), /COVERAGE_INVALID/);
  }
});

test('rejects invalid chronology and oversized unreviewable history', () => {
  for (const changes of [{ sources: [...sources, sources[0]] }, { version: 3 },
    { sources: sources.map((source, index) => index ? source : { ...source, version: 0 }) }]) {
    assert.throws(() => planStoryMemoryBackfill({ ...base, ...changes }), /SOURCE_INVALID/);
  }
  assert.throws(() => planStoryMemoryBackfill({ ...base, sources: Array(100001).fill(sources[0]) }), /LIMIT_EXCEEDED/);
});

test('bounded applications retain the true tail and leave unqueued full batches available for later review', () => {
  const first = planStoryMemoryBackfill({ ...base, maxJobs: 1 });
  assert.equal(first.report.jobsToCreate, 1); assert.equal(first.report.deferredJobs, 1);
  assert.deepEqual(first.remaining, sources.slice(10).map(source => source.eventId));
  const second = planStoryMemoryBackfill({ ...base, maxJobs: 1, jobs: [{ id: 'created', sourceEventIds: first.batches[0] }], progress: first.remaining });
  assert.equal(second.report.jobsToCreate, 1); assert.equal(second.report.deferredJobs, 0);
  assert.deepEqual(second.batches[0], sources.slice(5, 10).map(source => source.eventId));
  assert.throws(() => planStoryMemoryBackfill({ ...base, maxJobs: 0 }), /ARGUMENTS_INVALID/);
  assert.notEqual(first.report.reviewHash, planStoryMemoryBackfill(base).report.reviewHash);
});
