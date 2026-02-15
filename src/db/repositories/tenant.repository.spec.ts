import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — factory must be self-contained
vi.mock('../index', () => {
  const mockDb: any = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
  };
  return { db: mockDb };
});

vi.mock('../schema', () => ({
  tenants: {
    id: 'id',
    name: 'name',
    plan: 'plan',
    updatedAt: 'updated_at',
  },
}));

import { TenantRepository } from './tenant.repository';
import { db } from '../index';

// Cast for easy access
const mockDb = db as any;

describe('TenantRepository', () => {
  let repository: TenantRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-chain after clear
    mockDb.insert.mockReturnThis();
    mockDb.values.mockReturnThis();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.delete.mockReturnThis();

    repository = new TenantRepository(mockDb);
  });

  it('should create a new tenant', async () => {
    const fakeTenant = { id: 'tenant-1', name: 'Test Tenant', plan: 'free' };
    mockDb.returning.mockResolvedValueOnce([fakeTenant]);

    const tenant = await repository.create({ name: 'Test Tenant', plan: 'free' } as any);

    expect(tenant.id).toBe('tenant-1');
    expect(tenant.name).toBe('Test Tenant');
    expect(tenant.plan).toBe('free');
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('should find tenant by ID', async () => {
    const fakeTenant = { id: 'tenant-1', name: 'Find Test', plan: 'free' };
    mockDb.limit.mockResolvedValueOnce([fakeTenant]);

    const found = await repository.findById('tenant-1');

    expect(found).toBeDefined();
    expect(found?.name).toBe('Find Test');
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should return null for non-existent tenant', async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const found = await repository.findById('00000000-0000-0000-0000-000000000000');

    expect(found).toBeNull();
  });
});
