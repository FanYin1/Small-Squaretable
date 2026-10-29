import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useStoryIdentity } from './useStoryIdentity';
import { userPersonaApi, type UserPersona } from '@client/services/user-persona.api';
import { ApiError } from '@client/services/api';
import type { Chat, User } from '@client/types';

vi.mock('@client/services/user-persona.api', () => ({ userPersonaApi: { getById: vi.fn() } }));

describe('story identity resolution', () => {
  const scopes: ReturnType<typeof effectScope>[] = [];
  const persona = { id: 'persona-a', name: 'Traveler' } as UserPersona;

  function setup(personaId?: string) {
    const chat = ref<Chat | null>({ id: 'story-a', personaId } as Chat);
    const user = ref<User | null>({ id: 'account-a', tenantId: 'tenant-a', name: 'Account' } as User);
    const scope = effectScope();
    scopes.push(scope);
    return { chat, user, scope, ...scope.run(() => useStoryIdentity(() => chat.value, () => user.value))! };
  }

  beforeEach(() => vi.resetAllMocks());
  afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));

  const snapshot = {
    protocol: 1 as const, source: 'persona' as const,
    userId: '550e8400-e29b-41d4-a716-446655440001', tenantId: '550e8400-e29b-41d4-a716-446655440002',
    sourceId: '550e8400-e29b-41d4-a716-446655440003', name: 'Original traveler', description: 'Keeps promises',
    revision: 'a'.repeat(64), capturedAt: '2026-10-23T00:00:00.000Z',
  };

  it('keeps the starting name after account edits and persona deletion', () => {
    const identity = setup();
    identity.user.value = { ...identity.user.value!, id: snapshot.userId, tenantId: snapshot.tenantId };
    identity.chat.value = { ...identity.chat.value!, personaId: null, identitySnapshot: snapshot };
    identity.user.value = { ...identity.user.value, name: 'Edited account' };
    expect(identity.name.value).toBe('Original traveler');
    expect(userPersonaApi.getById).not.toHaveBeenCalled();
  });

  it('does not show another account’s retained snapshot', () => {
    const identity = setup();
    identity.chat.value = { ...identity.chat.value!, identitySnapshot: snapshot };
    expect(identity.name.value).toBeNull();
    expect(identity.failed.value).toBe(true);
    expect(userPersonaApi.getById).not.toHaveBeenCalled();
  });

  it('rejects an unsupported snapshot instead of falling back to the current account', () => {
    const identity = setup();
    identity.chat.value = { ...identity.chat.value!, identitySnapshot: { ...snapshot, protocol: 2 } as never };
    expect(identity.name.value).toBeNull();
    expect(identity.failed.value).toBe(true);
  });

  it('ignores a late legacy persona response after switching to a fixed identity', async () => {
    let finish!: (value: UserPersona) => void;
    vi.mocked(userPersonaApi.getById).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const identity = setup();
    identity.user.value = { ...identity.user.value!, id: snapshot.userId, tenantId: snapshot.tenantId };
    identity.chat.value = { ...identity.chat.value!, personaId: 'old-persona' };
    identity.chat.value = { ...identity.chat.value!, id: 'story-fixed', identitySnapshot: snapshot };
    finish(persona);
    await flushPromises();
    expect(identity.name.value).toBe('Original traveler');
  });

  it('uses the account name without requesting a default identity when none was chosen', () => {
    const identity = setup();
    expect(identity.name.value).toBe('Account');
    expect(userPersonaApi.getById).not.toHaveBeenCalled();
    identity.user.value = null;
    expect(identity.name.value).toBe('User');
  });

  it('waits for the saved identity before showing its name', async () => {
    vi.mocked(userPersonaApi.getById).mockResolvedValue(persona);
    const identity = setup('persona-a');
    expect(identity.name.value).toBeNull();
    expect(identity.loading.value).toBe(true);
    await flushPromises();
    expect(identity.name.value).toBe('Traveler');
    expect(userPersonaApi.getById).toHaveBeenCalledWith('persona-a');
  });

  it('keeps transient errors visible and allows retry', async () => {
    vi.mocked(userPersonaApi.getById).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(persona);
    const identity = setup('persona-a');
    await flushPromises();
    expect(identity.failed.value).toBe(true);
    expect(identity.name.value).toBeNull();
    await identity.reload();
    expect(identity.failed.value).toBe(false);
    expect(identity.name.value).toBe('Traveler');
  });

  it('falls back to the account only when the identity is confirmed missing', async () => {
    vi.mocked(userPersonaApi.getById).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'deleted'));
    const identity = setup('persona-a');
    await flushPromises();
    expect(identity.name.value).toBe('Account');
    expect(identity.failed.value).toBe(false);
  });

  it('ignores a late response after switching to a story without an identity', async () => {
    let resolve!: (value: UserPersona) => void;
    vi.mocked(userPersonaApi.getById).mockReturnValue(new Promise(done => { resolve = done; }));
    const identity = setup('persona-a');
    identity.chat.value = { id: 'story-b' } as Chat;
    expect(identity.name.value).toBe('Account');
    resolve(persona);
    await flushPromises();
    expect(identity.name.value).toBe('Account');
  });

  it('isolates overlapping requests across account changes', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(userPersonaApi.getById)
      .mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }))
      .mockResolvedValueOnce({ ...persona, name: 'Another traveler' });
    const identity = setup('persona-a');
    identity.user.value = { id: 'account-b', tenantId: 'tenant-b', name: 'Other account' } as User;
    await flushPromises();
    reject(new Error('old failure'));
    await flushPromises();
    expect(identity.name.value).toBe('Another traveler');
    expect(identity.failed.value).toBe(false);
  });

  it('ignores pending responses after disposal', async () => {
    let resolve!: (value: UserPersona) => void;
    vi.mocked(userPersonaApi.getById).mockReturnValue(new Promise(done => { resolve = done; }));
    const identity = setup('persona-a');
    identity.scope.stop();
    resolve(persona);
    await flushPromises();
    expect(identity.name.value).toBeNull();
  });
});
