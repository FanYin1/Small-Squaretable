/**
 * Plugin Sandbox Manager
 *
 * Manages Worker Threads from the main thread for sandboxed plugin execution.
 * Each plugin instance runs in its own Worker with memory limits and timeouts.
 */

import { Worker, type WorkerOptions } from 'worker_threads';
import * as path from 'path';
import type { PluginExecutionResult } from '../../types/plugin';
import type { PluginRepository } from '../../db/repositories/plugin.repository';

const WORKER_PATH = path.resolve(__dirname, '../workers/plugin.worker.js');
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MEMORY_LIMIT = 64; // MB
const MAX_WORKER_LIFETIME = 3_600_000; // 1 hour

/**
 * Minimal interface for a Worker-like object.
 * Allows injection of mock workers for testing.
 */
export interface WorkerLike {
  on(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
}

export type WorkerFactory = (workerPath: string, options?: WorkerOptions) => WorkerLike;

/**
 * Default factory that creates real Worker threads.
 */
export const defaultWorkerFactory: WorkerFactory = (workerPath, options) => {
  return new Worker(workerPath, options) as unknown as WorkerLike;
};

interface ActiveWorker {
  worker: WorkerLike;
  pluginId: string;
  userId: string;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout>;
}

export class PluginSandbox {
  private activeWorkers = new Map<string, ActiveWorker>();

  constructor(
    private pluginRepo: PluginRepository,
    private createWorker: WorkerFactory = defaultWorkerFactory,
  ) {}

  /**
   * Load a plugin into a new Worker Thread.
   * If a worker already exists for this pluginId:userId pair, it is terminated first.
   *
   * Returns the workerId and the list of events the plugin registered for.
   */
  async loadPlugin(
    pluginId: string,
    userId: string,
    sourceCode: string,
    config: Record<string, unknown> = {},
  ): Promise<{ workerId: string; events: string[] }> {
    const workerId = `${pluginId}:${userId}`;

    // Terminate any existing worker for this key
    await this.unloadPlugin(workerId);

    return new Promise((resolve, reject) => {
      const worker = this.createWorker(WORKER_PATH, {
        workerData: { config },
        resourceLimits: {
          maxOldGenerationSizeMb: DEFAULT_MEMORY_LIMIT,
          maxYoungGenerationSizeMb: DEFAULT_MEMORY_LIMIT / 4,
        },
      });

      const loadTimeout = setTimeout(() => {
        worker.terminate();
        this.activeWorkers.delete(workerId);
        reject(new Error('Plugin load timeout'));
      }, DEFAULT_TIMEOUT);

      worker.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          clearTimeout(loadTimeout);
          const lifetimeTimeout = setTimeout(() => {
            this.unloadPlugin(workerId);
          }, MAX_WORKER_LIFETIME);
          this.activeWorkers.set(workerId, {
            worker,
            pluginId,
            userId,
            startedAt: Date.now(),
            timeout: lifetimeTimeout,
          });
          resolve({ workerId, events: msg.payload.events });
        } else if (msg.type === 'error') {
          clearTimeout(loadTimeout);
          worker.terminate();
          reject(new Error(msg.payload.message));
        } else if (msg.type === 'kv_request') {
          this.handleKvRequest(workerId, msg.payload);
        } else if (msg.type === 'log') {
          // Plugin logs -- could forward to structured logger
        }
      });

      worker.on('error', (err: Error) => {
        clearTimeout(loadTimeout);
        this.activeWorkers.delete(workerId);
        reject(err);
      });

      worker.on('exit', () => {
        this.activeWorkers.delete(workerId);
      });

      worker.postMessage({ type: 'execute', payload: { sourceCode } });
    });
  }
  /**
   * Send an event to a loaded plugin worker and wait for the result.
   */
  async sendEvent(
    workerId: string,
    event: string,
    payload: unknown,
  ): Promise<PluginExecutionResult> {
    const active = this.activeWorkers.get(workerId);
    if (!active) {
      return { success: false, duration: 0, error: 'Plugin not loaded' };
    }

    const start = Date.now();
    return new Promise((resolve) => {
      const eventTimeout = setTimeout(() => {
        resolve({
          success: false,
          duration: Date.now() - start,
          error: 'Event handler timeout',
        });
      }, DEFAULT_TIMEOUT);

      const handler = (msg: any) => {
        if (msg.type === 'event_result' && msg.payload.event === event) {
          clearTimeout(eventTimeout);
          active.worker.off('message', handler);
          resolve({
            success: msg.payload.success,
            duration: Date.now() - start,
            output: msg.payload.result,
            error: msg.payload.error,
          });
        }
      };

      active.worker.on('message', handler);
      active.worker.postMessage({ type: 'event', payload: { event, payload } });
    });
  }

  /**
   * Terminate a worker and remove it from the active map.
   */
  async unloadPlugin(workerId: string): Promise<void> {
    const active = this.activeWorkers.get(workerId);
    if (active) {
      clearTimeout(active.timeout);
      await active.worker.terminate();
      this.activeWorkers.delete(workerId);
    }
  }

  /**
   * Handle a KV request from a worker by delegating to the plugin repository.
   */
  async handleKvRequest(
    workerId: string,
    request: { id: string; op: string; key: string; value?: unknown },
  ): Promise<void> {
    const active = this.activeWorkers.get(workerId);
    if (!active) return;

    try {
      let result: unknown;
      if (request.op === 'get') {
        result = await this.pluginRepo.kvGet(active.pluginId, active.userId, request.key);
      } else if (request.op === 'set') {
        await this.pluginRepo.kvSet(active.pluginId, active.userId, request.key, request.value);
      } else if (request.op === 'delete') {
        result = await this.pluginRepo.kvDelete(active.pluginId, active.userId, request.key);
      }
      active.worker.postMessage({
        type: 'kv_response',
        payload: { id: request.id, result },
      });
    } catch (error) {
      active.worker.postMessage({
        type: 'kv_response',
        payload: { id: request.id, error: (error as Error).message },
      });
    }
  }

  /**
   * Get the number of currently active worker threads.
   */
  getActiveWorkerCount(): number {
    return this.activeWorkers.size;
  }

  /**
   * Terminate all active workers. Call this during graceful shutdown.
   */
  async shutdown(): Promise<void> {
    const workerIds = [...this.activeWorkers.keys()];
    for (const id of workerIds) {
      await this.unloadPlugin(id);
    }
  }
}

import { pluginRepository } from '../../db/repositories/plugin.repository';
export const pluginSandbox = new PluginSandbox(pluginRepository);
