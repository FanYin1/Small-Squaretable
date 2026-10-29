import { describe, expect, it } from 'vitest';
import { compileOpeningRecord, openingRecordAdapter, reviewedOpeningAdapters } from './story-opening-record.service';
import { openingRecordSchema } from '../../types/story-opening-record';
import { storyContentSnapshotSchema } from '../../types/story-content';

const reference = { source: 'alternate_greetings' as const, index: 2 };
const json = (value = '1000', name = '{{user}}') => `<VariableInsert>{"指挥官系统":{"基础信息":{"姓名":"${name}","信用点":${value}}},"秘密":{"数值":42}}</VariableInsert>`;
const yaml = (value = '1000') => `<UpdateVariable>\n<initvar>\n\`\`\`yaml\n核心角色:\n  主角:\n    金钱: ${value}\n  其他人:\n    金钱: 80\n\`\`\`\n</initvar>\n</UpdateVariable>`;
const compileJson = (raw: string) => compileOpeningRecord(reviewedOpeningAdapters[0], raw, reference);
const compileYaml = (raw: string) => compileOpeningRecord(reviewedOpeningAdapters[1], raw, reference);

describe('reviewed opening records', () => {
  it('records only the reviewed player field with exact opening source and digest', () => {
    const raw = json();
    const result = compileJson(raw);
    expect(result).toMatchObject({ status: 'initial-only', reason: 'recorded', fields: [{ label: '信用点', value: 1000, path: ['指挥官系统', '基础信息', '信用点'] }] });
    expect(result.source.opening).toEqual(reference);
    expect(result.source.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('秘密');
    expect(compileJson(json('0')).fields[0].value).toBe(0);
    expect(compileJson(json('2000')).source.digest).not.toBe(result.source.digest);
  });
  it('parses reviewed YAML including CRLF without reading another character balance', () => {
    expect(compileYaml(yaml().replace(/\n/g, '\r\n'))).toMatchObject({ status: 'initial-only', fields: [{ id: 'opening-money', value: 1000 }] });
  });
  it.each(['null', '"1000"', 'true', '{}', '[]', '1e999', '9007199254740992', '1.25'])('rejects an invalid or imprecise quantity %s', value => {
    expect(compileJson(json(value))).toMatchObject({ status: 'unavailable', fields: [] });
  });
  it('rejects duplicate JSON keys even when JSON.parse would keep the last value', () => {
    expect(compileJson(json('1,"信用点":2')).reason).toBe('invalid-initialization');
  });
  it.each(['1\n    金钱: 2', '&money 1000\n  其他人:\n    金钱: *money', '!!str 1000', '!unsafe 1000', '.inf'])('rejects YAML ambiguity and unsupported typing %s', value => {
    expect(compileYaml(yaml(value))).toMatchObject({ status: 'unavailable', fields: [] });
  });
  it('does not infer player ownership from a fixed NPC name', () => {
    expect(compileJson(json('1000', 'Someone'))).toMatchObject({ status: 'unavailable', reason: 'player-unverified', fields: [] });
  });
  it('refuses missing, repeated, malformed and later updated initialization', () => {
    expect(compileJson('A balance of 1000 was promised.').reason).toBe('missing-initialization');
    expect(compileJson(json() + json()).reason).toBe('invalid-initialization');
    expect(compileJson(json() + '<VariableInsert>').reason).toBe('invalid-initialization');
    expect(compileJson(json() + '<VariableEdit>change()</VariableEdit>').reason).toBe('unsupported-update');
    expect(compileYaml(yaml().replace('</initvar>', 'run();</initvar>')).reason).toBe('invalid-initialization');
  });
  it('does not execute scripts or accept a script pretending to be JSON', () => {
    expect(compileJson('<VariableInsert>globalThis.stolen = 1</VariableInsert>').status).toBe('unavailable');
    expect(compileJson(json() + 'x'.repeat(256001)).status).toBe('unavailable');
  });
  it('requires a reviewed active display template and keeps unknown formats unsupported', () => {
    expect(openingRecordAdapter({ extensions: { regex_scripts: [{ replaceString: 'unknown template' }] } })).toBeNull();
    expect(compileOpeningRecord(null, json(), reference)).toMatchObject({ status: 'unsupported', fields: [] });
  });
  it('does not silently choose between native rules and external initialization', () => {
    expect(compileOpeningRecord(null, json(), reference, true)).toMatchObject({ status: 'conflict', reason: 'native-conflict', fields: [] });
    expect(compileOpeningRecord(null, 'A quiet morning.', reference, true).status).toBe('native');
  });
  it('validates record fields and binds frozen records to the exact selected source', () => {
    const record = compileJson(json());
    expect(openingRecordSchema.safeParse({ ...record, status: 'unsupported' }).success).toBe(false);
    expect(openingRecordSchema.safeParse({ ...record, fields: [{ ...record.fields[0], value: 1.5 }] }).success).toBe(false);
    const characterId = '00000000-0000-4000-8000-000000000001';
    const character = { id: characterId, name: 'Example', description: null, avatarUrl: null, promptTemplate: null,
      cardData: { alternate_greetings: ['', '', json()] }, opening: { characterId, revision: 'a'.repeat(64), reference, reviewed: false }, openingRecord: record };
    const snapshot = { protocol: 1, revision: 'a'.repeat(64), capturedAt: '2026-10-26T00:00:00.000Z', characters: [character] };
    expect(storyContentSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(storyContentSnapshotSchema.safeParse({ ...snapshot, characters: [{ ...character, openingRecord: { ...record, source: { ...record.source, opening: { ...reference, index: 1 } } } }] }).success).toBe(false);
    expect(storyContentSnapshotSchema.safeParse({ ...snapshot, characters: [{ ...character, opening: undefined }] }).success).toBe(false);
  });
});
