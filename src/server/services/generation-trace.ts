import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { contextBudgetDetailsSchema } from '../../types/context-budget';
import { AppError } from '../../core/errors';
import { AnthropicApiError } from './anthropic-api-error';
import { generationTraceSchema, type GenerationTrace, type GenerationStage } from '../../types/generation-trace';
import type { StoryTurnDiagnostics } from '../../types/story-intent';

/** One bounded metadata record per authorized, non-replayed single-player attempt. */
export class GenerationTraceRecorder {
  readonly started = performance.now();
  readonly data: GenerationTrace;
  private failedStage?: GenerationStage;
  private errorCaptured = false;
  constructor(requestId: string, model: string) {
    const now = new Date().toISOString();
    this.data = { version: 1, id: randomUUID(), requestId, model: model.slice(0, 200), capturedAt: now, finishedAt: now,
      promptTraceIds: [], stackFrames: [], status: 'completed', stage: 'preflight', outcomePersisted: false, events: [], durationMs: 0 };
    this.stage('preflight');
  }
  elapsed() { return Math.max(0, Math.round(performance.now() - this.started)); }
  stage(stage: GenerationStage) {
    this.data.stage = stage;
    if (this.data.events.length < 32) this.data.events.push({ stage, elapsedMs: this.elapsed() });
  }
  fail(error: unknown) {
    if (this.errorCaptured) return;
    this.errorCaptured = true;
    this.failedStage ??= this.data.stage;
    if (error instanceof AppError && error.code === 'CONTEXT_BUDGET_EXCEEDED') {
      const details = contextBudgetDetailsSchema.safeParse(error.details);
      if (details.success) this.data.contextFailure = details.data;
    }
    const status = error instanceof AppError ? error.statusCode : undefined;
    if (status && status >= 100 && status <= 599) this.data.httpStatus = status;
    this.data.errorCategory = error instanceof AnthropicApiError ? error.category
      : status === 401 ? 'authentication' : status === 403 ? 'permission' : status === 429 ? 'rate_limit'
      : this.data.contextFailure ? 'context' : status && status >= 500 ? 'unavailable'
      : error instanceof Error && error.name === 'AbortError' ? 'cancelled'
      : error instanceof Error && error.name === 'TimeoutError' ? 'timeout'
      : error instanceof TypeError && this.data.stage === 'upstream' ? 'network' : 'internal';
    if (error instanceof AnthropicApiError) this.data.errorBodyState = error.bodyState;
    // Only application source locations; never error messages, query values, URLs or source lines.
    const frames = error instanceof Error ? error.stack?.split('\n').slice(1) ?? [] : [];
    this.data.stackFrames = frames.flatMap(frame => {
      const match = /(?:^|[(/])((?:src|dist)\/(?:server|core|db)\/[A-Za-z0-9_./-]+\.(?:[cm]?js|ts):\d+:\d+)\)?$/.exec(frame.trim());
      return match ? [match[1].slice(0, 180)] : [];
    }).slice(0, 8);
  }
  response(output: { content: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null; finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'other'; streamIncomplete?: boolean; outputTruncated?: boolean }, timing?: { firstTokenMs?: number; firstVisibleMs?: number }) {
    if (output.usage) {
      this.data.usage = {};
      for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
        const value = output.usage[key];
        if (value != null && Number.isSafeInteger(value) && value >= 0) this.data.usage[key] = value;
      }
    }
    this.data.response = { characters: output.content.length, sha256: createHash('sha256').update(output.content).digest('hex'),
      finishReason: output.finishReason, streamIncomplete: !!output.streamIncomplete, outputTruncated: !!output.outputTruncated,
      ...(timing?.firstTokenMs == null ? {} : { firstTokenMs: Math.max(0, Math.round(timing.firstTokenMs)) }),
      ...(timing?.firstVisibleMs == null ? {} : { firstVisibleMs: Math.max(0, Math.round(timing.firstVisibleMs)) }) };
  }
  saved(id: number, extra: unknown) {
    this.data.assistantMessageId = id;
    const value = extra as { stateStatus?: string; storyDiagnostics?: StoryTurnDiagnostics } | null;
    this.data.stateStatus = ['confirmed', 'interrupted', 'proposed'].includes(value?.stateStatus ?? '') ? value!.stateStatus as 'confirmed' | 'interrupted' | 'proposed' : 'unknown';
    const diagnostic = value?.storyDiagnostics;
    if (diagnostic) {
      this.data.validation = { result: diagnostic.validation, code: diagnostic.code, warnings: diagnostic.warnings ?? [],
        jsonFailure: diagnostic.jsonFailure, protocolFailure: diagnostic.protocolFailure, schemaIssues: diagnostic.schemaIssues };
      if (diagnostic.validation !== 'passed') this.failedStage ??= 'commit';
    }
  }
  finish(status: GenerationTrace['status'], errorCode?: string): GenerationTrace {
    this.data.status = status;
    this.data.errorCode = errorCode && /^[A-Z][A-Z0-9_]{0,79}$/.test(errorCode) ? errorCode : errorCode ? 'UNCLASSIFIED_ERROR' : undefined;
    this.data.stage = this.failedStage ?? this.data.stage;
    this.data.finishedAt = new Date().toISOString(); this.data.durationMs = this.elapsed();
    return generationTraceSchema.parse(this.data);
  }
}
