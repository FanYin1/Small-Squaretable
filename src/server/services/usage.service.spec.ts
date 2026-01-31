/**
 * Usage Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageService } from './usage.service';
import { usageRepository } from '../../db/repositories/usage.repository';

vi.mock('../../db/repositories/usage.repository');

describe('UsageService', () => {
  let service: UsageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsageService();
  });

  describe('trackUsage', () => {
    it('should track usage successfully', async () => {
      const mockUsage = {
        id: '1',
        tenantId: 'tenant-1',
        resourceType: 'messages' as const,
        amount: 10,
        period: '2026-02',
        metadata: { chatId: 'chat-1' },
        createdAt: new Date(),
      };

      vi.mocked(usageRepository.record).mockResolvedValue(mockUsage);

      const result = await service.trackUsage('tenant-1', 'messages', 10, { chatId: 'chat-1' });

      expect(result).toEqual(mockUsage);
      expect(usageRepository.record).toHaveBeenCalledWith('tenant-1', 'messages', 10, {
        chatId: 'chat-1',
      });
    });

    it('should track usage without metadata', async () => {
      const mockUsage = {
        id: '1',
        tenantId: 'tenant-1',
        resourceType: 'llm_tokens' as const,
        amount: 1000,
        period: '2026-02',
        metadata: {},
        createdAt: new Date(),
      };

      vi.mocked(usageRepository.record).mockResolvedValue(mockUsage);

      const result = await service.trackUsage('tenant-1', 'llm_tokens', 1000);

      expect(result).toEqual(mockUsage);
      expect(usageRepository.record).toHaveBeenCalledWith('tenant-1', 'llm_tokens', 1000, undefined);
    });

    it('should track different resource types', async () => {
      const resourceTypes = ['llm_tokens', 'messages', 'images', 'api_calls'] as const;

      for (const resourceType of resourceTypes) {
        const mockUsage = {
          id: '1',
          tenantId: 'tenant-1',
          resourceType,
          amount: 5,
          period: '2026-02',
          metadata: {},
          createdAt: new Date(),
        };

        vi.mocked(usageRepository.record).mockResolvedValue(mockUsage);

        const result = await service.trackUsage('tenant-1', resourceType, 5);

        expect(result.resourceType).toBe(resourceType);
      }
    });
  });

  describe('getUsageStats', () => {
    it('should return usage stats for current period', async () => {
      const mockByResource = [
        { resourceType: 'messages', total: 50 },
        { resourceType: 'llm_tokens', total: 10000 },
        { resourceType: 'images', total: 5 },
      ];

      vi.mocked(usageRepository.getUsageByPeriod).mockResolvedValue(mockByResource);

      const result = await service.getUsageStats('tenant-1');

      expect(result.period).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM format
      expect(result.byResource).toEqual([
        { resourceType: 'messages', amount: 50 },
        { resourceType: 'llm_tokens', amount: 10000 },
        { resourceType: 'images', amount: 5 },
      ]);
      expect(result.total).toBe(10055);
    });

    it('should return usage stats for specific period', async () => {
      const mockByResource = [
        { resourceType: 'messages', total: 100 },
        { resourceType: 'api_calls', total: 20 },
      ];

      vi.mocked(usageRepository.getUsageByPeriod).mockResolvedValue(mockByResource);

      const result = await service.getUsageStats('tenant-1', '2026-01');

      expect(result.period).toBe('2026-01');
      expect(result.byResource).toEqual([
        { resourceType: 'messages', amount: 100 },
        { resourceType: 'api_calls', amount: 20 },
      ]);
      expect(result.total).toBe(120);
      expect(usageRepository.getUsageByPeriod).toHaveBeenCalledWith('tenant-1', '2026-01');
    });

    it('should return zero total when no usage', async () => {
      vi.mocked(usageRepository.getUsageByPeriod).mockResolvedValue([]);

      const result = await service.getUsageStats('tenant-1', '2026-02');

      expect(result.byResource).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should calculate total correctly with multiple resources', async () => {
      const mockByResource = [
        { resourceType: 'messages', total: 1000 },
        { resourceType: 'llm_tokens', total: 500000 },
        { resourceType: 'images', total: 50 },
        { resourceType: 'api_calls', total: 100 },
      ];

      vi.mocked(usageRepository.getUsageByPeriod).mockResolvedValue(mockByResource);

      const result = await service.getUsageStats('tenant-1');

      expect(result.total).toBe(501150);
    });
  });

  describe('checkQuota', () => {
    it('should return current usage for messages', async () => {
      vi.mocked(usageRepository.getUsage).mockResolvedValue(75);

      const result = await service.checkQuota('tenant-1', 'messages');

      expect(result.resourceType).toBe('messages');
      expect(result.currentUsage).toBe(75);
      expect(result.period).toMatch(/^\d{4}-\d{2}$/);
      expect(usageRepository.getUsage).toHaveBeenCalledWith(
        'tenant-1',
        'messages',
        expect.stringMatching(/^\d{4}-\d{2}$/)
      );
    });

    it('should return current usage for llm_tokens', async () => {
      vi.mocked(usageRepository.getUsage).mockResolvedValue(25000);

      const result = await service.checkQuota('tenant-1', 'llm_tokens');

      expect(result.resourceType).toBe('llm_tokens');
      expect(result.currentUsage).toBe(25000);
    });

    it('should return current usage for images', async () => {
      vi.mocked(usageRepository.getUsage).mockResolvedValue(8);

      const result = await service.checkQuota('tenant-1', 'images');

      expect(result.resourceType).toBe('images');
      expect(result.currentUsage).toBe(8);
    });

    it('should return current usage for api_calls', async () => {
      vi.mocked(usageRepository.getUsage).mockResolvedValue(500);

      const result = await service.checkQuota('tenant-1', 'api_calls');

      expect(result.resourceType).toBe('api_calls');
      expect(result.currentUsage).toBe(500);
    });

    it('should return zero when no usage recorded', async () => {
      vi.mocked(usageRepository.getUsage).mockResolvedValue(0);

      const result = await service.checkQuota('tenant-1', 'messages');

      expect(result.currentUsage).toBe(0);
    });

    it('should use current period by default', async () => {
      const currentPeriod = new Date().toISOString().slice(0, 7);
      vi.mocked(usageRepository.getUsage).mockResolvedValue(50);

      const result = await service.checkQuota('tenant-1', 'messages');

      expect(result.period).toBe(currentPeriod);
      expect(usageRepository.getUsage).toHaveBeenCalledWith('tenant-1', 'messages', currentPeriod);
    });
  });
});
