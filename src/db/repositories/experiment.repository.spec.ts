/**
 * ExperimentRepository Unit Tests
 *
 * Uses mocked database. Follows the same pattern as plugin.repository.spec.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Database } from '../index';
import { ExperimentRepository } from './experiment.repository';

const now = new Date('2026-02-15T00:00:00Z');

const mockExperiment = {
  id: 'exp-uuid-1',
  tenantId: 'tenant-uuid-1',
  name: 'Button Color Test',
  description: 'Testing button color variants',
  status: 'draft' as const,
  variants: [
    { name: 'control', weight: 50, config: { color: 'blue' } },
    { name: 'variant_a', weight: 50, config: { color: 'green' } },
  ],
  startedAt: null,
  endedAt: null,
  createdAt: now,
  updatedAt: now,
};

/**
 * Build a chainable query-builder mock.
 */
function createChainMock(resolvedValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;

  chain.select = vi.fn().mockReturnValue(self());
  chain.from = vi.fn().mockReturnValue(self());
  chain.where = vi.fn().mockReturnValue(self());
  chain.orderBy = vi.fn().mockReturnValue(self());
  chain.limit = vi.fn().mockReturnValue(self());
  chain.insert = vi.fn().mockReturnValue(self());
  chain.values = vi.fn().mockReturnValue(self());
  chain.returning = vi.fn().mockResolvedValue(resolvedValue);
  chain.update = vi.fn().mockReturnValue(self());
  chain.set = vi.fn().mockReturnValue(self());

  // Make the chain itself thenable so `await chain` resolves to resolvedValue
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));

  return chain;
}

describe('ExperimentRepository', () => {
  let repository: ExperimentRepository;
  let mockDb: Record<string, unknown>;

  beforeEach(() => {
    mockDb = {};
    repository = new ExperimentRepository(mockDb as unknown as Database);
  });

  describe('create', () => {
    it('should insert experiment and return record', async () => {
      const chain = createChainMock([mockExperiment]);
      mockDb.insert = chain.insert;

      const input = {
        tenantId: 'tenant-uuid-1',
        name: 'Button Color Test',
        description: 'Testing button color variants',
        variants: [
          { name: 'control', weight: 50, config: { color: 'blue' } },
          { name: 'variant_a', weight: 50, config: { color: 'green' } },
        ],
      };

      const result = await repository.create(input);

      expect(chain.insert).toHaveBeenCalled();
      expect(chain.values).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(mockExperiment);
    });
  });

  describe('findById', () => {
    it('should return experiment by id', async () => {
      const chain = createChainMock([mockExperiment]);
      mockDb.select = chain.select;

      const result = await repository.findById('exp-uuid-1');

      expect(result).toEqual(mockExperiment);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent id', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return experiments for a tenant', async () => {
      const experimentsList = [
        { ...mockExperiment, id: 'exp-1' },
        { ...mockExperiment, id: 'exp-2' },
      ];
      const chain = createChainMock(experimentsList);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(experimentsList));
      mockDb.select = chain.select;

      const result = await repository.findByTenant('tenant-uuid-1');

      expect(result).toEqual(experimentsList);
      expect(result).toHaveLength(2);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
    });

    it('should return empty array when no experiments exist', async () => {
      const chain = createChainMock([]);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
      mockDb.select = chain.select;

      const result = await repository.findByTenant('tenant-uuid-1');

      expect(result).toEqual([]);
    });
  });

  describe('findActive', () => {
    it('should return experiments with running status', async () => {
      const runningExperiment = { ...mockExperiment, status: 'running' as const };
      const chain = createChainMock([runningExperiment]);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([runningExperiment]));
      mockDb.select = chain.select;

      const result = await repository.findActive();

      expect(result).toEqual([runningExperiment]);
      expect(result[0].status).toBe('running');
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
    });

    it('should return empty array when no active experiments', async () => {
      const chain = createChainMock([]);
      chain.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
      mockDb.select = chain.select;

      const result = await repository.findActive();

      expect(result).toEqual([]);
    });
  });

  describe('findByName', () => {
    it('should return experiment by name', async () => {
      const chain = createChainMock([mockExperiment]);
      mockDb.select = chain.select;

      const result = await repository.findByName('Button Color Test');

      expect(result).toEqual(mockExperiment);
      expect(chain.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('should return null for non-existent name', async () => {
      const chain = createChainMock([]);
      mockDb.select = chain.select;

      const result = await repository.findByName('Nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update experiment and return updated record', async () => {
      const updatedExperiment = {
        ...mockExperiment,
        status: 'running' as const,
        startedAt: new Date('2026-02-15T01:00:00Z'),
        updatedAt: new Date('2026-02-15T01:00:00Z'),
      };
      const chain = createChainMock([updatedExperiment]);
      mockDb.update = chain.update;

      const result = await repository.update('exp-uuid-1', {
        status: 'running',
        startedAt: new Date('2026-02-15T01:00:00Z'),
      });

      expect(chain.update).toHaveBeenCalled();
      expect(chain.set).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.returning).toHaveBeenCalled();
      expect(result).toEqual(updatedExperiment);
      expect(result.status).toBe('running');
    });
  });
});