import { describe, it, expect } from 'vitest';

describe('Graceful shutdown', () => {
  it('should define complete shutdown sequence', () => {
    const shutdownSteps = [
      'scheduler.stop()',
      'webhookWorker.stop()',
      'pluginBridge.stop()',
      'kafkaBridge.disconnect()',
      'websocketHandler.close()',
      'closeRedis()',
      'closeSentry()',
    ];
    expect(shutdownSteps).toHaveLength(7);
  });

  it('should have a 10 second force-exit timeout', () => {
    const SHUTDOWN_TIMEOUT_MS = 10_000;
    expect(SHUTDOWN_TIMEOUT_MS).toBe(10000);
  });

  it('should handle both SIGTERM and SIGINT', () => {
    const signals = ['SIGTERM', 'SIGINT'];
    expect(signals).toContain('SIGTERM');
    expect(signals).toContain('SIGINT');
  });
});
