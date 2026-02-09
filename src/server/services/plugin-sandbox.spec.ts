import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock the plugin repository module to prevent DB connection
vi.mock('../../db/repositories/plugin.repository', () => ({
  pluginRepository: {},
}));

import { PluginSandbox, type WorkerLike, type WorkerFactory } from './plugin-sandbox';

// ── Mock Worker ──

class MockWorker extends EventEmitter implements WorkerLike {
  postMessage = vi.fn();
  terminate = vi.fn().mockResolvedValue(0);

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }
}

// ── Mock plugin repository ──

function createMockRepo() {
  return {
    kvGet: vi.fn().mockResolvedValue(null),
    kvSet: vi.fn().mockResolvedValue(undefined),
    kvDelete: vi.fn().mockResolvedValue(true),
    createPlugin: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByAuthorId: vi.fn(),
    findPublished: vi.fn(),
    searchPlugins: vi.fn(),
    countPublished: vi.fn(),
    updatePlugin: vi.fn(),
    deletePlugin: vi.fn(),
    incrementInstallCount: vi.fn(),
    decrementInstallCount: vi.fn(),
  } as any;
}
// ── Helpers ──

const createdWorkers: MockWorker[] = [];

function mockWorkerFactory(): WorkerFactory {
  return (_path: string, _options?: any): WorkerLike => {
    const worker = new MockWorker();
    createdWorkers.push(worker);
    return worker;
  };
}

function getLastWorker(): MockWorker {
  return createdWorkers[createdWorkers.length - 1];
}

/** Flush microtasks so the async unloadPlugin() inside loadPlugin resolves */
async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Start loading a plugin and return the promise + the created worker.
 * Handles the microtask flush needed because loadPlugin awaits internally.
 */
async function startLoad(
  sb: PluginSandbox,
  pluginId: string,
  userId: string,
  code = 'code',
  config?: Record<string, unknown>,
) {
  const loadPromise = sb.loadPlugin(pluginId, userId, code, config);
  await tick();
  const worker = getLastWorker();
  return { loadPromise, worker };
}

function simulateReady(worker: MockWorker, events: string[] = []) {
  worker.emit('message', { type: 'ready', payload: { events } });
}

function simulateError(worker: MockWorker, message: string) {
  worker.emit('message', { type: 'error', payload: { message } });
}

