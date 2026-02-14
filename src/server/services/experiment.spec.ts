import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mock functions ---

const {
  mockRedisGet,
  mockRedisSet,
  mockFindByName,
  mockFindActive,
} = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockFindByName: vi.fn(),
  mockFindActive: vi.fn(),
}));

vi.mock('../../core/redis', () => ({
  getRedisClient: vi.fn().mockResolvedValue({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

vi.mock('../../db/repositories/experiment.repository', () => ({
  experimentRepository: {
    findByName: (...args: unknown[]) => mockFindByName(...args),
    findActive: (...args: unknown[]) => mockFindActive(...args),
  },
}));

import { ExperimentService } from './experiment.service';
import type { Experiment } from '../../db/schema/experiments';

// --- Helper to build an experiment fixture ---

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp-1',
    tenantId: 'tenant-1',
    name: 'homepage-algo',
    description: null,
    status: 'running',
    variants: [
      { name: 'control', weight: 50, config: { algo: 'trending' } },
      { name: 'treatment', weight: 50, config: { algo: 'personalized' } },
    ],
    startedAt: null,
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ExperimentService', () => {
  let service: ExperimentService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockFindByName.mockResolvedValue(null);
    mockFindActive.mockResolvedValue([]);
    service = new ExperimentService();
  });

  // ── assignVariant ──

  describe('assignVariant', () => {
    it('should be deterministic — same user+experiment always returns same variant', () => {
      const experiment = makeExperiment();
      const v1 = service.assignVariant('user-1', experiment);
      const v2 = service.assignVariant('user-1', experiment);
      const v3 = service.assignVariant('user-1', experiment);
      expect(v1).toBe(v2);
      expect(v2).toBe(v3);
    });

    it('should return a valid variant name', () => {
      const experiment = makeExperiment();
      const variant = service.assignVariant('user-1', experiment);
      const validNames = experiment.variants.map((v) => v.name);
      expect(validNames).toContain(variant);
    });

    it('should distribute across variants for different users', () => {
      const experiment = makeExperiment();
      const assignments = new Set<string>();
      // With 50/50 weights and enough users, both variants should appear
      for (let i = 0; i < 100; i++) {
        assignments.add(service.assignVariant(`user-${i}`, experiment));
      }
      expect(assignments.size).toBe(2);
      expect(assignments.has('control')).toBe(true);
      expect(assignments.has('treatment')).toBe(true);
    });

    it('should respect weights — heavily weighted variant gets most assignments', () => {
      const experiment = makeExperiment({
        variants: [
          { name: 'control', weight: 95, config: {} },
          { name: 'treatment', weight: 5, config: {} },
        ],
      });
      let controlCount = 0;
      for (let i = 0; i < 200; i++) {
        if (service.assignVariant(`user-${i}`, experiment) === 'control') {
          controlCount++;
        }
      }
      // Control should get the majority
      expect(controlCount).toBeGreaterThan(100);
    });
  });

  // ── getVariantConfig ──

  describe('getVariantConfig', () => {
    it('should return cached result when available', async () => {
      const cached = JSON.stringify({ variant: 'control', algo: 'trending' });
      mockRedisGet.mockResolvedValue(cached);

      const result = await service.getVariantConfig('user-1', 'homepage-algo');

      expect(result).toEqual({ variant: 'control', algo: 'trending' });
      expect(mockFindByName).not.toHaveBeenCalled();
    });

    it('should return null for non-existent experiment', async () => {
      mockFindByName.mockResolvedValue(null);

      const result = await service.getVariantConfig('user-1', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null for non-running experiment', async () => {
      mockFindByName.mockResolvedValue(makeExperiment({ status: 'draft' }));

      const result = await service.getVariantConfig('user-1', 'homepage-algo');

      expect(result).toBeNull();
    });

    it('should assign variant and cache for running experiment', async () => {
      const experiment = makeExperiment();
      mockFindByName.mockResolvedValue(experiment);

      const result = await service.getVariantConfig('user-1', 'homepage-algo');

      expect(result).not.toBeNull();
      expect(result!.variant).toBeDefined();
      // Should have cached with 1-hour TTL
      expect(mockRedisSet).toHaveBeenCalledWith(
        'exp:homepage-algo:user-1',
        expect.any(String),
        { EX: 3600 },
      );
    });

    it('should include variant config in result', async () => {
      const experiment = makeExperiment({
        variants: [
          { name: 'only', weight: 100, config: { algo: 'personalized', boost: 1.5 } },
        ],
      });
      mockFindByName.mockResolvedValue(experiment);

      const result = await service.getVariantConfig('user-1', 'homepage-algo');

      expect(result).toEqual({
        variant: 'only',
        algo: 'personalized',
        boost: 1.5,
      });
    });
  });

  // ── getActiveExperiments ──

  describe('getActiveExperiments', () => {
    it('should delegate to repository', async () => {
      const experiments = [makeExperiment(), makeExperiment({ id: 'exp-2', name: 'chat-model' })];
      mockFindActive.mockResolvedValue(experiments);

      const result = await service.getActiveExperiments();

      expect(mockFindActive).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result).toBe(experiments);
    });

    it('should return empty array when no active experiments', async () => {
      mockFindActive.mockResolvedValue([]);

      const result = await service.getActiveExperiments();

      expect(result).toEqual([]);
    });
  });
});
