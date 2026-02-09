/**
 * Plugin Worker Thread
 *
 * Runs inside a Worker Thread to provide sandboxed plugin execution.
 * Freezes dangerous globals, creates a restricted `ctx` object,
 * and communicates with the parent thread via postMessage.
 */

import { parentPort, workerData } from 'worker_threads';

// Freeze dangerous globals to prevent plugin code from accessing them
const _process = globalThis.process;
Object.defineProperty(globalThis, 'process', {
  value: Object.freeze({ env: {}, version: _process.version }),
  writable: false,
  configurable: false,
});

// Block require in the plugin scope (plugins receive it as undefined)
// The worker itself already imported what it needs above.

interface WorkerMessage {
  type: 'execute' | 'event' | 'kv_response';
  payload: unknown;
}

const eventHandlers = new Map<string, ((payload: unknown) => unknown | Promise<unknown>)[]>();
const pendingKvRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let kvRequestId = 0;

const KV_TIMEOUT = 5000;

/**
 * Send a KV request to the parent thread and wait for the response.
 */
function sendKvRequest(op: string, key: string, value?: unknown): Promise<unknown> {
  const id = String(++kvRequestId);
  return new Promise((resolve, reject) => {
    pendingKvRequests.set(id, { resolve, reject });
    parentPort?.postMessage({ type: 'kv_request', payload: { id, op, key, value } });
    setTimeout(() => {
      if (pendingKvRequests.has(id)) {
        pendingKvRequests.delete(id);
        reject(new Error('KV request timeout'));
      }
    }, KV_TIMEOUT);
  });
}

/**
 * The context object exposed to plugin code.
 * Provides event subscription, KV store, config, and logging.
 */
const ctx = {
  /**
   * Register an event handler for a specific event.
   */
  on(event: string, handler: (payload: unknown) => unknown | Promise<unknown>) {
    if (!eventHandlers.has(event)) eventHandlers.set(event, []);
    eventHandlers.get(event)!.push(handler);
  },

  /**
   * Key-value store scoped to the plugin + user.
   */
  kv: {
    async get(key: string) {
      return sendKvRequest('get', key);
    },
    async set(key: string, value: unknown) {
      await sendKvRequest('set', key, value);
    },
    async delete(key: string) {
      return sendKvRequest('delete', key) as Promise<boolean>;
    },
  },

  /**
   * Plugin configuration provided at load time.
   */
  config: (workerData?.config as Record<string, unknown>) ?? {},

  /**
   * Log messages — forwarded to the parent thread.
   */
  log(...args: unknown[]) {
    parentPort?.postMessage({ type: 'log', payload: args });
  },
};

/**
 * Handle messages from the parent thread.
 *
 * - `execute`: Load and run plugin source code in a restricted scope.
 * - `event`: Dispatch an event to registered handlers (pipeline style).
 * - `kv_response`: Resolve a pending KV request from the parent.
 */
parentPort?.on('message', async (msg: WorkerMessage) => {
  if (msg.type === 'execute') {
    try {
      const { sourceCode } = msg.payload as { sourceCode: string };
      // Run plugin code with only `ctx` and a fake `module` in scope.
      // If the plugin assigns module.exports to a function, call it with ctx.
      const pluginFn = new Function(
        'ctx',
        'module',
        sourceCode + '\nif (typeof module.exports === "function") module.exports(ctx);',
      );
      const fakeModule = { exports: {} };
      pluginFn(ctx, fakeModule);
      parentPort?.postMessage({
        type: 'ready',
        payload: { events: [...eventHandlers.keys()] },
      });
    } catch (error) {
      parentPort?.postMessage({
        type: 'error',
        payload: { message: (error as Error).message },
      });
    }
  } else if (msg.type === 'event') {
    const { event, payload: eventPayload } = msg.payload as {
      event: string;
      payload: unknown;
    };
    const handlers = eventHandlers.get(event) ?? [];
    let result = eventPayload;
    try {
      for (const handler of handlers) {
        const handlerResult = await handler(result);
        if (handlerResult !== undefined) result = handlerResult;
      }
      parentPort?.postMessage({
        type: 'event_result',
        payload: { event, result, success: true },
      });
    } catch (error) {
      parentPort?.postMessage({
        type: 'event_result',
        payload: { event, error: (error as Error).message, success: false },
      });
    }
  } else if (msg.type === 'kv_response') {
    const { id, result, error } = msg.payload as {
      id: string;
      result?: unknown;
      error?: string;
    };
    const pending = pendingKvRequests.get(id);
    if (pending) {
      pendingKvRequests.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
    }
  }
});
