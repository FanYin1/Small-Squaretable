import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useStoryCreationRecovery } from './useStoryCreationRecovery';
import { chatApi } from '@client/services/chat.api';

vi.mock('@client/services/chat.api', () => ({ chatApi: { getCreationStatus: vi.fn() } }));

describe('story creation recovery ownership', () => {
  let scope: EffectScope;
  const requestId = '550e8400-e29b-41d4-a716-446655440003';
  beforeEach(() => { sessionStorage.clear(); vi.resetAllMocks(); scope = effectScope(); });
  afterEach(() => scope.stop());

  it('persists before submission and clears only a definite rejection', () => {
    const recovery = scope.run(() => useStoryCreationRecovery(ref('owner')))!;
    const operation = recovery.begin(requestId)!;
    expect(JSON.parse(sessionStorage.getItem('story-creation:owner')!)).toEqual({ version: 1, requestId });
    expect(recovery.begin(crypto.randomUUID())).toBeNull();
    operation.rejected();
    expect(sessionStorage.getItem('story-creation:owner')).toBeNull();
    expect(recovery.pending.value).toBeNull();
  });

  it('isolates pending data and late creation results across owner changes', () => {
    const owner = ref<string | null>('first');
    const recovery = scope.run(() => useStoryCreationRecovery(owner))!;
    const operation = recovery.begin(requestId)!;
    owner.value = 'second';
    operation.created('private-story');
    expect(recovery.pending.value).toBeNull();
    expect(sessionStorage.getItem('story-creation:second')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('story-creation:first')!)).not.toHaveProperty('chatId');
  });

  it('ignores a lookup response after the account or tenant changes', async () => {
    let resolve!: (result: { protocol: 1; status: 'created'; chatId: string }) => void;
    vi.mocked(chatApi.getCreationStatus).mockReturnValue(new Promise(result => { resolve = result; }));
    sessionStorage.setItem('story-creation:first', JSON.stringify({ version: 1, requestId }));
    const owner = ref<string | null>('first');
    const recovery = scope.run(() => useStoryCreationRecovery(owner))!;
    owner.value = 'second';
    resolve({ protocol: 1, status: 'created', chatId: 'private-story' });
    await flushPromises();
    expect(recovery.pending.value).toBeNull();
    expect(recovery.checking.value).toBe(false);
    expect(sessionStorage.getItem('story-creation:second')).toBeNull();
  });

  it('keeps the original persisted request when a response arrives after unmount', () => {
    const recovery = scope.run(() => useStoryCreationRecovery(ref('owner')))!;
    const operation = recovery.begin(requestId)!;
    scope.stop();
    operation.created('late-story');
    expect(JSON.parse(sessionStorage.getItem('story-creation:owner')!)).toEqual({ version: 1, requestId });
  });

  it('blocks replacement of a malformed persisted request', () => {
    sessionStorage.setItem('story-creation:owner', '{broken');
    const recovery = scope.run(() => useStoryCreationRecovery(ref('owner')))!;
    expect(recovery.storageAvailable.value).toBe(false);
    expect(recovery.begin(requestId)).toBeNull();
    expect(sessionStorage.getItem('story-creation:owner')).toBe('{broken');
  });
});
