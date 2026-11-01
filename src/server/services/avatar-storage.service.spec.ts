import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { prepareAvatar } from './avatar-storage.service';
import { createAvatarRoutes } from '../routes/avatars';
import { MAX_AVATAR_BYTES, updateUserSchema } from '../../types/user';

describe('avatar upload storage and public retrieval', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'squaretable-avatar-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it('stores a full-size upload as a small re-encoded avatar accessible without a token', async () => {
    const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#245d7f' } }).png().toBuffer();
    const input = Buffer.concat([png, Buffer.alloc(MAX_AVATAR_BYTES - png.length)]);
    const source = `data:image/png;base64,${input.toString('base64')}`;
    expect(updateUserSchema.safeParse({ avatarUrl: source }).success).toBe(true);
    const avatar = await prepareAvatar(source, directory);
    expect(avatar.url!.length).toBeLessThan(500);
    expect(avatar.url).toMatch(/^\/avatars\/.+\.webp$/);
    const bytes = await readFile(join(directory, avatar.url!.slice(1)));
    expect(bytes.length).toBeLessThan(32 * 1024);
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'webp', width: 256, height: 256 });
    const response = await createAvatarRoutes(directory).request(avatar.url!.replace('/avatars', ''));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    await avatar.discard();
    expect(await readdir(join(directory, 'avatars'))).toEqual([]);
  });

  it.each(['jpeg', 'webp'] as const)('accepts and re-encodes %s images', async format => {
    const bytes = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#23567a' } })[format]().toBuffer();
    const avatar = await prepareAvatar(`data:image/${format};base64,${bytes.toString('base64')}`, directory);
    expect(avatar.url).toMatch(/\.webp$/);
  });

  it.each([
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png;base64,bm90LWEtcG5n',
    'data:image/png;base64,@@@@',
    'https://example.com/' + 'a'.repeat(500),
  ])('rejects invalid images or oversized addresses before writing', async source => {
    await expect(prepareAvatar(source, directory)).rejects.toMatchObject({ statusCode: 400 });
    expect(await readdir(directory)).toEqual([]);
  });

  it('rejects decoded images above 5MB', async () => {
    const source = `data:image/png;base64,${Buffer.alloc(MAX_AVATAR_BYTES + 1).toString('base64')}`;
    await expect(prepareAvatar(source, directory)).rejects.toMatchObject({ statusCode: 400 });
    expect(await readdir(directory)).toEqual([]);
  });

  it('preserves existing URLs, empty avatars and omitted updates', async () => {
    for (const source of [undefined, '', 'https://example.com/avatar.jpg']) {
      expect((await prepareAvatar(source, directory)).url).toBe(source);
    }
  });

  it('does not expose arbitrary files or missing avatars', async () => {
    await writeFile(join(directory, 'private.txt'), 'private');
    const routes = createAvatarRoutes(directory);
    for (const file of ['/private.txt', '/..%2Fprivate.txt', '/00000000-0000-4000-8000-000000000000.webp']) {
      expect((await routes.request(file)).status).toBe(404);
    }
  });
});
