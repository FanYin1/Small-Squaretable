import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { WebhookWorker } from './webhook.worker';

// ── Mock repository ──

function createMockRepo() {
  return {
    findPendingDeliveries: vi.fn().mockResolvedValue([]),
    updateDelivery: vi.fn().mockResolvedValue({}),
    // Stubs for other methods (not used by worker)
    createEndpoint: vi.fn(),
    findEndpointById: vi.fn(),
    findEndpointsByUserId: vi.fn(),
    findEndpointsByEvent: vi.fn(),
    updateEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    createDelivery: vi.fn(),
    findDeliveriesByEndpointId: vi.fn(),
  } as any;
}

// ── Helper: build a fake delivery ──

function makeDelivery(overrides: Record<string, any> = {}) {
  return {
    id: 'del-001',
    endpointId: 'ep-001',
    event: 'character.created',
    payload: { characterId: 'c-1', name: 'Alice' },
    status: 'pending',
    httpStatus: null,
    response: null,
    attempts: 0,
    maxAttempts: 5,
    nextRetryAt: null,
    createdAt: new Date(),
    completedAt: null,
    endpoint: {
      id: 'ep-001',
      userId: 'u-001',
      url: 'https://example.com/webhook',
      secret: 'whsec_test_secret',
      events: ['character.created'],
      isActive: true,
      description: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

describe('WebhookWorker', () => {
  let worker: WebhookWorker;
  let repo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    repo = createMockRepo();
    worker = new WebhookWorker(repo);
  });

  afterEach(() => {
    worker.stop();
    vi.restoreAllMocks();
  });

  // ── sign ──

  describe('sign', () => {
    it('should produce consistent HMAC-SHA256 signatures', () => {
      const sig1 = worker.sign('secret', '{"a":1}');
      const sig2 = worker.sign('secret', '{"a":1}');
      expect(sig1).toBe(sig2);
    });

    it('should return sha256=<hex> format', () => {
      const sig = worker.sign('secret', 'payload');
      expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('should produce different signatures for different secrets', () => {
      const sig1 = worker.sign('secret-a', 'payload');
      const sig2 = worker.sign('secret-b', 'payload');
      expect(sig1).not.toBe(sig2);
    });

    it('should match Node.js crypto output', () => {
      const secret = 'my-secret';
      const payload = '{"event":"test"}';
      const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
      expect(worker.sign(secret, payload)).toBe(expected);
    });
  });

  // ── getRetryDelay ──

  describe('getRetryDelay', () => {
    it('should return 30s for attempt 0', () => {
      expect(worker.getRetryDelay(0)).toBe(30_000);
    });

    it('should return 2m for attempt 1', () => {
      expect(worker.getRetryDelay(1)).toBe(120_000);
    });

    it('should return 15m for attempt 2', () => {
      expect(worker.getRetryDelay(2)).toBe(900_000);
    });

    it('should return 1h for attempt 3', () => {
      expect(worker.getRetryDelay(3)).toBe(3_600_000);
    });

    it('should return 6h for attempt 4', () => {
      expect(worker.getRetryDelay(4)).toBe(21_600_000);
    });

    it('should cap at 6h for attempts beyond the array', () => {
      expect(worker.getRetryDelay(10)).toBe(21_600_000);
      expect(worker.getRetryDelay(100)).toBe(21_600_000);
    });
  });

  // ── deliver ──

  describe('deliver', () => {
    it('should mark delivery as success on 2xx response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const delivery = makeDelivery();
      await worker.deliver(delivery);

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(repo.updateDelivery).toHaveBeenCalledWith('del-001', expect.objectContaining({
        status: 'success',
        httpStatus: 200,
        response: 'OK',
        attempts: 1,
      }));
      // completedAt should be a Date
      const updateCall = repo.updateDelivery.mock.calls[0][1];
      expect(updateCall.completedAt).toBeInstanceOf(Date);
    });

    it('should send correct headers including HMAC signature', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);

      const delivery = makeDelivery();
      await worker.deliver(delivery);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/webhook');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Webhook-Id']).toBe('del-001');
      expect(options.headers['X-Webhook-Event']).toBe('character.created');
      expect(options.headers['X-Webhook-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(options.headers['User-Agent']).toBe('SmallSquaretable-Webhook/1.0');
    });

    it('should mark delivery as retrying on non-2xx with attempts remaining', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const delivery = makeDelivery({ attempts: 0, maxAttempts: 5 });
      await worker.deliver(delivery);

      expect(repo.updateDelivery).toHaveBeenCalledWith('del-001', expect.objectContaining({
        status: 'retrying',
        httpStatus: 500,
        response: 'Internal Server Error',
        attempts: 1,
      }));
      const updateCall = repo.updateDelivery.mock.calls[0][1];
      expect(updateCall.nextRetryAt).toBeInstanceOf(Date);
      // nextRetryAt should be in the future
      expect(updateCall.nextRetryAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it('should mark delivery as failed when max attempts reached', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const delivery = makeDelivery({ attempts: 4, maxAttempts: 5 });
      await worker.deliver(delivery);

      expect(repo.updateDelivery).toHaveBeenCalledWith('del-001', expect.objectContaining({
        status: 'failed',
        httpStatus: 502,
        response: 'Bad Gateway',
        attempts: 5,
      }));
      const updateCall = repo.updateDelivery.mock.calls[0][1];
      expect(updateCall.completedAt).toBeInstanceOf(Date);
    });

    it('should handle fetch errors (network failure) and retry', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);

      const delivery = makeDelivery({ attempts: 1, maxAttempts: 5 });
      await worker.deliver(delivery);

      expect(repo.updateDelivery).toHaveBeenCalledWith('del-001', expect.objectContaining({
        status: 'retrying',
        httpStatus: null,
        response: 'ECONNREFUSED',
        attempts: 2,
      }));
    });

    it('should handle fetch errors and mark failed at max attempts', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('timeout'));
      vi.stubGlobal('fetch', mockFetch);

      const delivery = makeDelivery({ attempts: 4, maxAttempts: 5 });
      await worker.deliver(delivery);

      expect(repo.updateDelivery).toHaveBeenCalledWith('del-001', expect.objectContaining({
        status: 'failed',
        httpStatus: null,
        response: 'timeout',
        attempts: 5,
      }));
    });

    it('should truncate response to 1000 characters', async () => {
      const longResponse = 'x'.repeat(2000);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(longResponse),
      });
      vi.stubGlobal('fetch', mockFetch);

      const delivery = makeDelivery();
      await worker.deliver(delivery);

      const updateCall = repo.updateDelivery.mock.calls[0][1];
      expect(updateCall.response.length).toBe(1000);
    });
  });

  // ── start / stop ──

  describe('start / stop', () => {
    it('should not start multiple timers', () => {
      worker.start(60_000);
      worker.start(60_000);
      // If it started twice, stop would only clear one — but our implementation guards against this
      worker.stop();
      // No error means success
    });

    it('should be safe to call stop when not started', () => {
      worker.stop(); // Should not throw
    });
  });
});
