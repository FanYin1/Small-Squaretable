import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StoryIntentReview from './StoryIntentReview.vue';

const candidate = { expectedVersion: 1, input: '买票', intent: { version: 1 as const, disposition: 'proposal' as const,
  steps: [{ kind: 'execute' as const, actionId: 'buy', evidence: '买票' }], facts: [] } };
describe('intent review', () => {
  it('shows the authored label and requires an explicit confirmation click', async () => {
    const wrapper = mount(StoryIntentReview, { props: { candidate, actions: [{ id: 'buy', label: '花20枚买票' }], busy: false, stale: false } });
    expect(wrapper.text()).toContain('花20枚买票');
    expect(wrapper.text()).toContain('尚未执行');
    expect(wrapper.emitted('confirm')).toBeUndefined();
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });
  it.each([{ stale: true, busy: false }, { stale: false, busy: true }])('blocks stale/busy confirmation: %j', flags => {
    const wrapper = mount(StoryIntentReview, { props: { candidate, actions: [], ...flags } });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });
});
