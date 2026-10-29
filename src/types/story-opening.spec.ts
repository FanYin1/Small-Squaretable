import { describe, expect, it } from 'vitest';
import { inspectOpening, openingContent, openingReferences, openingSelectionSchema, openingDisplayText, storyIntroduction } from './story-opening';
import { storyCharacterPreview, storyContentSnapshotSchema } from './story-content';

const characterId = '00000000-0000-4000-8000-000000000001';
const reference = { source: 'first_mes' as const, index: 0 };
const selection = { characterId, reference, revision: 'a'.repeat(64), reviewed: false };

describe('sourced story openings', () => {
  it('keeps source indices across empty and invalid entries and duplicate prose', () => {
    const card = { first_mes: '', alternate_greetings: [null, 'Hello.', 42, 'Hello.'] };
    const references = openingReferences(card);
    expect(references).toHaveLength(5);
    expect(openingContent(card, references[1])).toBeNull();
    expect(references[4]).toEqual({ source: 'alternate_greetings', index: 3 });
    expect(openingContent(card, references[4])).toBe('Hello.');
  });

  it.each(['走。', '“嗯。”', 'Hi.', '# The door opens'])('does not reject short or heading-form narration: %s', text => {
    expect(inspectOpening({ first_mes: text }, reference).kind).toBe('narrative');
  });

  it('distinguishes setup-only headings, empty fields and interactive directories', () => {
    expect(inspectOpening({ first_mes: '<VariableInsert>{"secret":3}</VariableInsert>[开场白]' }, reference)).toMatchObject({ kind: 'initialization', preview: '[开场白]' });
    expect(inspectOpening({ first_mes: null }, reference).kind).toBe('empty');
    expect(inspectOpening({ first_mes: '<button onclick="start()">选择开场</button>' }, reference).kind).toBe('directory');
    expect(inspectOpening({ first_mes: 'Your balance is {{getvar::cash}}.' }, reference).kind).toBe('review');
    expect(inspectOpening({ first_mes: '{{user}} meets {{char}}.' }, reference).kind).toBe('narrative');
  });

  it('removes hidden blocks before truncation and keeps original input untouched', () => {
    const card = { first_mes: `<VariableInsert>${'hidden'.repeat(2000)}</VariableInsert><p>Visible &amp; clear.</p><script>secret()</script><!-- hidden -->` };
    const before = JSON.stringify(card);
    expect(inspectOpening(card, reference).preview).toBe('Visible & clear.');
    expect(JSON.stringify(card)).toBe(before);
    expect(openingDisplayText('Visible<script>unfinished secret')).toBe('Visible');
    expect(openingDisplayText('&#999999999;')).toBe('&#999999999;');
  });

  it('excludes an explicitly declared text-only opening menu from narrative introductions', () => {
    const card = { first_mes: '#右滑启动开局，这个是目录#这个不是用来玩的！必须点击右下角开启开局。', alternate_greetings: ['门开了。'] };
    expect(inspectOpening(card, reference).kind).toBe('directory');
    expect(storyIntroduction('', card)).toEqual({ text: '门开了。', source: 'opening', reference: { source: 'alternate_greetings', index: 0 } });
    expect(inspectOpening({ first_mes: '他翻开目录，点击屏幕上的开场故事。' }, reference).kind).toBe('narrative');
  });

  it('keeps an explicit promotional cover out of playable openings without removing ordinary narration', () => {
    const card = { first_mes: '本角色卡分享于以下社区。本模板由作者提供。点击右箭头开始正文内容→', alternate_greetings: ['门外传来了敲门声。'] };
    expect(inspectOpening(card, reference).kind).toBe('directory');
    expect(storyIntroduction('', card).reference).toEqual({ source: 'alternate_greetings', index: 0 });
    expect(inspectOpening({ first_mes: '他在角色卡发布地址看到一行通知，然后回家了。' }, reference).kind).toBe('narrative');
    expect(inspectOpening({ first_mes: '他点击右箭头进入正文，故事开始了。' }, reference).kind).toBe('narrative');
  });

  it('uses authored descriptions first and never mines hidden background for an introduction', () => {
    const card = { first_mes: '<VariableInsert>private</VariableInsert>', alternate_greetings: ['公开开场。'], personality: 'PRIVATE', scenario: 'SPOILER' };
    expect(storyIntroduction('My edited introduction', card)).toEqual({ text: 'My edited introduction', source: 'description' });
    expect(storyIntroduction('', card)).toEqual({ text: '公开开场。', source: 'opening', reference: { source: 'alternate_greetings', index: 0 } });
    expect(storyIntroduction('', { personality: 'PRIVATE', scenario: 'SPOILER' })).toEqual({ text: '', source: 'missing' });
  });

  it('validates references, preserving compatibility for snapshots without a selection', () => {
    expect(openingSelectionSchema.safeParse({ ...selection, reference: { source: 'first_mes', index: 2 } }).success).toBe(false);
    expect(openingSelectionSchema.safeParse({ ...selection, reference: { source: 'alternate_greetings', index: -1 } }).success).toBe(false);
    expect(openingSelectionSchema.safeParse({ ...selection, raw: 'injected' }).success).toBe(false);
    const character = { id: characterId, name: 'Story', description: null, avatarUrl: null, promptTemplate: null,
      cardData: { first_mes: 'First', alternate_greetings: ['Second'] } };
    const snapshot = { protocol: 1, revision: 'b'.repeat(64), capturedAt: '2026-10-26T00:00:00.000Z', characters: [character] };
    expect(storyContentSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(storyContentSnapshotSchema.safeParse({ ...snapshot, characters: [{ ...character, opening: { ...selection, characterId: '00000000-0000-4000-8000-000000000002' } }] }).success).toBe(false);
    expect(storyCharacterPreview(character, 0).cardData.alternate_greetings).toEqual(['Second']);
    expect(storyCharacterPreview({ ...character, opening: { ...selection, reference: { source: 'alternate_greetings', index: 0 } } }, 0).cardData)
      .toEqual({ first_mes: 'Second', alternate_greetings: [] });
    expect(storyCharacterPreview({ ...character, opening: { ...selection, reference: { source: 'none', index: 0 } } }, 0).cardData)
      .toEqual({ first_mes: '', alternate_greetings: [] });
  });
});
