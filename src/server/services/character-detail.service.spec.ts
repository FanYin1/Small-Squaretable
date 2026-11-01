import { describe, expect, it } from 'vitest';
import type { Character } from '../../db/schema/characters';
import { characterDetail } from './character-detail.service';

describe('read-only character detail', () => {
  it('keeps narrative selection and script warnings while excluding original assets and instructions', async () => {
    const character = { id: 'card', name: 'Voyager', description: null, avatarUrl: null,
      cardData: {
        first_mes: '本角色卡分享于以下社区。点击右箭头开始正文内容→',
        alternate_greetings: ['<VariableInsert>{"secret":42}</VariableInsert><p>{{char}}遇见{{user}}。</p>'],
        scenario: '<script>hidden()</script><p>港口</p>', personality: '冷静', creator: '作者',
        creator_notes: '<style>hidden</style>说明', system_prompt: 'secret instruction',
        extensions: { scripts: ['original author script'], hugeAsset: 'x'.repeat(2_000_000) },
      }, isPublic: true } as unknown as Character;
    const original = JSON.stringify(character);
    const result = await characterDetail(character);
    expect(result).not.toHaveProperty('cardData');
    expect(result.detailPreview).toMatchObject({
      introduction: { source: 'opening', reference: { source: 'alternate_greetings', index: 0 } },
      opening: '{{char}}遇见{{user}}。', scenario: '港口', personality: '冷静', creator: '作者', creatorNotes: '说明',
      capabilities: { scripted: true, issues: expect.arrayContaining(['author_scripts']) },
    });
    expect(JSON.stringify(result).length).toBeLessThan(5000);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(character)).toBe(original);
  });

  it('bounds visible text without changing the original card or inventing an opening', async () => {
    const character = { id: 'card', name: 'Voyager', description: '简介'.repeat(10000), avatarUrl: null,
      cardData: { first_mes: '<VariableInsert>{"x":1}</VariableInsert>',
        scenario: 's'.repeat(10000), personality: 'p'.repeat(10000), creator_notes: 'n'.repeat(10000) },
    } as unknown as Character;
    const result = await characterDetail(character);
    expect(result.detailPreview.opening).toBe('');
    expect(result.detailPreview.introduction.text.length).toBe(500);
    expect(result.detailPreview.scenario.length).toBe(1601);
    expect(result.detailPreview.personality.length).toBe(601);
    expect(result.detailPreview.creatorNotes.length).toBe(6001);
    expect((character.cardData as Record<string, string>).scenario.length).toBe(10000);
  });
});
