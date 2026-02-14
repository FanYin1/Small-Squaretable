/**
 * Experiment Repository
 *
 * Data access layer for A/B test experiments.
 */

import { eq, and } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import { experiments, type Experiment, type NewExperiment } from '../schema/experiments';

export class ExperimentRepository extends BaseRepository {
  async create(data: NewExperiment): Promise<Experiment> {
    const [experiment] = await this.db.insert(experiments).values(data).returning();
    return experiment;
  }

  async findById(id: string): Promise<Experiment | null> {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, id))
      .limit(1);
    return experiment ?? null;
  }

  async findByTenant(tenantId: string): Promise<Experiment[]> {
    return await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.tenantId, tenantId))
      .orderBy(experiments.createdAt);
  }

  async findActive(): Promise<Experiment[]> {
    return await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.status, 'running'));
  }

  async findByName(name: string): Promise<Experiment | null> {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.name, name))
      .limit(1);
    return experiment ?? null;
  }

  async update(id: string, data: Partial<NewExperiment>): Promise<Experiment> {
    const [experiment] = await this.db
      .update(experiments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(experiments.id, id))
      .returning();
    return experiment;
  }
}

export const experimentRepository = new ExperimentRepository(db);
