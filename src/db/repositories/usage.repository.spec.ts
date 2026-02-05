import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageRepository } from './usage.repository';

describe('UsageRepository', () => {
  let repository: UsageRepository;
  let mockDb: any;

  beforeEach(() => {
    // Create a mock database with chainable methods
    const createChainableMock = () => {
      const mock: any = {
        select: vi.fn(() => mock),
        from: vi.fn(() => mock),
        where: vi.fn(() => mock),
        insert: vi.fn(() => mock),
        values: vi.fn(() => mock),
        returning: vi.fn().mockResolvedValue([]),
        groupBy: vi.fn(() => mock),
        orderBy: vi.fn().mockResolvedValue([]),
      };
      return mock;
    };

    mockDb = createChainableMock();
    repository = new UsageRepository(mockDb);
    vi.clearAllMocks();
  });

  describe('record', () => {
    it('should record usage with metadata', async () => {
      const mockUsage = {
        id: 'usage_123',
        tenantId: 'tenant_123',
        resourceType: 'llm_tokens' as const,
        amount: 1000,
        period: '2024-01',
        metadata: { model: 'gpt-4', endpoint: '/chat' },
        createdAt: new Date('2024-01-15'),
      };

      mockDb.returning.mockResolvedValue([mockUsage]);

      const result = await repository.record(
        'tenant_123',
        'llm_tokens',
        1000,
        { model: 'gpt-4', endpoint: '/chat' }
      );

      expect(result).toEqual(mockUsage);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should record usage without metadata', async () => {
      const mockUsage = {
        id: 'usage_124',
        tenantId: 'tenant_123',
        resourceType: 'messages' as const,
        amount: 1,
        period: '2024-01',
        metadata: {},
        createdAt: new Date('2024-01-15'),
      };

      mockDb.returning.mockResolvedValue([mockUsage]);

      const result = await repository.record('tenant_123', 'messages', 1);

      expect(result).toEqual(mockUsage);
      expect(result.metadata).toEqual({});
    });

    it('should generate correct period format (YYYY-MM)', async () => {
      const currentPeriod = new Date().toISOString().slice(0, 7);
      const mockUsage = {
        id: 'usage_125',
        tenantId: 'tenant_123',
        resourceType: 'api_calls' as const,
        amount: 1,
        period: currentPeriod,
        metadata: {},
        createdAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([mockUsage]);

      const result = await repository.record('tenant_123', 'api_calls', 1);

      expect(result.period).toBe(currentPeriod);
    });

    it('should handle database errors during recording', async () => {
      mockDb.returning.mockRejectedValue(new Error('Database error'));

      await expect(
        repository.record('tenant_123', 'llm_tokens', 1000)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getUsage', () => {
    it('should return usage for specific resource type and period', async () => {
      mockDb.where.mockResolvedValue([{ total: '5000' }]);

      const result = await repository.getUsage('tenant_123', 'llm_tokens', '2024-01');

      expect(result).toBe(5000);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return 0 when no usage found', async () => {
      mockDb.where.mockResolvedValue([{ total: null }]);

      const result = await repository.getUsage('tenant_123', 'llm_tokens', '2024-01');

      expect(result).toBe(0);
    });

    it('should return 0 when result is empty', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.getUsage('tenant_123', 'llm_tokens', '2024-01');

      expect(result).toBe(0);
    });

    it('should handle different resource types', async () => {
      mockDb.where.mockResolvedValue([{ total: '100' }]);

      const result = await repository.getUsage('tenant_123', 'messages', '2024-01');

      expect(result).toBe(100);
    });
  });

  describe('getTotalUsage', () => {
    it('should return total usage across all resource types', async () => {
      mockDb.where.mockResolvedValue([{ total: '10000' }]);

      const result = await repository.getTotalUsage('tenant_123', '2024-01');

      expect(result).toBe(10000);
    });

    it('should return 0 when no usage found', async () => {
      mockDb.where.mockResolvedValue([{ total: null }]);

      const result = await repository.getTotalUsage('tenant_123', '2024-01');

      expect(result).toBe(0);
    });
  });

  describe('getUsageByPeriod', () => {
    it('should return usage grouped by resource type', async () => {
      mockDb.groupBy.mockResolvedValue([
        { resourceType: 'llm_tokens', total: '5000' },
        { resourceType: 'messages', total: '100' },
        { resourceType: 'api_calls', total: '50' },
      ]);

      const result = await repository.getUsageByPeriod('tenant_123', '2024-01');

      expect(result).toEqual([
        { resourceType: 'llm_tokens', total: 5000 },
        { resourceType: 'messages', total: 100 },
        { resourceType: 'api_calls', total: 50 },
      ]);
    });

    it('should return empty array when no usage found', async () => {
      mockDb.groupBy.mockResolvedValue([]);

      const result = await repository.getUsageByPeriod('tenant_123', '2024-01');

      expect(result).toEqual([]);
    });

    it('should handle null totals', async () => {
      mockDb.groupBy.mockResolvedValue([
        { resourceType: 'llm_tokens', total: null },
      ]);

      const result = await repository.getUsageByPeriod('tenant_123', '2024-01');

      expect(result).toEqual([
        { resourceType: 'llm_tokens', total: 0 },
      ]);
    });
  });

  describe('findByTenantAndPeriod', () => {
    it('should return usage records for tenant and period', async () => {
      const mockRecords = [
        {
          id: 'usage_1',
          tenantId: 'tenant_123',
          resourceType: 'llm_tokens',
          amount: 1000,
          period: '2024-01',
          metadata: {},
          createdAt: new Date('2024-01-15'),
        },
        {
          id: 'usage_2',
          tenantId: 'tenant_123',
          resourceType: 'messages',
          amount: 10,
          period: '2024-01',
          metadata: {},
          createdAt: new Date('2024-01-16'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockRecords);

      const result = await repository.findByTenantAndPeriod('tenant_123', '2024-01');

      expect(result).toEqual(mockRecords);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no records found', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await repository.findByTenantAndPeriod('tenant_123', '2024-01');

      expect(result).toEqual([]);
    });
  });
});
