import { createHash } from 'node:crypto';
import type { CharacterSummarySource } from '../../db/repositories/character.repository';
import type { PresentationVersion } from '../../types/story-presentation';
import { storyIntroduction } from '../../types/story-opening';

// Only derived, small images are cached. Never cache whole cards or fetch remote URLs.
const covers = new Map<string, string | null>();
let imageQueue: Promise<unknown> = Promise.resolve();
const MAX_COVER_BYTES = 32 * 1024;

export async function characterListCover(source: string | null): Promise<string | null> {
  if (!source || !source.startsWith('data:')) return source;
  if (source.length > 16 * 1024 * 1024) return null;
  const key = createHash('sha256').update(source).digest('hex');
  const render = async () => {
    if (covers.has(key)) return covers.get(key)!;
    let cover: string | null = null;
    try {
      const match = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/.exec(source);
      if (match) {
        const { default: sharp } = await import('sharp');
        let bytes = await sharp(Buffer.from(match[1], 'base64'), { limitInputPixels: 40_000_000, sequentialRead: true })
          .rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 65, effort: 2 }).toBuffer();
        // Detailed covers may exceed the budget at 480px; shrink rather than hide them.
        if (bytes.length > MAX_COVER_BYTES) {
          bytes = await sharp(bytes).resize({ width: 240, height: 240, fit: 'inside' })
            .webp({ quality: 45, effort: 2 }).toBuffer();
        }
        if (bytes.length <= MAX_COVER_BYTES) cover = `data:image/webp;base64,${bytes.toString('base64')}`;
      }
    } catch { /* A broken cover must not prevent the library from loading. */ }
    if (covers.size >= 128) covers.delete(covers.keys().next().value!);
    covers.set(key, cover);
    return cover;
  };
  // Serialize native decoding across requests to bound peak memory on small hosts.
  const work = imageQueue.then(render, render);
  imageQueue = work.then(() => undefined, () => undefined);
  return work;
}

type CharacterSummaryInput = Omit<CharacterSummarySource, 'cardData'> & { cardData: unknown; presentation?: PresentationVersion };

export async function characterSummary(character: CharacterSummaryInput) {
  const card = character.cardData && typeof character.cardData === 'object' && !Array.isArray(character.cardData)
    ? character.cardData as Record<string, unknown> : {};
  return {
    id: character.id, tenantId: character.tenantId, creatorId: character.creatorId,
    name: character.name,
    description: storyIntroduction(character.description, card, character.presentation).text.slice(0, 500),
    avatarUrl: await characterListCover(character.avatarUrl),
    tags: character.tags, category: character.category,
    isPublic: character.isPublic, isNsfw: character.isNsfw,
    moderationStatus: character.moderationStatus, violationCategory: character.violationCategory,
    moderationNote: character.moderationNote,
    downloadCount: character.downloadCount, viewCount: character.viewCount,
    ratingAvg: character.ratingAvg, ratingCount: character.ratingCount,
    createdAt: character.createdAt, updatedAt: character.updatedAt,
  };
}

export async function characterSummaries(rows: CharacterSummaryInput[]) {
  const result = [];
  for (const row of rows) result.push(await characterSummary(row));
  return result;
}
