import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryMemoryProviders } from '../services/story-memory-worker.service';

const mocks = vi.hoisted(() => ({ runOnce: vi.fn(), providers: undefined as StoryMemoryProviders | undefined,
  getDefaultModel: vi.fn(), getModelMeta: vi.fn(), findProviderForModel: vi.fn(), chatCompletion: vi.fn() }));
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../core/config', () => ({ config: { memoryLimitFree: 100 } }));
vi.mock('../config/llm.config', () => ({ getDefaultModel: mocks.getDefaultModel, getModelMeta: mocks.getModelMeta, findProviderForModel: mocks.findProviderForModel }));
vi.mock('../services/llm.service', () => ({ llmService: { chatCompletion: mocks.chatCompletion } }));
vi.mock('../services/embedding.service', () => ({ embeddingService: { embedBatchStrict: vi.fn() } }));
vi.mock('../services/story-memory-worker.service', () => ({
  StoryMemoryWorker: class {
    runOnce = mocks.runOnce;
    constructor(_database: unknown, providers: StoryMemoryProviders) { mocks.providers = providers; }
  },
}));

beforeEach(() => {
  vi.resetModules();
  mocks.runOnce.mockReset();
  mocks.providers = undefined;
  mocks.getDefaultModel.mockReset().mockReturnValue('fixture-model');
  mocks.findProviderForModel.mockReset().mockReturnValue({ apiFormat: 'openai' });
  mocks.getModelMeta.mockReset().mockReturnValue({ contextWindow: 128000, maxOutputTokens: 1024 });
  mocks.chatCompletion.mockReset();
  vi.stubEnv('STORY_MEMORY_JOBS_ENABLED', 'true');
  vi.stubEnv('STORY_MEMORY_MAX_ATTEMPTS', '3');
  vi.stubEnv('STORY_MEMORY_TIMEOUT_MS', '30000');
  vi.stubEnv('STORY_MEMORY_MAX_INPUT_CHARS', '24000');
});

describe('story memory provider boundary', () => {
  const sources = [{ eventId: 'fixture-event', version: 1, inputMessageId: 1, messageId: 2,
    input: '约好去灯塔。', reply: '约定已记录，会面尚未发生。' }];

  it('requests versioned extraction with bounded output and a single provider attempt', async () => {
    await import('./story-memory.job');
    const result = { version: 1, facts: [], summary: { content: '约定尚待履行。', sourceMessageIds: [2] } };
    mocks.chatCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(result) } }] });
    const signal = new AbortController().signal;
    await expect(mocks.providers!.extract(sources, signal)).resolves.toEqual(result);
    expect(mocks.chatCompletion).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ max_tokens: 1024, stream: false }), { signal, maxAttempts: 1 });
  });

  it('rejects a fresh legacy array response instead of inventing a summary', async () => {
    await import('./story-memory.job');
    mocks.chatCompletion.mockResolvedValue({ choices: [{ message: { content: '[]' } }] });
    await expect(mocks.providers!.extract(sources, new AbortController().signal)).rejects.toThrow();
  });

  it('requests native JSON output for Gemini extraction without changing other providers', async () => {
    mocks.findProviderForModel.mockReturnValue({ apiFormat: 'gemini' });
    await import('./story-memory.job');
    const result = { version: 1, facts: [], summary: { content: '约定未履行。', sourceMessageIds: [2] } };
    mocks.chatCompletion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(result) } }] });
    await mocks.providers!.extract(sources, new AbortController().signal);
    expect(mocks.chatCompletion).toHaveBeenCalledWith(expect.objectContaining({ response_format: { type: 'json_object' } }), expect.anything());
  });

  it('rejects extraction overflow before contacting the provider', async () => {
    await import('./story-memory.job');
    mocks.getModelMeta.mockReturnValue({ contextWindow: 2048, maxOutputTokens: 1024 });
    await expect(mocks.providers!.extract([{ ...sources[0], input: '超长资料'.repeat(2000) }], new AbortController().signal)).rejects.toMatchObject({ code: 'CONTEXT_BUDGET_EXCEEDED' });
    expect(mocks.chatCompletion).not.toHaveBeenCalled();
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('story memory scheduler entry', () => {
  it('prevents overlapping work in one process and allows the following tick', async () => {
    const { runStoryMemory } = await import('./story-memory.job');
    let release!: (result: string) => void;
    mocks.runOnce.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = runStoryMemory();
    await runStoryMemory();
    expect(mocks.runOnce).toHaveBeenCalledOnce();
    release('succeeded');
    await first;
    mocks.runOnce.mockResolvedValueOnce('idle');
    await runStoryMemory();
    expect(mocks.runOnce).toHaveBeenCalledTimes(2);
  });

  it.each(['retry', 'failed'])('surfaces %s and releases the execution guard', async result => {
    const { runStoryMemory } = await import('./story-memory.job');
    mocks.runOnce.mockResolvedValueOnce(result).mockResolvedValueOnce('idle');
    await expect(runStoryMemory()).rejects.toThrow(`derivation ${result}`);
    await expect(runStoryMemory()).resolves.toBeUndefined();
    expect(mocks.runOnce).toHaveBeenCalledTimes(2);
  });

  it('honors explicit pause without claiming any tasks', async () => {
    vi.stubEnv('STORY_MEMORY_JOBS_ENABLED', 'false');
    const { runStoryMemory } = await import('./story-memory.job');
    await runStoryMemory();
    expect(mocks.runOnce).not.toHaveBeenCalled();
  });

  it('rejects an unbounded retry configuration before scheduling', async () => {
    vi.stubEnv('STORY_MEMORY_MAX_ATTEMPTS', '999');
    await expect(import('./story-memory.job')).rejects.toThrow();
    expect(mocks.runOnce).not.toHaveBeenCalled();
  });
});
