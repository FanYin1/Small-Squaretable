import { describe, expect, it } from 'vitest';
import { inspectStoryCapabilities } from './story-capabilities';
import { storyCharacterPreview } from './story-content';
import { storyExamples } from './story-examples';

describe('card capability diagnostics', () => {
  it.each(['TavernHelper_scripts', 'TavernHelper', 'tavern_helper', 'scripts'])('recognizes %s without executing or exposing payloads', key => {
    const card = { extensions: { [key]: [{ content: 'PRIVATE_SCRIPT', enabled: false }] } };
    const result = inspectStoryCapabilities(card);
    expect(result.scripted).toBe(true);
    expect(result.issues).toContain('author_scripts');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SCRIPT');
  });
  it.each([null, [], {}, false])('does not claim empty declarations are scripts: %s', value => {
    expect(inspectStoryCapabilities({ extensions: { tavern_helper: value } }).scripted).toBe(false);
  });
  it('recognizes raw V3 and ignores stale nested copies in normalized cards', () => {
    expect(inspectStoryCapabilities({ spec: 'chara_card_v3', data: { extensions: { TavernHelper_scripts: ['script'] } } }).scripted).toBe(true);
    expect(inspectStoryCapabilities({ name: 'Edited', data: { extensions: { scripts: ['old'] } } }).scripted).toBe(false);
  });
  it('detects inline author script clues without requiring an extension alias', () => {
    expect(inspectStoryCapabilities({ first_mes: '<html><script>author()</script></html>' }).issues).toContain('author_scripts');
  });
  it.each(['personality', 'system_prompt', 'post_history_instructions', 'creator_notes'])('scans %s without exposing its body', field => {
    const result = inspectStoryCapabilities({ [field]: 'PRIVATE <script>hidden()</script> <UpdateVariable>' });
    expect(result.issues).toContain('author_scripts');
    expect(result.issues).toContain('variable_framework');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it.each(['alternate_greetings', 'group_only_greetings'])('scans all supported %s', field => {
    expect(inspectStoryCapabilities({ [field]: ['Plain', '<script>hidden()</script>'] }).scripted).toBe(true);
  });
  it('scans embedded books, active bound content and depth prompts', () => {
    expect(inspectStoryCapabilities({ character_book: { entries: [{ content: '<UpdateVariable>' }] } }).issues).toContain('variable_framework');
    expect(inspectStoryCapabilities({}, [{ content: '<script>hidden()</script>' }]).scripted).toBe(true);
    expect(inspectStoryCapabilities({ extensions: { depth_prompt: { prompt: '<script>hidden()</script>' } } }).scripted).toBe(true);
  });
  it('does not claim a complete scan after its bounded inspection budget', () => {
    expect(inspectStoryCapabilities({ description: 'x'.repeat(1_000_001), first_mes: '' }).issues).toContain('scan_incomplete');
    expect(inspectStoryCapabilities({ alternate_greetings: Array(1001).fill('') }).issues).toContain('scan_incomplete');
  });
  it('distinguishes active regex, variable hints, assets and unknown extensions', () => {
    const result = inspectStoryCapabilities({ first_mes: '<UpdateVariable>', assets: [{}], extensions: { regex_scripts: [{ disabled: false }], privateExtension: { secret: true } } });
    expect(result.issues).toEqual(['regex_rules', 'variable_framework', 'external_assets', 'unknown_extensions']);
    expect(inspectStoryCapabilities({ extensions: { regex_scripts: [{ disabled: true }] } }).issues).toEqual([]);
  });
  it('reports native mechanisms without fabricating state for a plain card', () => {
    expect(inspectStoryCapabilities(storyExamples[0].cardData)).toMatchObject({ native: true, map: true, invalid: false });
    expect(inspectStoryCapabilities(storyExamples[1].cardData)).toMatchObject({ native: true, map: false });
    expect(inspectStoryCapabilities({ name: 'Plain' })).toMatchObject({ native: false, map: false, issues: [] });
  });
  it('exports only derived capability flags beside the existing public opening preview', () => {
    const preview = storyCharacterPreview({ id: '10000000-0000-4000-8000-000000000001', name: 'Card', description: null, avatarUrl: null, promptTemplate: null,
      cardData: { first_mes: 'Public opening', extensions: { TavernHelper_scripts: [{ content: 'PRIVATE_BODY' }] }, personality: 'PRIVATE_PERSONALITY' } }, 0);
    expect(preview.compatibility.scripted).toBe(true);
    expect(JSON.stringify(preview)).not.toContain('PRIVATE_');
    expect(preview.cardData).toEqual({ first_mes: 'Public opening', alternate_greetings: [] });
  });
});
