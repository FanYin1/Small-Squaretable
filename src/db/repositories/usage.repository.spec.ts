import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageRepository } from './usage.repository';

// Mock the actual database operations by mocking the repository methods directly
vi.mock('../index', () => ({
  db: {},
}));

describe('UsageRepository', () => {
  let repository: UsageRepository;

  beforeEach(() => {
    repository = new UsageRepository({} as any);
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

      vi.spyOn(repository as any, 'db').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      });

      const result = await repository.record(
        'tenant_123',
        'llm_tokens',
        1000,
        { model: 'gpt-4', endpoint: '/chat' }
      );

      expect(result).toEqual(mockUsage);
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

      vi.spyOn(repository as any, 'db').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      });

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

      vi.spyOn(repository as any, 'db').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUsage]),
          }),
        }),
      });

      const result = await repository.record('tenant_123', 'api_calls', 1);

      expect(result.period).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should handle database errors during recording', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('Database error')),
          }),
        }),
      });

      await expect(
        repository.record('tenant_123', 'images', 1)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getUsage', () => {
    it('should return usage for specific resource type and period', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: '5000' }]),
          }),
        }),
      });

      const result = await repository.getUsage('tenant_123', 'llm_tokens', '2024-01');

      expect(result).toBe(5000);
    });

    it('should return 0 when no usage found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: null }]),
          }),
        }),
      });

      const result = await repository.getUsage('tenant_123', 'messages', '2024-01');

      expect(result).toBe(0);
    });

    it('should return 0 when result is empty', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.getUsage('tenant_123', 'images', '2024-01');

      expect(result).toBe(0);
    });

    it('should handle different resource types', async () => {
      const resourceTypes: Array<'llm_tokens' | 'messages' | 'images' | 'api_calls'> = [
        'llm_tokens',
        'messages',
        'images',
        'api_calls',
      ];

      for (const resourceType of resourceTypes) {
        vi.spyOn(repository as any, 'db').mockReturnValue({
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ total: '100' }]),
            }),
          }),
        });

        const result = await repository.getUsage('tenant_123', resourceType, '2024-01');
        expect(result).toBe(100);
      }
    });
  });

  describe('getTotalUsage', () => {
    it('should return total usage across all resource types', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: '10000' }]),
          }),
        }),
      });

      const result = await repository.getTotalUsage('tenant_123', '2024-01');

      expect(result).toBe(10000);
    });

    it('should return 0 when no usage found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: null }]),
          }),
        }),
      });

      const result = await repository.getTotalUsage('tenant_123', '2024-01');

      expect(result).toBe(0);
    });
  });

  describe('getUsageByPeriod', () => {
    it('should return usage grouped by resource type', async () => {
      const mockResult = [
        { resourceType: 'llm_tokens', total: '5000' },
        { resourceType: 'messages', total: '100' },
        { resourceType: 'images', total: '10' },
        { resourceType: 'api_calls', total: '500' },
      ];

      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(mockResult),
            }),
          }),
        }),
      });

      const result = await repository.getUsageByPeriod('tenant_123', '2024-01');

      expect(result).toEqual([
        { resourceType: 'llm_tokens', total: 5000 },
        { resourceType: 'messages', total: 100 },
        { resourceType: 'images', total: 10 },
        { resourceType: 'api_calls', total: 500 },
      ]);
    });

    it('should return empty array when no usage found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await repository.getUsageByPeriod('tenant_123', '2024-01');

      expect(result).toEqual([]);
    });

    it('should handle null totals', async () => {
      const mockResult = [
        { resourceType: 'llm_tokens', total: null },
        { resourceType: 'messages', total: '50' },
      ];

      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(mockResult),
            }),
          }),
        }),
      });

      const result = await repository.getUsageByPeriod('tenant_123', '2024-01');

      expect(result).toEqual([
        { resourceType: 'llm_tokens', total: 0 },
        { resourceType: 'messages', total: 50 },
      ]);
    });
  });

  describe('findByTenantAndPeriod', () => {
    it('should return usage records for tenant and period', async () => {
      const mockRecords = [
        {
          id: 'usage_1',
          tenantId: 'tenant_123',
          resourceType: 'llm_tokens' as const,
          amount: 1000,
          period: '2024-01',
          metadata: {},
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'usage_2',
          tenantId: 'tenant_123',
          resourceType: 'messages' as const,
          amount: 5,
          period: '2024-01',
          metadata: {},
          createdAt: new Date('2024-01-15T11:00:00Z'),
        },
      ];

      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(mockRecords),
            }),
          }),
        }),
      });

      const result = await repository.findByTenantAndPeriod('tenant_123', '2024-01');

      expect(result).toEqual(mockRecords);
    });

    it('should return empty array when no records found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await repository.findByTenantAndPeriod('tenant_123', '2024-01');

      expect(result).toEqual([]);
    });
  });
});
