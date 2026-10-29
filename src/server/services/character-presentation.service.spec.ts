import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { collectPresentationSources, verifyPresentationSelection } from './story-presentation-workflow';
import { currentCharacterPresentation } from './character-presentation.service';
import { storyIntroduction } from '../../types/story-opening';
import { storyCharacterSchema } from '../../types/story-content';

vi.mock('../../db', () => ({ db: {} }));

function fixture() {
  const character = { id: randomUUID(), creatorId: randomUUID(), tenantId: randomUUID(), isPublic: false,
    name: '远行者', description: null, cardData: { first_mes: '你在晨光中走进车站，广播响起。',
      alternate_greetings: ['夜幕笼罩码头，你收到了同伴的来信。'] } };
  const sources = collectPresentationSources(character);
  const draft = verifyPresentationSelection(character, sources, { version: 1, candidateId: sources.candidates[1].id });
  const row = { id: randomUUID(), characterId: character.id, userId: character.creatorId, tenantId: character.tenantId,
    requestId: randomUUID(), sourceRevision: draft.sourceRevision, draft, createdAt: new Date() };
  return { character, row };
}

describe('current sourced presentation', () => {
  it('displays a verified alternate excerpt, preserves the raw card, and lets an edited introduction take priority', () => {
    const { character, row } = fixture();
    const raw = JSON.stringify(character);
    const version = currentCharacterPresentation(character, row)!;
    expect(version.id).toBe(row.id);
    expect(storyIntroduction(null, character.cardData, version)).toMatchObject({ text: row.draft.text, source: 'opening',
      reference: { source: 'alternate_greetings', index: 0 } });
    expect(storyIntroduction('作者选择的公开介绍', character.cardData, version)).toEqual({ text: '作者选择的公开介绍', source: 'description' });
    expect(JSON.stringify(character)).toBe(raw);
  });

  it.each(['public', 'owner', 'tenant', 'character', 'source', 'name', 'description', 'opening', 'coverage', 'text'])('rejects inapplicable or tampered presentation: %s', field => {
    const { character, row } = fixture();
    if (field === 'public') character.isPublic = true;
    if (field === 'owner') row.userId = randomUUID();
    if (field === 'tenant') row.tenantId = randomUUID();
    if (field === 'character') row.characterId = randomUUID();
    if (field === 'source') row.sourceRevision = 'f'.repeat(64);
    if (field === 'name') character.name = '新名称';
    if (field === 'description') Object.assign(character, { description: '用户新写的介绍' });
    if (field === 'opening') character.cardData.first_mes += '资料修改';
    if (field === 'coverage') row.draft.coverage.omittedCandidates++;
    if (field === 'text') row.draft.text = '凭空捏造的故事介绍';
    expect(currentCharacterPresentation(character, row)).toBeUndefined();
  });

  it('keeps a frozen presentation readable after the live source changes, but rejects cross-card or altered snapshot sources', () => {
    const { character, row } = fixture();
    const saved = storyCharacterSchema.parse(JSON.parse(JSON.stringify({ ...character, avatarUrl: null, promptTemplate: null,
      presentation: currentCharacterPresentation(character, row) })));
    character.cardData.alternate_greetings[0] = '修改后的新开场，与你的旧故事无关。';
    expect(currentCharacterPresentation(character, row)).toBeUndefined();
    expect(storyIntroduction(saved.description, saved.cardData, saved.presentation).text).toBe(row.draft.text);
    expect(storyCharacterSchema.safeParse({ ...saved, id: randomUUID() }).success).toBe(false);
    expect(storyCharacterSchema.safeParse({ ...saved, cardData: character.cardData }).success).toBe(false);
    expect(storyIntroduction(null, character.cardData, saved.presentation).text).not.toBe(row.draft.text);
  });
});
