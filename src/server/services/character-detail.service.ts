import type { Character } from '../../db/schema/characters';
import type { PresentationVersion } from '../../types/story-presentation';
import type { CharacterDetailPreview } from '../../types/character-detail';
import { inspectOpening, openingDisplayText, openingReferences, storyIntroduction } from '../../types/story-opening';
import { inspectStoryCapabilities } from '../../types/story-capabilities';
import { characterSummary } from './character-summary.service';

export async function characterDetail(character: Character & { presentation?: PresentationVersion }) {
  const card = character.cardData && typeof character.cardData === 'object' && !Array.isArray(character.cardData)
    ? character.cardData as Record<string, unknown> : {};
  const display = (value: unknown, limit: number) => typeof value === 'string' ? openingDisplayText(value).slice(0, limit + 1) : '';
  // Classify the original openings before stripping controls or truncating display text.
  const opening = openingReferences(card).map(reference => inspectOpening(card, reference)).find(item => item.kind === 'narrative');
  const detailPreview: CharacterDetailPreview = {
    introduction: storyIntroduction(character.description, card, character.presentation),
    opening: opening?.preview.slice(0, 1601) ?? '',
    scenario: display(card.scenario, 1600), personality: display(card.personality, 600),
    creator: display(card.creator, 120), creatorNotes: display(card.creator_notes, 6000),
    capabilities: inspectStoryCapabilities(card),
  };
  return { ...await characterSummary(character), detailPreview,
    ...(character.presentation ? { presentation: character.presentation } : {}) };
}
