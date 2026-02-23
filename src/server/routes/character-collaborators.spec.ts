/**
 * Character Collaborator route tests
 *
 * Covers invite, list, update role, and remove collaborator endpoints.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async (c: any, next: any) => {
    c.set('user', {
      id: 'user-123',
      tenantId: 'tenant-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
    });
    return next();
  },
}));

// Mock feature gate middleware
vi.mock('../middleware/feature-gate', () => ({
  requireFeature: () => async (_c: any, next: any) => next(),
}));

// Mock notification service
vi.mock('../services/notification.service', () => ({
  notificationService: { notify: vi.fn().mockResolvedValue(undefined) },
}));

// Chainable mock helper for drizzle
function mockChain(resolvedValue: any) {
  const chain: any = {};
  const terminal = () => Promise.resolve(resolvedValue);
  const methods = ['select', 'from', 'where', 'orderBy', 'insert', 'update', 'delete', 'set', 'values', 'returning', 'innerJoin', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => terminal().then(resolve, reject);
  return chain;
}

// Chainable mock that rejects
function mockChainReject(error: any) {
  const chain: any = {};
  const terminal = () => Promise.reject(error);
  const methods = ['select', 'from', 'where', 'orderBy', 'insert', 'update', 'delete', 'set', 'values', 'returning', 'innerJoin', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => terminal().then(resolve, reject);
  return chain;
}

let dbMock: any;

const { dbMockRef } = vi.hoisted(() => {
  const dbMockRef = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { dbMockRef };
});

vi.mock('@db/index', () => ({ db: dbMockRef }));

import { characterCollaboratorRoutes } from './character-collaborators';

describe('Character Collaborator Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/api', characterCollaboratorRoutes);
    dbMock = dbMockRef;
    vi.clearAllMocks();
  });

  // ── POST /characters/:id/collaborators (invite) ──

  describe('POST /api/characters/:id/collaborators', () => {
    it('should return 201 when owner invites a collaborator', async () => {
      const mockCollaborator = { id: 'collab-1', characterId: 'char-1', userId: 'user-456', role: 'editor', invitedBy: 'user-123' };
      // First select: ownership check — character owned by user-123
      const selectChain = mockChain([{ creatorId: 'user-123' }]);
      // Insert: create collaborator
      const insertChain = mockChain([mockCollaborator]);
      dbMock.select.mockReturnValueOnce(selectChain);
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request('/api/characters/char-1/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000001', role: 'editor' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockCollaborator);
    });

    it('should return 404 for non-existent character', async () => {
      const selectChain = mockChain([]);
      dbMock.select.mockReturnValueOnce(selectChain);

      const res = await app.request('/api/characters/non-existent/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000001', role: 'viewer' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 403 when non-owner tries to invite', async () => {
      const selectChain = mockChain([{ creatorId: 'other-user' }]);
      dbMock.select.mockReturnValueOnce(selectChain);

      const res = await app.request('/api/characters/char-1/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000001', role: 'editor' }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should return 409 for duplicate collaborator', async () => {
      const selectChain = mockChain([{ creatorId: 'user-123' }]);
      const insertChain = mockChainReject({ code: '23505' });
      dbMock.select.mockReturnValueOnce(selectChain);
      dbMock.insert.mockReturnValue(insertChain);

      const res = await app.request('/api/characters/char-1/collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000001', role: 'editor' }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  // ── GET /characters/:id/collaborators (list) ──

  describe('GET /api/characters/:id/collaborators', () => {
    it('should return collaborators with user info for owner', async () => {
      const mockCollaborators = [
        { id: 'collab-1', characterId: 'char-1', userId: 'user-456', role: 'editor', invitedBy: 'user-123', createdAt: '2026-01-01', userName: 'Alice', userAvatar: null },
        { id: 'collab-2', characterId: 'char-1', userId: 'user-789', role: 'viewer', invitedBy: 'user-123', createdAt: '2026-01-02', userName: 'Bob', userAvatar: 'https://example.com/bob.png' },
      ];
      // First select: ownership check — owned by user-123
      const selectChain1 = mockChain([{ creatorId: 'user-123' }]);
      // Second select: collaborator list with user join
      const selectChain2 = mockChain(mockCollaborators);
      dbMock.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);

      const res = await app.request('/api/characters/char-1/collaborators');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockCollaborators);
      expect(body.data).toHaveLength(2);
    });

    it('should return 403 for non-owner non-collaborator', async () => {
      // First select: character owned by someone else
      const selectChain1 = mockChain([{ creatorId: 'other-user' }]);
      // Second select: self-check returns empty (not a collaborator)
      const selectChain2 = mockChain([]);
      dbMock.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);

      const res = await app.request('/api/characters/char-1/collaborators');

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ── PATCH /characters/:id/collaborators/:userId (update role) ──

  describe('PATCH /api/characters/:id/collaborators/:userId', () => {
    it('should return 200 when owner updates collaborator role', async () => {
      const mockUpdated = { id: 'collab-1', characterId: 'char-1', userId: 'user-456', role: 'viewer' };
      // Select: ownership check
      const selectChain = mockChain([{ creatorId: 'user-123' }]);
      // Update: change role
      const updateChain = mockChain([mockUpdated]);
      dbMock.select.mockReturnValueOnce(selectChain);
      dbMock.update.mockReturnValue(updateChain);

      const res = await app.request('/api/characters/char-1/collaborators/user-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'viewer' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockUpdated);
    });
  });

  // ── DELETE /characters/:id/collaborators/:userId (remove) ──

  describe('DELETE /api/characters/:id/collaborators/:userId', () => {
    it('should return 200 when owner removes a collaborator', async () => {
      const mockDeleted = { id: 'collab-1', characterId: 'char-1', userId: 'user-456', role: 'editor' };
      // Select: ownership check
      const selectChain = mockChain([{ creatorId: 'user-123' }]);
      // Delete: remove collaborator
      const deleteChain = mockChain([mockDeleted]);
      dbMock.select.mockReturnValueOnce(selectChain);
      dbMock.delete.mockReturnValue(deleteChain);

      const res = await app.request('/api/characters/char-1/collaborators/user-456', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Collaborator removed successfully');
    });
  });
});
