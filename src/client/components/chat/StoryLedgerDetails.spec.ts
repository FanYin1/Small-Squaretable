import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StoryLedgerDetails from './StoryLedgerDetails.vue';
import { projectStoryLedger } from '../../utils/story-ledger';
import { ledgerFixture } from '../../utils/fixtures/story-ledger';

describe('merchant ledger details', () => {
  it('labels model descriptions, preserves estimates, defaults long sections closed and provides exact raw text', async () => {
    const ledger = projectStoryLedger(ledgerFixture).ledger!;
    const wrapper = mount(StoryLedgerDetails, { props: { busy: true, snapshot: { messageId: '42', version: 3, opening: false, ledger } } });
    expect(wrapper.text()).toContain('模型描述 · 未经规则核验');
    expect(wrapper.text()).toContain('第 3 轮');
    expect(wrapper.text()).toContain('保留此前已保存');
    expect(wrapper.get('pre').text()).toBe(ledgerFixture);
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.findAll('details')[2].attributes('open')).toBeUndefined();
    expect(wrapper.text()).toContain('预计日收益:5文');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('source')).toEqual([[42]]);
    await wrapper.setProps({ snapshot: { messageId: '1', opening: true, ledger }, busy: false });
    expect(wrapper.text()).toContain('开局记录 · 不代表当前余额');
    wrapper.unmount();
  });
});
