import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { characterListCover, characterSummary } from './character-summary.service';
import type { Character } from '../../db/schema/characters';

describe('private character list summaries', () => {
  it('preserves a readable opening without shipping card internals or changing the original', async () => {
    const character = { id: 'card', name: 'Voyager', description: null, avatarUrl: null,
      cardData: { first_mes: '你走进车站，广播响起。', system_prompt: 'private instructions',
        extensions: { huge: 'x'.repeat(1_000_000) } }, isPublic: false,
      moderationStatus: 'rejected', moderationNote: '请调整介绍', tags: ['探索'] } as unknown as Character;
    const before = JSON.stringify(character);
    const summary = await characterSummary(character);
    expect(summary.description).toBe('你走进车站，广播响起。');
    expect(summary).toMatchObject({ moderationStatus: 'rejected', moderationNote: '请调整介绍', tags: ['探索'] });
    expect(summary).not.toHaveProperty('cardData');
    expect(summary).not.toHaveProperty('presentation');
    expect(JSON.stringify(summary).length).toBeLessThan(2000);
    expect(JSON.stringify(character)).toBe(before);
  });

  it('produces a bounded real thumbnail, reuses it, and changes it when the source changes', async () => {
    const source = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#2567ab' } }).png().toBuffer();
    const input = `data:image/png;base64,${source.toString('base64')}`;
    const cover = await characterListCover(input);
    expect(cover).toMatch(/^data:image\/webp;base64,/);
    const bytes = Buffer.from(cover!.split(',')[1], 'base64');
    const metadata = await sharp(bytes).metadata();
    expect(metadata.width).toBe(480);
    expect(metadata.height).toBe(360);
    expect(bytes.length).toBeLessThanOrEqual(32768);
    expect(await characterListCover(input)).toBe(cover);
    const changed = await sharp(source).negate().png().toBuffer();
    expect(await characterListCover(`data:image/png;base64,${changed.toString('base64')}`)).not.toBe(cover);
  });

  it('does not fetch external images or fail the list on malformed/oversized embedded images', async () => {
    expect(await characterListCover('https://example.test/cover.png')).toBe('https://example.test/cover.png');
    expect(await characterListCover('data:image/png;base64,broken')).toBeNull();
    expect(await characterListCover('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(await characterListCover('data:image/png;base64,' + 'A'.repeat(17 * 1024 * 1024))).toBeNull();
  });
});
