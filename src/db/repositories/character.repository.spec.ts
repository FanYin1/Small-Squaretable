import { describe, it, beforeEach, expect, vi } from 'vitest';
import { CharacterRepository } from './character.repository';
import { db } from '../index';

describe('CharacterRepository', () => {
  beforeEach(() => {
    new CharacterRepository(db);
  });

  describe('findById', () => {
    it('should return character when found', async () => {
      // Test implementation
    });

    it('should return null when not found', async () => {
      // Test implementation
    });
  });

  describe('findByTenantId', () => {
    it('should return characters by tenant with pagination', async () => {
      // Test implementation
    });
  });

  describe('findPublic', () => {
    it('should return public characters', async () => {
      // Test implementation
    });
  });

  describe('summary projections', () => {
    const sqlText = (value: unknown): string => {
      if (!value || typeof value !== 'object') return String(value ?? '');
      const node = value as { queryChunks?: unknown[]; value?: unknown[] };
      if (Array.isArray(node.queryChunks)) return node.queryChunks.map(sqlText).join('');
      if (Array.isArray(node.value)) return node.value.map(sqlText).join('');
      return '';
    };

    it('selects a small opening-only card projection for private lists', async () => {
      const selectArgs: unknown[] = [];
      const chain: Record<string, any> = {};
      for (const method of ['from', 'where', 'orderBy', 'limit', 'offset']) {
        chain[method] = vi.fn(() => chain);
      }
      chain.then = (resolve: (value: unknown) => unknown) => resolve([]);
      const fakeDb = { select: vi.fn((selection: unknown) => {
        selectArgs.push(selection);
        return chain;
      }) } as never;

      const repository = new CharacterRepository(fakeDb);
      await repository.findSummaryByTenantId('tenant-1', { page: 1, limit: 20 });

      const selection = selectArgs[0] as Record<string, unknown>;
      expect(Object.keys(selection)).toEqual(expect.arrayContaining([
        'id', 'name', 'description', 'avatarUrl', 'cardData', 'isPublic', 'createdAt', 'updatedAt',
      ]));
      expect(Object.keys(selection)).not.toContain('promptTemplate');
      expect(Object.keys(selection)).not.toContain('searchVector');
      expect(sqlText(selection.cardData)).toContain('jsonb_build_object');
      expect(sqlText(selection.cardData)).toContain('first_mes');
      expect(sqlText(selection.cardData)).toContain('alternate_greetings');
    });

    it('uses the same projection for public market lists', async () => {
      const selectArgs: unknown[] = [];
      const chain: Record<string, any> = {};
      for (const method of ['from', 'where', 'orderBy', 'limit', 'offset']) {
        chain[method] = vi.fn(() => chain);
      }
      chain.then = (resolve: (value: unknown) => unknown) => resolve([]);
      const fakeDb = { select: vi.fn((selection: unknown) => {
        selectArgs.push(selection);
        return chain;
      }) } as never;

      const repository = new CharacterRepository(fakeDb);
      await repository.findPublicSummary({ page: 1, limit: 20 });

      expect(selectArgs).toHaveLength(1);
      expect(Object.keys(selectArgs[0] as object)).toContain('cardData');
    });
  });

  describe('create', () => {
    it('should create and return character', async () => {
      // Test implementation
    });
  });

  describe('update', () => {
    it('should update character with tenant isolation', async () => {
      // Test implementation
    });
  });

  describe('delete', () => {
    it('should delete character with tenant isolation', async () => {
      // Test implementation
    });
  });

  describe('incrementDownloadCount', () => {
    it('should increment download count', async () => {
      // Test implementation
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      // Test implementation
    });
  });

  describe('countByTenantId', () => {
    it('should return count of characters in tenant', async () => {
      // Test implementation
    });
  });

  describe('countPublic', () => {
    it('should return count of public characters', async () => {
      // Test implementation
    });
  });
});
