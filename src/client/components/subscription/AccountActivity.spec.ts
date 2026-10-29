import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import AccountActivity from './AccountActivity.vue';
import { creditsApi } from '@client/services/credits.api';
import { useUserStore } from '@client/stores/user';
import enUS from '@client/i18n/locales/en-US.json';

vi.mock('@client/services/credits.api', () => ({ creditsApi: { getBalance: vi.fn(), getActivity: vi.fn(), getLedger: vi.fn() } }));
const balance = { billingMode: 'credits' as const, tokensPerPoint: 10000, balanceTokens: 100000, heldTokens: 2000, availableTokens: 98000, balancePoints: 10, availablePoints: 9.8 };
const summary = { from: '', to: '', spentPoints: 2, creditedPoints: 10, adjustmentPoints: 0, chargeCount: 3, knownUsageCount: 1, unknownUsageCount: 2, inputTokens: 20, outputTokens: 10 };
const ledger = { items: [{ id: 'first', kind: 'charge' as const, tokens: -100, points: -0.01, chatId: null, messageId: null, createdAt: '2026-10-20T00:00:00Z' }], pagination: { page: 1, limit: 10, total: 11, totalPages: 2, hasNext: true, hasPrev: false } };
const wrappers: VueWrapper[] = [];
const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(done => { resolve = done; });
  return { promise, resolve };
};

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const user = useUserStore();
  user.user = { id: 'user-1', tenantId: 'tenant-1', email: 'test@example.test', name: 'Test', createdAt: '' };
  const wrapper = mount(AccountActivity, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })], stubs: { RouterLink: { template: '<a><slot /></a>' } } } });
  wrappers.push(wrapper);
  return { wrapper, user };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(creditsApi.getBalance).mockResolvedValue(balance);
  vi.mocked(creditsApi.getActivity).mockResolvedValue(summary);
  vi.mocked(creditsApi.getLedger).mockResolvedValue(ledger);
});
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('account activity', () => {
  it('shows real balances and partial usage without treating unknown as zero', async () => {
    const { wrapper } = setup();
    await flushPromises();
    expect(wrapper.get('[data-testid="account-available"]').text()).toContain('9.8');
    expect(wrapper.get('[data-testid="account-held"]').text()).toContain('0.2');
    expect(wrapper.get('[data-testid="recorded-usage"]').text()).toContain('1 of 3');
    expect(wrapper.text()).toContain('Usage unknown');
    vi.mocked(creditsApi.getActivity).mockResolvedValue({ ...summary, knownUsageCount: 0, unknownUsageCount: 3, inputTokens: null, outputTokens: null });
    await wrapper.get('[aria-label="Refresh period"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="recorded-usage"]').text()).toContain('Unknown');
  });

  it('keeps summary independent of kind/page and resets page on range change', async () => {
    const { wrapper } = setup();
    await flushPromises();
    await wrapper.get('[aria-label="Next page"]').trigger('click');
    await flushPromises();
    expect(creditsApi.getLedger).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    await wrapper.get('[data-testid="ledger-kind"]').setValue('topup');
    await flushPromises();
    expect(creditsApi.getLedger).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, kind: 'topup' }));
    expect(creditsApi.getActivity).toHaveBeenCalledTimes(1);
    await wrapper.get('#account-period').setValue('7');
    await flushPromises();
    const range = vi.mocked(creditsApi.getActivity).mock.calls.at(-1)![0];
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(7 * 86400000);
    expect(creditsApi.getLedger).toHaveBeenLastCalledWith(expect.objectContaining(range));
  });

  it('ignores out-of-order period responses', async () => {
    const oldSummary = deferred<typeof summary>();
    const oldLedger = deferred<typeof ledger>();
    vi.mocked(creditsApi.getActivity).mockReturnValueOnce(oldSummary.promise);
    vi.mocked(creditsApi.getLedger).mockReturnValueOnce(oldLedger.promise);
    const { wrapper } = setup();
    await flushPromises();
    await wrapper.get('#account-period').setValue('7');
    await flushPromises();
    oldSummary.resolve({ ...summary, inputTokens: 999999 });
    oldLedger.resolve({ ...ledger, items: [{ ...ledger.items[0], points: -999999 }] });
    await flushPromises();
    expect(wrapper.text()).not.toContain('999,999');
  });

  it('ignores a late kind response after the filter changes again', async () => {
    const { wrapper } = setup();
    await flushPromises();
    const late = deferred<typeof ledger>();
    vi.mocked(creditsApi.getLedger).mockReturnValueOnce(late.promise);
    await wrapper.get('[data-testid="ledger-kind"]').setValue('topup');
    await wrapper.get('[data-testid="ledger-kind"]').setValue('charge');
    await flushPromises();
    late.resolve({ ...ledger, items: [{ ...ledger.items[0], points: 999999 }] });
    await flushPromises();
    expect(wrapper.text()).not.toContain('999,999');
    expect(wrapper.get('[data-testid="ledger-kind"]').element).toHaveProperty('value', 'charge');
  });

  it('clears data immediately on account switch and ignores old responses', async () => {
    const late = deferred<typeof summary>();
    vi.mocked(creditsApi.getActivity).mockReturnValueOnce(late.promise);
    const { wrapper, user } = setup();
    await flushPromises();
    vi.mocked(creditsApi.getBalance).mockResolvedValue({ ...balance, billingMode: 'subscription' });
    user.user = { ...user.user!, id: 'user-2', tenantId: 'tenant-2' };
    await flushPromises();
    late.resolve(summary);
    await flushPromises();
    expect(wrapper.text()).toContain('subscription billing');
    expect(wrapper.find('[data-testid="account-available"]').exists()).toBe(false);
    expect(wrapper.find('.activity-ledger').exists()).toBe(false);
    user.user = null;
    await flushPromises();
    expect(wrapper.text()).not.toContain('subscription billing');
  });

  it('never starts child requests after an unmounted balance response', async () => {
    const late = deferred<typeof balance>();
    vi.mocked(creditsApi.getBalance).mockReturnValue(late.promise);
    const { wrapper } = setup();
    wrapper.unmount();
    late.resolve(balance);
    await flushPromises();
    expect(creditsApi.getActivity).not.toHaveBeenCalled();
    expect(creditsApi.getLedger).not.toHaveBeenCalled();
  });

  it('retries a failed balance without displaying a false zero', async () => {
    vi.mocked(creditsApi.getBalance).mockRejectedValueOnce(new Error('offline'));
    const { wrapper } = setup();
    await flushPromises();
    expect(wrapper.find('[data-testid="account-available"]').exists()).toBe(false);
    expect(creditsApi.getActivity).not.toHaveBeenCalled();
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="account-available"]').text()).toContain('9.8');
  });

  it('retries summary and ledger independently', async () => {
    vi.mocked(creditsApi.getActivity).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(creditsApi.getLedger).mockRejectedValueOnce(new Error('offline'));
    const { wrapper } = setup();
    await flushPromises();
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(2);
    await wrapper.findAll('[role="alert"] button')[0].trigger('click');
    await flushPromises();
    expect(creditsApi.getLedger).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-testid="recorded-usage"]').text()).toContain('1 of 3');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(creditsApi.getActivity).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);
  });
});
