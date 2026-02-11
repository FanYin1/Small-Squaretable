/**
 * GDPR Service unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import yauzl from 'yauzl';

// ---- Repository mocks ----

const mockUserFindById = vi.fn();
const mockCharFindByTenantId = vi.fn();
const mockChatFindByUserId = vi.fn();
const mockMsgFindByChatId = vi.fn();
const mockRatingFindByCharacterId = vi.fn();
const mockCommentGetByCharacter = vi.fn();
const mockFavGetByUser = vi.fn();
const mockFollowGetFollowing = vi.fn();
const mockFollowGetFollowers = vi.fn();
const mockSubFindByTenantId = vi.fn();
const mockApiKeyFindByUserId = vi.fn();
const mockPluginFindInstallsByUserId = vi.fn();

vi.mock('../../db/repositories/user.repository', () => ({
  userRepository: { findById: (...a: unknown[]) => mockUserFindById(...a) },
}));
vi.mock('../../db/repositories/character.repository', () => ({
  characterRepository: { findByTenantId: (...a: unknown[]) => mockCharFindByTenantId(...a) },
}));
vi.mock('../../db/repositories/chat.repository', () => ({
  chatRepository: { findByUserId: (...a: unknown[]) => mockChatFindByUserId(...a) },
}));
vi.mock('../../db/repositories/message.repository', () => ({
  messageRepository: { findByChatId: (...a: unknown[]) => mockMsgFindByChatId(...a) },
}));
vi.mock('../../db/repositories/rating.repository', () => ({
  ratingRepository: { findByCharacterId: (...a: unknown[]) => mockRatingFindByCharacterId(...a) },
}));
vi.mock('../../db/repositories/comment.repository', () => ({
  commentRepository: { getCommentsByCharacter: (...a: unknown[]) => mockCommentGetByCharacter(...a) },
}));
vi.mock('../../db/repositories/favorite.repository', () => ({
  favoriteRepository: { getFavoritesByUser: (...a: unknown[]) => mockFavGetByUser(...a) },
}));
vi.mock('../../db/repositories/follow.repository', () => ({
  followRepository: {
    getFollowing: (...a: unknown[]) => mockFollowGetFollowing(...a),
    getFollowers: (...a: unknown[]) => mockFollowGetFollowers(...a),
  },
}));
vi.mock('../../db/repositories/subscription.repository', () => ({
  subscriptionRepository: { findByTenantId: (...a: unknown[]) => mockSubFindByTenantId(...a) },
}));
vi.mock('../../db/repositories/apiKey.repository', () => ({
  apiKeyRepository: { findByUserId: (...a: unknown[]) => mockApiKeyFindByUserId(...a) },
}));
vi.mock('../../db/repositories/plugin.repository', () => ({
  pluginRepository: { findInstallsByUserId: (...a: unknown[]) => mockPluginFindInstallsByUserId(...a) },
}));

// Mock audit service (used in route tests, not service, but keep it available)
vi.mock('./audit.service', () => ({
  auditService: { log: vi.fn() },
}));

// Import after mocks
import { gdprService } from './gdpr.service';

// ---- Helpers ----

const USER_ID = 'user-123';
const TENANT_ID = 'tenant-456';

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    tenantId: TENANT_ID,
    email: 'test@example.com',
    passwordHash: '$2b$10$secrethash',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    emailVerificationToken: 'abc123token',
    displayName: 'Test User',
    avatarUrl: null,
    role: 'user',
    isActive: true,
    emailVerified: true,
    totpEnabled: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-01'),
    lastLoginAt: new Date('2026-02-10'),
    followerCount: 5,
    followingCount: 3,
    ...overrides,
  };
}

function fakeCharacter(id: string) {
  return { id, tenantId: TENANT_ID, creatorId: USER_ID, name: `Char ${id}` };
}

function fakeChat(id: string) {
  return { id, userId: USER_ID, tenantId: TENANT_ID, characterId: 'char-1' };
}

function fakeMessage(chatId: string, content: string) {
  return { id: 1, chatId, content, role: 'user', sentAt: new Date() };
}

/** Parse a ZIP buffer and return a map of filename -> parsed JSON content */
async function parseZip(buffer: Buffer): Promise<Map<string, unknown>> {
  return new Promise((resolve, reject) => {
    const files = new Map<string, unknown>();
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err || new Error('No zipfile'));
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2 || !readStream) return reject(err2 || new Error('No stream'));
          const chunks: Buffer[] = [];
          readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
          readStream.on('end', () => {
            const content = Buffer.concat(chunks).toString('utf-8');
            try {
              files.set(entry.fileName, JSON.parse(content));
            } catch {
              files.set(entry.fileName, content);
            }
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => resolve(files));
    });
  });
}

