/**
 * Admin Experiment Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../../middleware/error-handler';

// Mock DB
vi.mock('../../../db/index', () => ({
  db: {},
}));

// Mock experiment repository
vi.mock('../../../db/repositories/experiment.repository', () => ({
  experimentRepository: {
    findByTenant: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
  },
  ExperimentRepository: vi.fn(),
}));

// Mock experiment analysis service
vi.mock('../../services/experiment-analysis.service', () => ({
  experimentAnalysisService: {
    getExperimentResults: vi.fn(),
  },
  ExperimentAnalysisService: vi.fn(),
}));

// Mock auth middleware — admin role
vi.mock('../../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'admin-123',
      tenantId: 'tenant-123',
      email: 'admin@example.com',
      displayName: 'Admin User',
      avatarUrl: null,
      role: 'admin',
    });
    c.set('tenantId', 'tenant-123');
    return next();
  },
}));


import { adminExperimentRoutes } from './experiments';
import { experimentRepository } from '../../../db/repositories/experiment.repository';
import { experimentAnalysisService } from '../../services/experiment-analysis.service';

const mockExperiment = {
  id: 'exp-1',
  tenantId: 'tenant-123',
  name: 'homepage-layout',
  description: 'Test homepage layouts',
  status: 'draft',
  variants: [
    { name: 'control', weight: 50, config: {} },
    { name: 'variant-a', weight: 50, config: { layout: 'grid' } },
  ],
  startedAt: null,
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Admin Experiment Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api/v1/admin/experiments', adminExperimentRoutes);
    app.onError(errorHandler);
    vi.clearAllMocks();
  });

  describe('GET /experiments', () => {
    it('should list experiments for tenant', async () => {
      vi.mocked(experimentRepository.findByTenant).mockResolvedValue([mockExperiment] as any);

      const res = await app.request('/api/v1/admin/experiments');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('homepage-layout');
      expect(experimentRepository.findByTenant).toHaveBeenCalledWith('tenant-123');
    });

    it('should return empty array when no experiments', async () => {
      vi.mocked(experimentRepository.findByTenant).mockResolvedValue([]);

      const res = await app.request('/api/v1/admin/experiments');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });
  });

  describe('POST /experiments', () => {
    it('should create an experiment', async () => {
      vi.mocked(experimentRepository.create).mockResolvedValue(mockExperiment as any);

      const res = await app.request('/api/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'homepage-layout',
          description: 'Test homepage layouts',
          variants: [
            { name: 'control', weight: 50, config: {} },
            { name: 'variant-a', weight: 50, config: { layout: 'grid' } },
          ],
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('homepage-layout');
      expect(experimentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'homepage-layout',
          tenantId: 'tenant-123',
        }),
      );
    });

    it('should reject invalid body (missing variants)', async () => {
      const res = await app.request('/api/v1/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /experiments/:id', () => {
    it('should update experiment and set startedAt when status=running', async () => {
      const runningExp = { ...mockExperiment, status: 'running', startedAt: new Date() };
      vi.mocked(experimentRepository.update).mockResolvedValue(runningExp as any);

      const res = await app.request('/api/v1/admin/experiments/exp-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(experimentRepository.update).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({
          status: 'running',
          startedAt: expect.any(Date),
        }),
      );
    });

    it('should set endedAt when status=completed', async () => {
      const completedExp = { ...mockExperiment, status: 'completed', endedAt: new Date() };
      vi.mocked(experimentRepository.update).mockResolvedValue(completedExp as any);

      const res = await app.request('/api/v1/admin/experiments/exp-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });

      expect(res.status).toBe(200);
      expect(experimentRepository.update).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({
          status: 'completed',
          endedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('GET /experiments/:id/results', () => {
    it('should return experiment results', async () => {
      const mockResults = [
        { variant: 'control', impressions: 1000, clicks: 50, chatStarts: 20, ctr: 0.05 },
        { variant: 'variant-a', impressions: 1000, clicks: 80, chatStarts: 35, ctr: 0.08 },
      ];
      vi.mocked(experimentAnalysisService.getExperimentResults).mockResolvedValue(mockResults);

      const res = await app.request('/api/v1/admin/experiments/exp-1/results');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].variant).toBe('control');
      expect(data.data[1].ctr).toBe(0.08);
      expect(experimentAnalysisService.getExperimentResults).toHaveBeenCalledWith('exp-1');
    });

    it('should return empty results when no data', async () => {
      vi.mocked(experimentAnalysisService.getExperimentResults).mockResolvedValue([]);

      const res = await app.request('/api/v1/admin/experiments/exp-1/results');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });
  });
});

