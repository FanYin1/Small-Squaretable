import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionRepository } from './subscription.repository';
import type { NewSubscription } from '../schema/subscriptions';

describe('SubscriptionRepository', () => {
  let repository: SubscriptionRepository;
  let mockDb: any;

  beforeEach(() => {
    // Create a mock database with chainable methods
    // Each method returns an object with the next method in the chain
    const createChainableMock = () => {
      const mock: any = {
        select: vi.fn(() => mock),
        from: vi.fn(() => mock),
        where: vi.fn(() => mock),
        insert: vi.fn(() => mock),
        values: vi.fn(() => mock),
        returning: vi.fn().mockResolvedValue([]),
        update: vi.fn(() => mock),
        set: vi.fn(() => mock),
        delete: vi.fn(() => mock),
      };
      return mock;
    };

    mockDb = createChainableMock();
    repository = new SubscriptionRepository(mockDb);
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

      mockDb.where.mockResolvedValue([mockSubscription]);

      const result = await repository.findById('sub_123');

      expect(result).toEqual(mockSubscription);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return null when subscription not found', async () => {
      mockDb.where.mockResolvedValue([]);

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

      mockDb.where.mockResolvedValue([mockSubscription]);

      const result = await repository.findByTenantId('tenant_123');

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when no subscription for tenant', async () => {
      mockDb.where.mockResolvedValue([]);

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

      mockDb.where.mockResolvedValue([mockSubscription]);

      const result = await repository.findByStripeCustomerId('cus_123');

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when customer not found', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.findByStripeCustomerId('cus_not_found');

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

      mockDb.where.mockResolvedValue([mockSubscription]);

      const result = await repository.findByStripeSubscriptionId('sub_stripe_123');

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when subscription not found', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.findByStripeSubscriptionId('sub_not_found');

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
        id: 'sub_new_123',
        ...newSubscription,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.returning.mockResolvedValue([createdSubscription]);

      const result = await repository.create(newSubscription);

      expect(result).toEqual(createdSubscription);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(newSubscription);
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

      mockDb.returning.mockRejectedValue(new Error('Database error'));

      await expect(repository.create(newSubscription)).rejects.toThrow('Database error');
    });
  });

  describe('update', () => {
    it('should update subscription by ID', async () => {
      const updatedSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'enterprise',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      };

      mockDb.returning.mockResolvedValue([updatedSubscription]);

      const result = await repository.update('sub_123', { plan: 'enterprise' });

      expect(result).toEqual(updatedSubscription);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should return null when subscription not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.update('non_existent', { plan: 'enterprise' });

      expect(result).toBeNull();
    });
  });

  describe('updateByTenantId', () => {
    it('should update subscription by tenant ID', async () => {
      const updatedSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'enterprise',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      };

      mockDb.returning.mockResolvedValue([updatedSubscription]);

      const result = await repository.updateByTenantId('tenant_123', { plan: 'enterprise' });

      expect(result).toEqual(updatedSubscription);
    });

    it('should return null when tenant has no subscription', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.updateByTenantId('tenant_no_sub', { plan: 'enterprise' });

      expect(result).toBeNull();
    });
  });

  describe('updateByStripeSubscriptionId', () => {
    it('should update subscription by Stripe subscription ID', async () => {
      const updatedSubscription = {
        id: 'sub_123',
        tenantId: 'tenant_123',
        plan: 'enterprise',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
        cancelAtPeriodEnd: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      };

      mockDb.returning.mockResolvedValue([updatedSubscription]);

      const result = await repository.updateByStripeSubscriptionId('sub_stripe_123', { plan: 'enterprise' });

      expect(result).toEqual(updatedSubscription);
    });

    it('should return null when Stripe subscription not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.updateByStripeSubscriptionId('sub_not_found', { plan: 'enterprise' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete subscription and return true', async () => {
      mockDb.returning.mockResolvedValue([{ id: 'sub_123' }]);

      const result = await repository.delete('sub_123');

      expect(result).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return false when subscription not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.delete('non_existent');

      expect(result).toBe(false);
    });
  });
});
