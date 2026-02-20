import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';

const mockCurrentPlan = ref('free');

vi.mock('@client/stores', () => ({
  useSubscriptionStore: () => ({
    currentPlan: mockCurrentPlan.value,
  }),
}));

import { useFeatureGate } from './useFeatureGate';

describe('useFeatureGate', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockCurrentPlan.value = 'free';
  });

  describe('currentPlan', () => {
    it('reflects the store plan (free)', () => {
      const { currentPlan } = useFeatureGate();
      expect(currentPlan.value).toBe('free');
    });
  });

  describe('hasFeature', () => {
    it('free plan has basic_chat', () => {
      const { hasFeature } = useFeatureGate();
      expect(hasFeature('basic_chat')).toBe(true);
    });

    it('free plan does NOT have character_share', () => {
      const { hasFeature } = useFeatureGate();
      expect(hasFeature('character_share')).toBe(false);
    });

    it('pro plan has character_share', () => {
      mockCurrentPlan.value = 'pro';
      const { hasFeature } = useFeatureGate();
      expect(hasFeature('character_share')).toBe(true);
    });

    it('pro plan does NOT have api_access', () => {
      mockCurrentPlan.value = 'pro';
      const { hasFeature } = useFeatureGate();
      expect(hasFeature('api_access')).toBe(false);
    });

    it('team plan has api_access', () => {
      mockCurrentPlan.value = 'team';
      const { hasFeature } = useFeatureGate();
      expect(hasFeature('api_access')).toBe(true);
    });

    it('team plan has custom_domain', () => {
      mockCurrentPlan.value = 'team';
      const { hasFeature } = useFeatureGate();
      expect(hasFeature('custom_domain')).toBe(true);
    });
  });

  describe('getCurrentFeatures', () => {
    it('returns 2 features for free plan', () => {
      const { getCurrentFeatures } = useFeatureGate();
      const features = getCurrentFeatures();
      expect(features).toHaveLength(2);
      expect(features).toEqual(['basic_chat', 'community_browse']);
    });

    it('returns 8 features for team plan', () => {
      mockCurrentPlan.value = 'team';
      const { getCurrentFeatures } = useFeatureGate();
      const features = getCurrentFeatures();
      expect(features).toHaveLength(8);
      expect(features).toContain('team_collaboration');
      expect(features).toContain('custom_domain');
    });
  });

  describe('getCurrentLimits', () => {
    it('returns correct limits for free plan', () => {
      const { getCurrentLimits } = useFeatureGate();
      const limits = getCurrentLimits();
      expect(limits.messages).toBe(100);
      expect(limits.llm_tokens).toBe(50000);
      expect(limits.images).toBe(10);
      expect(limits.api_calls).toBe(0);
    });

    it('returns correct limits for pro plan', () => {
      mockCurrentPlan.value = 'pro';
      const { getCurrentLimits } = useFeatureGate();
      const limits = getCurrentLimits();
      expect(limits.messages).toBe(10000);
      expect(limits.llm_tokens).toBe(1000000);
      expect(limits.images).toBe(500);
      expect(limits.api_calls).toBe(1000);
    });
  });

  describe('getLimit', () => {
    it('returns specific resource limit', () => {
      mockCurrentPlan.value = 'team';
      const { getLimit } = useFeatureGate();
      expect(getLimit('messages')).toBe(100000);
      expect(getLimit('api_calls')).toBe(10000);
    });
  });

  describe('isPaidUser', () => {
    it('is false for free plan', () => {
      const { isPaidUser } = useFeatureGate();
      expect(isPaidUser.value).toBe(false);
    });

    it('is true for pro plan', () => {
      mockCurrentPlan.value = 'pro';
      const { isPaidUser } = useFeatureGate();
      expect(isPaidUser.value).toBe(true);
    });

    it('is true for team plan', () => {
      mockCurrentPlan.value = 'team';
      const { isPaidUser } = useFeatureGate();
      expect(isPaidUser.value).toBe(true);
    });
  });

  describe('isTeamUser', () => {
    it('is false for free plan', () => {
      const { isTeamUser } = useFeatureGate();
      expect(isTeamUser.value).toBe(false);
    });

    it('is false for pro plan', () => {
      mockCurrentPlan.value = 'pro';
      const { isTeamUser } = useFeatureGate();
      expect(isTeamUser.value).toBe(false);
    });

    it('is true for team plan', () => {
      mockCurrentPlan.value = 'team';
      const { isTeamUser } = useFeatureGate();
      expect(isTeamUser.value).toBe(true);
    });
  });

  describe('getUpgradeMessage', () => {
    it('free user gets upgrade to Pro or Team message', () => {
      const { getUpgradeMessage } = useFeatureGate();
      expect(getUpgradeMessage('api_access')).toBe(
        'Upgrade to Pro or Team to unlock this feature',
      );
    });

    it('pro user for team-only feature gets upgrade to Team message', () => {
      mockCurrentPlan.value = 'pro';
      const { getUpgradeMessage } = useFeatureGate();
      expect(getUpgradeMessage('api_access')).toBe(
        'Upgrade to Team to unlock this feature',
      );
    });

    it('pro user for feature they already have gets generic message', () => {
      mockCurrentPlan.value = 'pro';
      const { getUpgradeMessage } = useFeatureGate();
      expect(getUpgradeMessage('basic_chat')).toBe(
        'Upgrade to Team to unlock this feature',
      );
    });
  });
});