function setupDefaultMocks() {
  mockUserFindById.mockResolvedValue(fakeUser());
  mockCharFindByTenantId.mockResolvedValue([fakeCharacter('char-1')]);
  mockChatFindByUserId.mockResolvedValue([fakeChat('chat-1')]);
  mockMsgFindByChatId.mockResolvedValue([fakeMessage('chat-1', 'Hello!')]);
  mockRatingFindByCharacterId.mockResolvedValue([
    { id: 'r1', characterId: 'char-1', userId: USER_ID, quality: 5 },
  ]);
  mockFavGetByUser.mockResolvedValue([{ userId: USER_ID, characterId: 'char-1' }]);
  mockFollowGetFollowing.mockResolvedValue([{ followingId: 'user-other' }]);
  mockFollowGetFollowers.mockResolvedValue([{ followerId: 'user-fan' }]);
  mockSubFindByTenantId.mockResolvedValue({ id: 'sub-1', plan: 'pro', tenantId: TENANT_ID });
  mockApiKeyFindByUserId.mockResolvedValue([
    { id: 'key-1', userId: USER_ID, name: 'My Key', keyHash: 'secret-hash', keyPrefix: 'sk_live_abc' },
  ]);
  mockPluginFindInstallsByUserId.mockResolvedValue([
    { id: 'inst-1', pluginId: 'plug-1', userId: USER_ID, plugin: { name: 'Test Plugin' } },
  ]);
}

// ---- Tests ----

describe('GdprService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe('exportUserData', () => {
    it('should generate a valid ZIP with expected files', async () => {
      const buffer = await gdprService.exportUserData(USER_ID, TENANT_ID);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      const files = await parseZip(buffer);
      const expectedFiles = [
        'profile.json',
        'characters.json',
        'chats.json',
        'ratings.json',
        'favorites.json',
        'following.json',
        'followers.json',
        'subscription.json',
        'api_keys.json',
        'plugins.json',
      ];

      for (const name of expectedFiles) {
        expect(files.has(name), `Missing file: ${name}`).toBe(true);
      }
      expect(files.size).toBe(expectedFiles.length);
    });

    it('should exclude sensitive fields from profile (passwordHash, totpSecret, emailVerificationToken)', async () => {
      const buffer = await gdprService.exportUserData(USER_ID, TENANT_ID);
      const files = await parseZip(buffer);
      const profile = files.get('profile.json') as Record<string, unknown>;

      expect(profile).toBeDefined();
      expect(profile.id).toBe(USER_ID);
      expect(profile.email).toBe('test@example.com');
      expect(profile.displayName).toBe('Test User');

      // Sensitive fields must NOT be present
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('totpSecret');
      expect(profile).not.toHaveProperty('emailVerificationToken');
    });

    it('should exclude secret fields from API keys (keyHash, keyPrefix)', async () => {
      const buffer = await gdprService.exportUserData(USER_ID, TENANT_ID);
      const files = await parseZip(buffer);
      const keys = files.get('api_keys.json') as Array<Record<string, unknown>>;

      expect(keys).toHaveLength(1);
      expect(keys[0].id).toBe('key-1');
      expect(keys[0].name).toBe('My Key');
      expect(keys[0]).not.toHaveProperty('keyHash');
      expect(keys[0]).not.toHaveProperty('keyPrefix');
    });

    it('should include characters, chats with messages, and ratings', async () => {
      const buffer = await gdprService.exportUserData(USER_ID, TENANT_ID);
      const files = await parseZip(buffer);

      const characters = files.get('characters.json') as any[];
      expect(characters).toHaveLength(1);
      expect(characters[0].id).toBe('char-1');

      const chats = files.get('chats.json') as any[];
      expect(chats).toHaveLength(1);
      expect(chats[0].id).toBe('chat-1');
      expect(chats[0].messages).toHaveLength(1);
      expect(chats[0].messages[0].content).toBe('Hello!');

      const ratings = files.get('ratings.json') as any[];
      expect(ratings).toHaveLength(1);
      expect(ratings[0].userId).toBe(USER_ID);
    });

    it('should include social data (favorites, following, followers)', async () => {
      const buffer = await gdprService.exportUserData(USER_ID, TENANT_ID);
      const files = await parseZip(buffer);

      const favorites = files.get('favorites.json') as any[];
      expect(favorites).toHaveLength(1);

      const following = files.get('following.json') as any[];
      expect(following).toHaveLength(1);

      const followers = files.get('followers.json') as any[];
      expect(followers).toHaveLength(1);
    });

    it('should include subscription and plugin data', async () => {
      const buffer = await gdprService.exportUserData(USER_ID, TENANT_ID);
      const files = await parseZip(buffer);

      const sub = files.get('subscription.json') as Record<string, unknown>;
      expect(sub).toBeDefined();
      expect(sub.plan).toBe('pro');

      const plugins = files.get('plugins.json') as any[];
      expect(plugins).toHaveLength(1);
      expect(plugins[0].plugin.name).toBe('Test Plugin');
    });

    it('should handle user with no data gracefully', async () => {
      mockUserFindById.mockResolvedValue(null);
      mockCharFindByTenantId.mockResolvedValue([]);
      mockChatFindByUserId.mockResolvedValue([]);
      mockFavGetByUser.mockResolvedValue([]);
      mockFollowGetFollowing.mockResolvedValue([]);
      mockFollowGetFollowers.mockResolvedValue([]);
      mockSubFindByTenantId.mockResolvedValue(null);
      mockApiKeyFindByUserId.mockResolvedValue([]);
      mockPluginFindInstallsByUserId.mockResolvedValue([]);

      const buffer = await gdprService.exportUserData(USER_ID, TENANT_ID);
      const files = await parseZip(buffer);

      expect(files.get('profile.json')).toBeNull();
      expect(files.get('characters.json')).toEqual([]);
      expect(files.get('chats.json')).toEqual([]);
    });
  });
});
