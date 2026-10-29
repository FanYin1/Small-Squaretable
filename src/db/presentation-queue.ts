import type { Database } from './index';
import type { Character } from './schema/characters';
import { presentationJobs } from './schema/presentation-jobs';
import { collectPresentationSources } from '../server/services/story-presentation-workflow';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function presentationCharacter(character: Pick<Character, 'id' | 'name' | 'description' | 'cardData'>) {
  return { id: character.id, name: character.name, description: character.description,
    cardData: character.cardData && typeof character.cardData === 'object' && !Array.isArray(character.cardData)
      ? character.cardData as Record<string, unknown> : {} };
}

export async function enqueuePresentation(transaction: Pick<Transaction, 'insert'>, character: Character) {
  if (!character.creatorId || character.isPublic) return;
  const sources = collectPresentationSources(presentationCharacter(character));
  const status = sources.existingIntroduction || sources.limited || !sources.candidates.length ? 'skipped' : 'queued';
  await transaction.insert(presentationJobs).values({ characterId: character.id, userId: character.creatorId,
    tenantId: character.tenantId, sourceRevision: sources.sourceRevision, status }).onConflictDoNothing();
}
