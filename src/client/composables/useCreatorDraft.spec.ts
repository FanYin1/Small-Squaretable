import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useCreatorDraft, parseCreatorSnapshot } from './useCreatorDraft';

const snapshot = JSON.stringify([{ name: 'Story', description: '', category: '', tags: [], isNsfw: false, personality: '', scenario: '', systemPrompt: '', firstMessage: '', exampleMessages: '', creatorNotes: '', avatarUrl: '', alternateGreetings: [] }, { extensions: { unknown: { preserved: true } } }, '', {}, {}]);
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('creator draft recovery', () => {
  it('isolates accounts, templates and works using explicit keys', () => {
    const draft = useCreatorDraft();
    draft.open('tenant:author:work');
    draft.persist('baseline', snapshot, false);
    draft.open('tenant:other:work');
    expect(draft.pending.value).toBeNull();
    draft.open('tenant:author:template');
    expect(draft.pending.value).toBeNull();
    draft.open('tenant:author:work');
    expect(draft.pending.value?.draft).toBe(snapshot);
    expect(parseCreatorSnapshot(draft.take()!.draft)[1]).toEqual({ extensions: { unknown: { preserved: true } } });
  });
  it('does not overwrite a pending draft with freshly loaded server data', () => {
    const draft = useCreatorDraft();
    draft.open('work');
    draft.persist('baseline', snapshot, false);
    draft.open('work');
    draft.persist('new', 'new', false);
    expect(JSON.parse(sessionStorage.getItem('work')!).draft).toBe(snapshot);
  });
  it('rejects malformed envelopes and snapshots without claiming recovery', () => {
    for (const value of ['{broken', JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, base: '', draft: '[{}]', uncertain: false })]) {
      sessionStorage.setItem('work', value);
      const draft = useCreatorDraft();
      draft.open('work');
      expect(draft.pending.value).toBeNull();
      expect(draft.failed.value).toBe(true);
    }
  });
  it('reports quota failures and recovers after storage becomes available', () => {
    const draft = useCreatorDraft();
    draft.open('work');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    draft.persist('', snapshot, false);
    expect(draft.failed.value).toBe(true);
    expect(draft.stored.value).toBe(false);
    spy.mockRestore();
    draft.persist('', snapshot, false);
    expect(draft.stored.value).toBe(true);
    draft.clear();
    expect(sessionStorage.getItem('work')).toBeNull();
  });
  it('persists an in-flight creation even when its content equals the baseline', () => {
    const draft = useCreatorDraft();
    draft.open('work');
    draft.persist(snapshot, snapshot, true);
    draft.open('work');
    expect(draft.pending.value?.uncertain).toBe(true);
  });
});
