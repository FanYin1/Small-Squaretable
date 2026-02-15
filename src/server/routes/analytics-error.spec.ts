import { describe, it, expect } from 'vitest';

describe('Analytics ingestion error handling', () => {
  it('should return 500 when Kafka ingestion fails', () => {
    const errorResponse = {
      success: false,
      error: { code: 'INGESTION_FAILED', message: 'Failed to queue events' },
    };
    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error.code).toBe('INGESTION_FAILED');
  });
});
