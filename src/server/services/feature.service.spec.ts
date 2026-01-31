/**
 * Feature Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { featureService } from './feature.service';
import { subscriptionRepository } from '../../db/repositories/subscription.repository';
import { usageService } from './usage.service';

vi.mock('../../db/repositories/subscription.repository');
vi.mock('./usage.service');

describe('FeatureService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasFeature', () => {
    it('should return true for free plan basic features', () => {
      expect(featureService.hasFeature('free', 'basic_chat')).toBe(true);
      expect(featureService.hasFeature('free', 'community_browse')).toBe(true);
    });

    it('should return false for free plan premium features', () => {
      expect(featureService.hasFeature('free', 'character_share')).toBe(false);
      expect(featureService.hasFeature('free', 'advanced_models')).toBe(false);
      expect(featureService.hasFeature('free', 'team_collaboration')).toBe(false);
    });

    it('should return true for pro plan features', () => {
      expect(featureService.hasFeature('pro', 'basic_chat')).toBe(true);
      expect(featureService.hasFeature('pro', 'character_share')).toBe(true);
      expect(featureService.hasFeature('pro', 'advanced_models')).toBe(true);
      expect(featureService.hasFeature('pro', 'priority_support')).toBe(true);
    });

    it('should return false for pro plan team features', () => {
      expect(featureService.hasFeature('pro', 'team_collaboration')).toBe(false);
      expect(featureService.hasFeature('pro', 'api_access')).toBe(false);
      expect(featureService.hasFeature('pro', 'custom_domain')).toBe(false);
    });

    it('should return true for team plan all features', () => {
      expect(featureService.hasFeature('team', 'basic_chat')).toBe(true);
      expect(featureService.hasFeature('team', 'character_share')).toBe(true);
      expect(featureService.hasFeature('team', 'team_collaboration')).toBe(true);
      expect(featureService.hasFeature('team', 'api_access')).toBe(true);
      expect(featureService.hasFeature('team', 'custom_domain')).toBe(true);
    });
  });

  describe('getPlanFeatures', () => {
    it('should return correct features for free plan', () => {
      const features = featureService.getPlanFeatures('free');
      expect(features).toEqual(['basic_chat', 'community_browse']);
    });

    it('should return correct features for pro plan', () => {
      const features = featureService.getPlanFeatures('pro');
      expect(features).toContain('basic_chat');
      expect(features).toContain('character_share');
      expect(features).toContain('advanced_models');
      expect(features).not.toContain('team_collaboration');
    });

    it('should return correct features for team plan', () => {
      const features = featureService.getPlanFeatures('team');
      expect(features).toContain('basic_chat');
      expect(features).toContain('team_collaboration');
      expect(features).toContain('api_access');
    });
  });

  describe('getPlanLimits', () => {
    it('should return correct limits for free plan', () => {
      const limits = featureService.getPlanLimits('free');
      expect(limits.messages).toBe(100);
      expect(limits.llm_tokens).toBe(50000);
      expect(limits.images).toBe(10);
      expect(limits.api_calls).toBe(0);
    });

    it('should return correct limits for pro plan', () => {
      const limits = featureService.getPlanLimits('pro');
      expect(limits.messages).toBe(10000);
      expect(limits.llm_tokens).toBe(1000000);
      expect(limits.images).toBe(500);
      expect(limits.api_calls).toBe(1000);
    });

    it('should return correct limits for team plan', () => {
      const limits = featureService.getPlanLimits('team');
      expect(limits.messages).toBe(100000);
      expect(limits.llm_tokens).toBe(10000000);
      expect(limits.images).toBe(5000);
      expect(limits.api_calls).toBe(10000);
    });
  });

  describe('checkQuota', () => {
    it('should return allowed true when usage is below limit', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free',
        status: 'active',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(usageService.checkQuota).mockResolvedValue({
        resourceType: 'messages',
        currentUsage: 50,
        period: '2026-02',
      });

      const result = await featureService.checkQuota('tenant-1', 'messages');

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(50);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(50);
    });

    it('should return allowed false when usage exceeds limit', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free',
        status: 'active',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(usageService.checkQuota).mockResolvedValue({
        resourceType: 'messages',
        currentUsage: 150,
        period: '2026-02',
      });

      const result = await featureService.checkQuota('tenant-1', 'messages');

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(150);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(0);
    });

    it('should use free plan limits when subscription not found', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);

      vi.mocked(usageService.checkQuota).mockResolvedValue({
        resourceType: 'messages',
        currentUsage: 50,
        period: '2026-02',
      });

      const result = await featureService.checkQuota('tenant-1', 'messages');

      expect(result.limit).toBe(100); // Free plan limit
    });
  });

  describe('checkTenantFeature', () => {
    it('should return true when tenant has feature', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'pro',
        status: 'active',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await featureService.checkTenantFeature('tenant-1', 'character_share');

      expect(result).toBe(true);
    });

    it('should return false when tenant does not have feature', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue({
        id: '1',
        tenantId: 'tenant-1',
        plan: 'free',
        status: 'active',
        cancelAtPeriodEnd: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await featureService.checkTenantFeature('tenant-1', 'character_share');

      expect(result).toBe(false);
    });

    it('should use free plan when subscription not found', async () => {
      vi.mocked(subscriptionRepository.findByTenantId).mockResolvedValue(null);

      const result = await featureService.checkTenantFeature('tenant-1', 'advanced_models');

      expect(result).toBe(false);
    });
  });
});
