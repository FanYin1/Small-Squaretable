import { describe, it, expect, beforeEach } from 'vitest';
import { TenantRepository } from './tenant.repository';
import { db } from '../index';

describe('TenantRepository', () => {
  let repository: TenantRepository;

  beforeEach(() => {
    repository = new TenantRepository(db);
  });

  it('should create a new tenant', async () => {
    const tenant = await repository.create({
      name: 'Test Tenant',
      plan: 'free',
    });

    expect(tenant.id).toBeDefined();
    expect(tenant.name).toBe('Test Tenant');
    expect(tenant.plan).toBe('free');
  });

  it('should find tenant by ID', async () => {
    const created = await repository.create({
      name: 'Find Test',
      plan: 'free',
    });

    const found = await repository.findById(created.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe('Find Test');
  });

  it('should return null for non-existent tenant', async () => {
    const found = await repository.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });
});
