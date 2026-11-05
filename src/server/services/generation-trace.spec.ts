import { expect, it } from 'vitest';
import { GenerationTraceRecorder } from './generation-trace';
import { AppError } from '../../core/errors';
import { ContextBudgetError } from './context-budget';
import { AnthropicApiError } from './anthropic-api-error';
import { parseStoryIntentOutput } from '../../types/story-intent';

it('keeps stage, saved reply and timing separate from later settlement failure without response text', () => {
  const trace = new GenerationTraceRecorder('request', 'model');
  trace.stage('upstream');
  trace.response({ content: 'PRIVATE RESPONSE sk-test', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 20 } });
  trace.stage('commit'); trace.saved(3, { stateStatus: 'confirmed' });
  trace.stage('settlement');
  const error = new Error('PRIVATE SQL password=bad');
  error.stack = 'Error: PRIVATE\n    at run (/app/dist/server/index.js:42:7)\n    at https://private.example/key:3:4\n    at secret (/home/person/file.ts:4:5)';
  trace.fail(error); trace.stage('outcome'); trace.fail(new Error('later error'));
  const result = trace.finish('failed', 'MESSAGE_ERROR');
  expect(result).toMatchObject({ status: 'failed', stage: 'settlement', assistantMessageId: 3, stateStatus: 'confirmed', stackFrames: ['dist/server/index.js:42:7'], usage: { promptTokens: 10, completionTokens: 20 } });
  expect(result.response?.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|password|sk-test|private.example/);
});
it('captures safe provider categories and capacity details, without arbitrary AppError details', () => {
  const trace = new GenerationTraceRecorder('request', 'model');
  trace.stage('upstream'); trace.fail(new AnthropicApiError(400, 'output', 'read'));
  expect(trace.finish('failed', 'LLM_API_ERROR')).toMatchObject({ httpStatus: 400, errorCategory: 'output', errorBodyState: 'read' });
  const capacity = new GenerationTraceRecorder('request', 'model'); capacity.stage('context');
  capacity.fail(new ContextBudgetError({ reason: 'latest', contextWindow: 100, outputTokens: 10, requiredTokens: 110, availableTokens: 90 }));
  expect(capacity.finish('failed', 'CONTEXT_BUDGET_EXCEEDED').contextFailure?.requiredTokens).toBe(110);
  const generic = new GenerationTraceRecorder('request', 'model'); generic.fail(new AppError('SECRET', 500, 'BAD', { key: 'SECRET' }));
  expect(JSON.stringify(generic.finish('failed', 'BAD'))).not.toContain('SECRET');
});
it('keeps validation failure anchored to commit despite successful outcome persistence', () => {
  const trace = new GenerationTraceRecorder('request', 'model');
  trace.saved(2, { stateStatus: 'interrupted', storyDiagnostics: { validation: 'failed', code: 'invalid_json', warnings: [], jsonFailure: { kind: 'duplicate_key', offset: 3, length: 20 } } });
  trace.stage('aftercare'); trace.stage('outcome'); trace.data.outcomePersisted = true;
  expect(trace.finish('failed', 'STORY_INVALID_JSON')).toMatchObject({ stage: 'commit', outcomePersisted: true, validation: { code: 'invalid_json' } });
});
it('records schema paths and codes without rejected field names, messages or values', () => {
  const parsed = parseStoryIntentOutput('正文\n<story-intent>'+JSON.stringify({ version: 1, disposition: 'execution', steps: [{kind:'execute',actionId:23,evidence:'PRIVATE'}], facts: [], 'PRIVATE KEY': 'secret' })+'</story-intent>', 'PRIVATE', []);
  expect(parsed.invalidReason).toBe('invalid_schema');
  expect(parsed.schemaIssues).toContainEqual({ path: 'steps.0.actionId', code: 'invalid_type' });
  expect(JSON.stringify(parsed.schemaIssues)).not.toMatch(/PRIVATE|secret/);
});
it('bounds events and schema error volume', () => {
  const trace = new GenerationTraceRecorder('request', 'model');
  for (let i=0;i<50;i++) trace.stage('upstream');
  expect(trace.finish('stopped').events).toHaveLength(32);
});
