import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { creditsApi } from '@client/services/credits.api';
import { useStoryCredits } from './useStoryCredits';

vi.mock('@client/services/credits.api', () => ({ creditsApi: { getBalance: vi.fn(), getLedger: vi.fn() } }));

const balance = { billingMode: 'credits' as const, tokensPerPoint: 10000, balanceTokens: 20000, heldTokens: 0, availableTokens: 20000, balancePoints: 2, availablePoints: 2 };
const charge = { id: 'entry', kind: 'charge' as const, tokens: -120, points: -0.012, chatId: 'story', messageId: 42, createdAt: '' };
let scope: ReturnType<typeof effectScope>;

function setup() {
  const owner = ref<string | null>('tenant:user');
  const chat = ref<string | undefined>('story');
  const busy = ref(false);
  const revision = ref(0);
  scope = effectScope();
  const credits = scope.run(() => useStoryCredits(() => owner.value, () => chat.value, () => busy.value, () => revision.value))!;
  return { owner, chat, busy, revision, credits };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(creditsApi.getBalance).mockResolvedValue(balance);
  vi.mocked(creditsApi.getLedger).mockResolvedValue({ items: [charge], pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false } });
});
afterEach(() => { scope?.stop(); vi.useRealTimers(); });

describe('story credits', () => {
  it('does not block a zero-balance account with an explicit exemption', async () => {
    vi.mocked(creditsApi.getBalance).mockResolvedValue({ ...balance, unlimited: true, availableTokens: 0, availablePoints: 0 });
    const { credits } = setup();
    await flushPromises();
    expect(credits.blocked.value).toBe(false);
  });
  it('shows server amounts and queries only the selected story', async () => {
    const { credits } = setup();
    await flushPromises();
    expect(credits.balance.value?.availablePoints).toBe(2);
    expect(credits.latest.value).toEqual(charge);
    expect(creditsApi.getLedger).toHaveBeenCalledWith({ chatId: 'story', page: 1, limit: 10 });
  });

  it('hides the ledger for subscription billing', async () => {
    vi.mocked(creditsApi.getBalance).mockResolvedValue({ ...balance, billingMode: 'subscription' });
    setup();
    await flushPromises();
    expect(creditsApi.getLedger).not.toHaveBeenCalled();
  });

  it('ignores late results after logout or story changes', async () => {
    let resolveBalance!: (value: typeof balance) => void;
    vi.mocked(creditsApi.getBalance).mockReturnValueOnce(new Promise(resolve => { resolveBalance = resolve; }));
    const { owner, credits } = setup();
    owner.value = null;
    resolveBalance(balance);
    await flushPromises();
    expect(credits.balance.value).toBeNull();
    expect(creditsApi.getLedger).not.toHaveBeenCalled();
  });

  it('does not attribute an older story ledger response to the current story', async () => {
    let resolveLedger!: (value: Awaited<ReturnType<typeof creditsApi.getLedger>>) => void;
    vi.mocked(creditsApi.getLedger).mockReturnValueOnce(new Promise(resolve => { resolveLedger = resolve; }));
    const { chat, owner, credits } = setup();
    await flushPromises();
    chat.value = 'other';
    owner.value = null;
    resolveLedger({ items: [charge], pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false } });
    await flushPromises();
    expect(credits.latest.value).toBeNull();
  });

  it('refreshes held funds during generation and after a settlement event', async () => {
    const { busy, revision, credits } = setup();
    await flushPromises();
    vi.mocked(creditsApi.getBalance).mockResolvedValue({ ...balance, heldTokens: 5000, availableTokens: 15000, availablePoints: 1.5 });
    busy.value = true;
    await nextTick();
    await flushPromises();
    expect(credits.balance.value?.heldTokens).toBe(5000);
    vi.mocked(creditsApi.getBalance).mockResolvedValue(balance);
    revision.value += 1;
    await nextTick();
    await flushPromises();
    expect(credits.balance.value?.heldTokens).toBe(0);
    scope.stop();
    const calls = vi.mocked(creditsApi.getBalance).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(creditsApi.getBalance).toHaveBeenCalledTimes(calls);
  });

  it('blocks empty balances and offers a recoverable failure instead of a guessed charge', async () => {
    vi.mocked(creditsApi.getBalance).mockResolvedValue({ ...balance, availableTokens: 0, availablePoints: 0 });
    const { credits } = setup();
    await flushPromises();
    expect(credits.blocked.value).toBe(true);
    vi.mocked(creditsApi.getBalance).mockRejectedValueOnce(new Error('offline'));
    await credits.refresh();
    expect(credits.failed.value).toBe(true);
    expect(credits.blocked.value).toBe(false);
    await credits.refresh();
    expect(credits.failed.value).toBe(false);
  });
});
