import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUsageStore } from './usage';
import { usageApi } from '@client/services/usage.api';

vi.mock('@client/services/usage.api', () => ({
  usageApi: {
    getStats: vi.fn(),
    getQuota: vi.fn(),
  },
}));

describe('useUsageStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should initialize with null values', () => {
    const store = useUsageStore();

    expect(store.stats).toBeNull();
    expect(store.quota).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('should fetch quota successfully', async () => {
    const mockQuota = {
      messages: { allowed: true, currentUsage: 50, limit: 100, remaining: 50 },
      llm_tokens: { allowed: true, currentUsage: 25000, limit: 50000, remaining: 25000 },
      images: { allowed: true, currentUsage: 5, limit: 10, remaining: 5 },
      api_calls: { allowed: true, currentUsage: 0, limit: 0, remaining: 0 },
    };

    vi.mocked(usageApi.getQuota).mockResolvedValue(mockQuota);

    const store = useUsageStore();
    await store.fetchQuota();

    expect(store.quota).toEqual(mockQuota);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('should calculate quota percentage correctly', () => {
    const store = useUsageStore();

    const quota = { allowed: true, currentUsage: 75, limit: 100, remaining: 25 };
    expect(store.getQuotaPercentage(quota)).toBe(75);

    const fullQuota = { allowed: false, currentUsage: 100, limit: 100, remaining: 0 };
    expect(store.getQuotaPercentage(fullQuota)).toBe(100);

    const overQuota = { allowed: false, currentUsage: 120, limit: 100, remaining: 0 };
    expect(store.getQuotaPercentage(overQuota)).toBe(100); // Capped at 100
  });

  it('should return correct quota status', () => {
    const store = useUsageStore();

    const lowUsage = { allowed: true, currentUsage: 50, limit: 100, remaining: 50 };
    expect(store.getQuotaStatus(lowUsage)).toBe('success');

    const warningUsage = { allowed: true, currentUsage: 85, limit: 100, remaining: 15 };
    expect(store.getQuotaStatus(warningUsage)).toBe('warning');

    const dangerUsage = { allowed: false, currentUsage: 100, limit: 100, remaining: 0 };
    expect(store.getQuotaStatus(dangerUsage)).toBe('danger');
  });

  it('should detect warning state when quota > 80%', async () => {
    const mockQuota = {
      messages: { allowed: true, currentUsage: 85, limit: 100, remaining: 15 },
      llm_tokens: { allowed: true, currentUsage: 25000, limit: 50000, remaining: 25000 },
      images: { allowed: true, currentUsage: 5, limit: 10, remaining: 5 },
      api_calls: { allowed: true, currentUsage: 0, limit: 0, remaining: 0 },
    };

    vi.mocked(usageApi.getQuota).mockResolvedValue(mockQuota);

    const store = useUsageStore();
    await store.fetchQuota();

    expect(store.hasWarning).toBe(true);
    expect(store.hasExceeded).toBe(false);
  });

  it('should detect exceeded state when quota is full', async () => {
    const mockQuota = {
      messages: { allowed: false, currentUsage: 100, limit: 100, remaining: 0 },
      llm_tokens: { allowed: true, currentUsage: 25000, limit: 50000, remaining: 25000 },
      images: { allowed: true, currentUsage: 5, limit: 10, remaining: 5 },
      api_calls: { allowed: true, currentUsage: 0, limit: 0, remaining: 0 },
    };

    vi.mocked(usageApi.getQuota).mockResolvedValue(mockQuota);

    const store = useUsageStore();
    await store.fetchQuota();

    expect(store.hasExceeded).toBe(true);
  });

  it('should handle fetch errors', async () => {
    const error = new Error('Network error');
    vi.mocked(usageApi.getQuota).mockRejectedValue(error);

    const store = useUsageStore();

    await expect(store.fetchQuota()).rejects.toThrow('Network error');
    expect(store.error).toBe('Network error');
    expect(store.loading).toBe(false);
  });

  it('should refresh both stats and quota', async () => {
    const mockStats = {
      period: '2026-02',
      byResource: [
        { resourceType: 'messages', amount: 50 },
        { resourceType: 'llm_tokens', amount: 25000 },
      ],
      total: 25050,
    };

    const mockQuota = {
      messages: { allowed: true, currentUsage: 50, limit: 100, remaining: 50 },
      llm_tokens: { allowed: true, currentUsage: 25000, limit: 50000, remaining: 25000 },
      images: { allowed: true, currentUsage: 5, limit: 10, remaining: 5 },
      api_calls: { allowed: true, currentUsage: 0, limit: 0, remaining: 0 },
    };

    vi.mocked(usageApi.getStats).mockResolvedValue(mockStats);
    vi.mocked(usageApi.getQuota).mockResolvedValue(mockQuota);

    const store = useUsageStore();
    await store.refresh();

    expect(store.stats).toEqual(mockStats);
    expect(store.quota).toEqual(mockQuota);
  });
});
