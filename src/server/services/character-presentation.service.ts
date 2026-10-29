import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, desc, eq, or } from 'drizzle-orm';
import { db, type Database } from '../../db';
import { characters, type Character } from '../../db/schema/characters';
import { characterPresentations } from '../../db/schema/character-presentations';
import { AppError, NotFoundError } from '../../core/errors';
import type { StoryContentSnapshot } from '../../types/story-content';
import type { PresentationDraft, PresentationVersion } from '../../types/story-presentation';
import type { StorySources } from './story-diagnostics.service';
import { collectPresentationSources, revalidatePresentationDraft } from './story-presentation-workflow';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type PresentationRow = typeof characterPresentations.$inferSelect;
type PresentationOwner = Pick<Character, 'id' | 'name' | 'description' | 'cardData' | 'creatorId' | 'tenantId' | 'isPublic'>;

function presentationSource(character: PresentationOwner) {
  return { ...character, cardData: character.cardData && typeof character.cardData === 'object' && !Array.isArray(character.cardData)
    ? character.cardData as Record<string, unknown> : {} };
}

export async function saveCharacterPresentation(input: {
  characterId: string; userId: string; tenantId: string; requestId: string; draft: PresentationDraft;
}, database: Database = db): Promise<PresentationVersion> {
  return database.transaction(async transaction => {
    const [character] = await transaction.select().from(characters).where(and(eq(characters.id, input.characterId),
      eq(characters.creatorId, input.userId), eq(characters.tenantId, input.tenantId))).for('update');
    if (!character) throw new NotFoundError('Character');
    const [previous] = await transaction.select().from(characterPresentations).where(and(
      eq(characterPresentations.characterId, character.id), eq(characterPresentations.userId, input.userId),
      eq(characterPresentations.tenantId, input.tenantId), eq(characterPresentations.requestId, input.requestId)));
    if (previous) {
      if (!isDeepStrictEqual(previous.draft, input.draft)) throw new AppError('整理请求已用于其他内容。', 409, 'PRESENTATION_REQUEST_CONFLICT');
      return { id: previous.id, draft: previous.draft };
    }
    const draft = revalidatePresentationDraft(presentationSource(character), input.draft);
    const [saved] = await transaction.insert(characterPresentations).values({ characterId: input.characterId, userId: input.userId,
      tenantId: input.tenantId, requestId: input.requestId, sourceRevision: draft.sourceRevision, draft }).returning();
    return { id: saved.id, draft: saved.draft };
  });
}

export function currentCharacterPresentation(character: PresentationOwner,
  row: PresentationRow | undefined): PresentationVersion | undefined {
  if (!row || character.isPublic || row.characterId !== character.id || row.userId !== character.creatorId || row.tenantId !== character.tenantId) return;
  try {
    const draft = revalidatePresentationDraft(presentationSource(character), row.draft);
    if (draft.status !== 'draft' || row.sourceRevision !== draft.sourceRevision) return;
    return { id: row.id, draft };
  } catch { return; }
}

export async function decorateCharacterPresentations<Selected extends PresentationOwner>(rows: Selected[], database: Pick<Transaction, 'select' | 'selectDistinctOn'> = db): Promise<(Selected & { presentation?: PresentationVersion })[]> {
  const candidates = rows.filter(character => !character.isPublic && character.creatorId);
  if (!candidates.length) return rows as (Selected & { presentation?: PresentationVersion })[];
  const versions = await database.selectDistinctOn([characterPresentations.characterId]).from(characterPresentations)
    .where(or(...candidates.map(character => and(eq(characterPresentations.characterId, character.id),
      eq(characterPresentations.userId, character.creatorId!), eq(characterPresentations.tenantId, character.tenantId),
      eq(characterPresentations.sourceRevision, collectPresentationSources(presentationSource(character)).sourceRevision)))))
    .orderBy(characterPresentations.characterId, desc(characterPresentations.createdAt), desc(characterPresentations.id));
  const byCharacter = new Map(versions.map(row => [row.characterId, row]));
  return rows.map(character => {
    const presentation = currentCharacterPresentation(character, byCharacter.get(character.id));
    return presentation ? { ...character, presentation } : character;
  });
}

export async function attachStoryPresentations(transaction: Pick<Transaction, 'select' | 'selectDistinctOn'>, content: StoryContentSnapshot, sources: StorySources) {
  const decorated = await decorateCharacterPresentations(sources.characters, transaction);
  for (const character of content.characters) {
    const presentation = decorated.find(source => source.id === character.id)?.presentation;
    if (presentation) character.presentation = presentation;
  }
  content.revision = createHash('sha256').update(JSON.stringify(content.characters)).digest('hex');
}