function simulateEventResult(
  worker: MockWorker,
  event: string,
  result: unknown,
  success = true,
  error?: string,
) {
  worker.emit('message', {
    type: 'event_result',
    payload: { event, result, success, error },
  });
}
describe('PluginSandbox', () => {
  let sandbox: PluginSandbox;
  let repo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    vi.useFakeTimers();
    createdWorkers.length = 0;
    repo = createMockRepo();
    sandbox = new PluginSandbox(repo, mockWorkerFactory());
  });

  afterEach(async () => {
    await sandbox.shutdown();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── loadPlugin ──

  describe('loadPlugin', () => {
    it('should create a worker and return workerId + events', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');

      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'execute',
        payload: { sourceCode: 'code' },
      });

      simulateReady(worker, ['chat.message.before']);
      const result = await loadPromise;

      expect(result.workerId).toBe('p1:u1');
      expect(result.events).toEqual(['chat.message.before']);
      expect(sandbox.getActiveWorkerCount()).toBe(1);
    });

    it('should terminate existing worker for same workerId', async () => {
      const { loadPromise: lp1, worker: w1 } = await startLoad(sandbox, 'p1', 'u1', 'c1');
      simulateReady(w1, []);
      await lp1;

      const { loadPromise: lp2, worker: w2 } = await startLoad(sandbox, 'p1', 'u1', 'c2');
      simulateReady(w2, []);
      await lp2;

      expect(w1.terminate).toHaveBeenCalled();
      expect(sandbox.getActiveWorkerCount()).toBe(1);
    });

    it('should reject when worker sends error message', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1', 'bad');
      simulateError(worker, 'SyntaxError: Unexpected token');

      await expect(loadPromise).rejects.toThrow('SyntaxError: Unexpected token');
      expect(worker.terminate).toHaveBeenCalled();
    });
    it('should reject on worker error event', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      worker.emit('error', new Error('Worker crashed'));

      await expect(loadPromise).rejects.toThrow('Worker crashed');
      expect(sandbox.getActiveWorkerCount()).toBe(0);
    });

    it('should reject on load timeout', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1', 'slow');
      vi.advanceTimersByTime(30_001);

      await expect(loadPromise).rejects.toThrow('Plugin load timeout');
      expect(worker.terminate).toHaveBeenCalled();
    });

    it('should pass workerPath and options to factory', async () => {
      const spyFactory = vi.fn((_path: string, _options?: any): WorkerLike => {
        const w = new MockWorker();
        createdWorkers.push(w);
        return w;
      });
      const sb = new PluginSandbox(repo, spyFactory);
      const config = { apiKey: 'test-key' };
      const { loadPromise, worker } = await startLoad(sb, 'p1', 'u1', 'code', config);
      simulateReady(worker, []);
      await loadPromise;

      expect(spyFactory).toHaveBeenCalledWith(
        expect.stringContaining('plugin.worker'),
        expect.objectContaining({ workerData: { config } }),
      );
      await sb.shutdown();
    });
  });

  // ── sendEvent ──

  describe('sendEvent', () => {
    it('should send event to worker and return result', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, ['chat.message.before']);
      await loadPromise;

      const eventPromise = sandbox.sendEvent('p1:u1', 'chat.message.before', { text: 'hello' });
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'event',
        payload: { event: 'chat.message.before', payload: { text: 'hello' } },
      });
      simulateEventResult(worker, 'chat.message.before', { text: 'modified' });

      const result = await eventPromise;
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ text: 'modified' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
    it('should return error when plugin not loaded', async () => {
      const result = await sandbox.sendEvent('nonexistent', 'evt', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin not loaded');
      expect(result.duration).toBe(0);
    });

    it('should return error result from worker', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, ['chat.message.before']);
      await loadPromise;

      const eventPromise = sandbox.sendEvent('p1:u1', 'chat.message.before', {});
      simulateEventResult(worker, 'chat.message.before', undefined, false, 'Handler error');

      const result = await eventPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Handler error');
    });

    it('should timeout if worker does not respond', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, ['chat.message.before']);
      await loadPromise;

      const eventPromise = sandbox.sendEvent('p1:u1', 'chat.message.before', {});
      vi.advanceTimersByTime(30_001);

      const result = await eventPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Event handler timeout');
    });
  });

  // ── unloadPlugin ──

  describe('unloadPlugin', () => {
    it('should terminate worker and remove from active map', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, []);
      await loadPromise;

      expect(sandbox.getActiveWorkerCount()).toBe(1);
      await sandbox.unloadPlugin('p1:u1');

      expect(worker.terminate).toHaveBeenCalled();
      expect(sandbox.getActiveWorkerCount()).toBe(0);
    });

    it('should be safe to call with nonexistent workerId', async () => {
      await expect(sandbox.unloadPlugin('nonexistent')).resolves.toBeUndefined();
    });
  });
  // ── getActiveWorkerCount ──

  describe('getActiveWorkerCount', () => {
    it('should return 0 when no workers are loaded', () => {
      expect(sandbox.getActiveWorkerCount()).toBe(0);
    });

    it('should return correct count with multiple workers', async () => {
      const { loadPromise: lp1, worker: w1 } = await startLoad(sandbox, 'p1', 'u1', 'c1');
      simulateReady(w1, []);
      await lp1;

      const { loadPromise: lp2, worker: w2 } = await startLoad(sandbox, 'p2', 'u1', 'c2');
      simulateReady(w2, []);
      await lp2;

      expect(sandbox.getActiveWorkerCount()).toBe(2);
      await sandbox.unloadPlugin('p1:u1');
      expect(sandbox.getActiveWorkerCount()).toBe(1);
    });
  });

  // ── shutdown ──

  describe('shutdown', () => {
    it('should terminate all active workers', async () => {
      const { loadPromise: lp1, worker: w1 } = await startLoad(sandbox, 'p1', 'u1', 'c1');
      simulateReady(w1, []);
      await lp1;

      const { loadPromise: lp2, worker: w2 } = await startLoad(sandbox, 'p2', 'u1', 'c2');
      simulateReady(w2, []);
      await lp2;

      const { loadPromise: lp3, worker: w3 } = await startLoad(sandbox, 'p3', 'u2', 'c3');
      simulateReady(w3, []);
      await lp3;

      expect(sandbox.getActiveWorkerCount()).toBe(3);
      await sandbox.shutdown();

      expect(sandbox.getActiveWorkerCount()).toBe(0);
      expect(w1.terminate).toHaveBeenCalled();
      expect(w2.terminate).toHaveBeenCalled();
      expect(w3.terminate).toHaveBeenCalled();
    });

    it('should be safe to call when no workers are active', async () => {
      await expect(sandbox.shutdown()).resolves.toBeUndefined();
    });
  });
  // ── handleKvRequest ──

  describe('handleKvRequest', () => {
    it('should delegate kv get to pluginRepo.kvGet', async () => {
      repo.kvGet.mockResolvedValue('stored-value');
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, []);
      await loadPromise;

      await sandbox.handleKvRequest('p1:u1', { id: '1', op: 'get', key: 'myKey' });

      expect(repo.kvGet).toHaveBeenCalledWith('p1', 'u1', 'myKey');
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'kv_response',
        payload: { id: '1', result: 'stored-value' },
      });
    });

    it('should delegate kv set to pluginRepo.kvSet', async () => {
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, []);
      await loadPromise;

      await sandbox.handleKvRequest('p1:u1', { id: '2', op: 'set', key: 'k', value: 42 });

      expect(repo.kvSet).toHaveBeenCalledWith('p1', 'u1', 'k', 42);
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'kv_response',
        payload: { id: '2', result: undefined },
      });
    });

    it('should delegate kv delete to pluginRepo.kvDelete', async () => {
      repo.kvDelete.mockResolvedValue(true);
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, []);
      await loadPromise;

      await sandbox.handleKvRequest('p1:u1', { id: '3', op: 'delete', key: 'k' });

      expect(repo.kvDelete).toHaveBeenCalledWith('p1', 'u1', 'k');
      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'kv_response',
        payload: { id: '3', result: true },
      });
    });

    it('should send error response when repo throws', async () => {
      repo.kvGet.mockRejectedValue(new Error('DB connection failed'));
      const { loadPromise, worker } = await startLoad(sandbox, 'p1', 'u1');
      simulateReady(worker, []);
      await loadPromise;

      await sandbox.handleKvRequest('p1:u1', { id: '4', op: 'get', key: 'k' });

      expect(worker.postMessage).toHaveBeenCalledWith({
        type: 'kv_response',
        payload: { id: '4', error: 'DB connection failed' },
      });
    });

    it('should do nothing when workerId is not found', async () => {
      await sandbox.handleKvRequest('nonexistent', { id: '5', op: 'get', key: 'k' });
      expect(repo.kvGet).not.toHaveBeenCalled();
    });
  });
});
