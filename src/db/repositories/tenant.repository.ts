import { eq } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { tenants, type Tenant, type NewTenant } from '../schema';

export class TenantRepository extends BaseRepository {
  async create(data: NewTenant): Promise<Tenant> {
    const [tenant] = await this.db.insert(tenants).values(data).returning();
    return tenant;
  }

  async findById(id: string): Promise<Tenant | null> {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    return tenant || null;
  }

  async findAll(): Promise<Tenant[]> {
    return this.db.select().from(tenants);
  }

  async update(id: string, data: Partial<NewTenant>): Promise<Tenant | null> {
    const [tenant] = await this.db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();

    return tenant || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(tenants).where(eq(tenants.id, id)).returning();
    return result.length > 0;
  }
}

export const tenantRepository = new TenantRepository(db);
