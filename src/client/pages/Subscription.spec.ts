import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import Subscription from './Subscription.vue';
import i18n from '../i18n';

const mocks = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), status: vi.fn() }));
let store: any;
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { success: 'true' } }) }));
vi.mock('@client/stores/subscription', () => ({ useSubscriptionStore: () => store }));
vi.mock('@client/stores/usage', () => ({ useUsageStore: () => ({ fetchQuota: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock('@client/composables/useToast', () => ({ useToast: () => mocks }));

function render() {
  return mount(Subscription, { global: { plugins: [i18n], stubs: {
    ExplorationLayout: { template: '<main><slot /></main>' },
    CreditsBalance: { template: '<div />', mounted() { this.$emit('mode', 'subscription'); } },
    UsageDashboard: true,
    ElButton: { template: '<button><slot /></button>' },
    ElIcon: true,
    ElSkeleton: true,
    ElSkeletonItem: true,
    ElCollapse: true,
  } } });
}

describe('Subscription account confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = reactive({ subscription: null, config: null, error: null, currentPlan: 'free', fetchStatus: mocks.status, fetchConfig: vi.fn().mockResolvedValue(undefined) });
    mocks.status.mockResolvedValue(undefined);
  });

  it('does not announce successful payment based on a query parameter', async () => {
    const wrapper = render();
    await flushPromises();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith(i18n.global.t('subscription.checkoutReturned'));
    wrapper.unmount();
  });

  it('shows a retry instead of an inferred free plan when entitlement loading fails', async () => {
    mocks.status.mockImplementation(async () => { store.error = 'offline'; throw new Error('offline'); });
    const wrapper = render();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('subscription.statusLoadFailed'));
    expect(wrapper.find('.current-status-section').exists()).toBe(false);
    wrapper.unmount();
  });
});
