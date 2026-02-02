import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionRepository } from './subscription.repository';
import type { NewSubscription } from '../schema/subscriptions';

vi.mock('../index', () => ({
  db: {},
}));

describe('SubscriptionRepository', () => {
  let repository: SubscriptionRepository;

  beforeEach(() => {
    repository = new SubscriptionRepository({} as any);
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should return subscription when found', async () => {
      const mockSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockSubscription]),
          }),
        }),
      });

      const result = await repository.findById('sub_123');

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when subscription not found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.findById('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('findByTenantId', () => {
    it('should return subscription for tenant', async () => {
      const mockSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockSubscription]),
          }),
        }),
      });

      const result = await repository.findByTenantId('tenant_123');

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when no subscription for tenant', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.findByTenantId('tenant_no_sub');

      expect(result).toBeNull();
    });
  });

  describe('findByStripeCustomerId', () => {
    it('should return subscription by Stripe customer ID', async () => {
      const mockSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockSubscription]),
          }),
        }),
      });

      const result = await repository.findByStripeCustomerId('cus_123');

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when customer not found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.findByStripeCustomerId('cus_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByStripeSubscriptionId', () => {
    it('should return subscription by Stripe subscription ID', async () => {
      const mockSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockSubscription]),
          }),
        }),
      });

      const result = await repository.findByStripeSubscriptionId('sub_stripe_123');

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when subscription not found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.findByStripeSubscriptionId('sub_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and return new subscription', async () => {
      const newSubscription: NewSubscription = {
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
      };

      const createdSubscription = {
        id: 'sub_123',
        ...newSubscription,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([createdSubscription]),
          }),
        }),
      });

      const result = await repository.create(newSubscription);

      expect(result).toEqual(createdSubscription);
    });

    it('should handle database errors during creation', async () => {
      const newSubscription: NewSubscription = {
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('Database error')),
          }),
        }),
      });

      await expect(repository.create(newSubscription)).rejects.toThrow('Database error');
    });
  });

  describe('update', () => {
    it('should update subscription by ID', async () => {
      const updateData: Partial<NewSubscription> = {
        status: 'canceled',
        cancelAtPeriodEnd: true,
      };

      const updatedSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'canceled',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedSubscription]),
            }),
          }),
        }),
      });

      const result = await repository.update('sub_123', updateData);

      expect(result).toEqual(updatedSubscription);
    });

    it('should return null when subscription not found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await repository.update('non_existent', { status: 'canceled' });

      expect(result).toBeNull();
    });
  });

  describe('updateByTenantId', () => {
    it('should update subscription by tenant ID', async () => {
      const updateData: Partial<NewSubscription> = {
        plan: 'team',
      };

      const updatedSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'team',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedSubscription]),
            }),
          }),
        }),
      });

      const result = await repository.updateByTenantId('tenant_123', updateData);

      expect(result).toEqual(updatedSubscription);
    });

    it('should return null when tenant has no subscription', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await repository.updateByTenantId('tenant_no_sub', { plan: 'pro' });

      expect(result).toBeNull();
    });
  });

  describe('updateByStripeSubscriptionId', () => {
    it('should update subscription by Stripe subscription ID', async () => {
      const updateData: Partial<NewSubscription> = {
        status: 'past_due',
      };

      const updatedSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'pro',
        status: 'past_due',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      vi.spyOn(repository as any, 'db').mockReturnValue({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedSubscription]),
            }),
          }),
        }),
      });

      const result = await repository.updateByStripeSubscriptionId('sub_stripe_123', updateData);

      expect(result).toEqual(updatedSubscription);
    });

    it('should return null when Stripe subscription not found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const result = await repository.updateByStripeSubscriptionId('sub_nonexistent', { status: 'canceled' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete subscription and return true', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'sub_123' }]),
          }),
        }),
      });

      const result = await repository.delete('sub_123');

      expect(result).toBe(true);
    });

    it('should return false when subscription not found', async () => {
      vi.spyOn(repository as any, 'db').mockReturnValue({
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await repository.delete('non_existent');

      expect(result).toBe(false);
    });
  });
});
