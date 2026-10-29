import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StoryAdaptationReport from './StoryAdaptationReport.vue';
import type { StoryAdaptationReport as Report } from '../../../types/story-adaptation';

const report: Report = { version: 1, entryRevision: 'a'.repeat(64), opening: { source: 'first_mes', index: 0 },
  initial: 'recorded', runtime: 'unsupported', findings: [{ code: 'dynamic-pricing', sourceDigests: ['d'.repeat(64)] }] };

describe('compatibility report display', () => {
  it('shows the first task award separately from a wallet or full system support', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report: { ...report, runtime: 'adapted', initial: 'native',
      findings: [], ruleScope: 'stomach-first-task-v1' }, saved: true } });
    expect(wrapper.text()).toContain('一次性奖励2点');
    expect(wrapper.text()).toContain('不代表当前总余额');
    expect(wrapper.text()).toContain('初值条目保持禁用');
    expect(wrapper.text()).toContain('后续动态任务、商城和外部脚本尚未适配');
    expect(wrapper.text()).not.toContain('sans');
    wrapper.unmount();
  });
  it('shows frozen opening choice limits instead of promising experience, ongoing levels or transactions', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report: { ...report, runtime: 'adapted', initial: 'native',
      findings: [], ruleScope: 'sans-opening-modes-v1' }, saved: true } });
    expect(wrapper.text()).toContain('显示的是开局记录');
    expect(wrapper.text()).toContain('击杀经验、后续等级');
    expect(wrapper.text()).toContain('不能在本分支重复选择');
    expect(wrapper.text()).not.toContain('赋值、增减、条件与一次性触发');
    wrapper.unmount();
  });
  it('explains v2 scope without exposing the hidden trigger phrase or promising rewards', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report: { ...report, runtime: 'adapted', initial: 'native',
      findings: [], turnEffect: 'kakaa-ritual-v2' }, saved: true } });
    expect(wrapper.text()).toContain('未触发前隐藏');
    expect(wrapper.text()).toContain('没有自动战斗、交易或一次性奖励');
    expect(wrapper.text()).not.toContain('鸟神');
    wrapper.unmount();
  });
  it('describes the reviewed NPC counter instead of promising unrelated action rules', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report: { ...report, runtime: 'adapted', initial: 'native',
      findings: [], turnEffect: 'kakaa-ritual-v1' }, saved: true } });
    expect(wrapper.text()).toContain('每轮已确认且完整保存的对话后+3');
    expect(wrapper.text()).toContain('不是玩家属性');
    expect(wrapper.text()).toContain('中断和重复回执不计数');
    expect(wrapper.text()).not.toContain('条件与一次性触发');
    wrapper.unmount();
  });
  it('shows limits and historical values without exposing internal source digests', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report } });
    expect(wrapper.get('summary').text()).toContain('当前所选开场');
    expect(wrapper.text()).toContain('不代表当前余额');
    expect(wrapper.text()).toContain('动态系数');
    expect(wrapper.text()).not.toContain('d'.repeat(64));
    expect(wrapper.find('details').attributes('open')).toBeUndefined();
    wrapper.unmount();
  });
  it('distinguishes a saved historical report from a newly computed conclusion', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report, saved: true } });
    expect(wrapper.text()).toContain('不随原卡后续编辑而改变');
    expect(wrapper.get('summary').text()).toContain('开局时的记录');
    wrapper.unmount();
  });
  it('does not present unsupported external findings as native support', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report: { ...report, runtime: 'native' } } });
    expect(wrapper.text()).toContain('不代表外部机制已兼容');
    expect(wrapper.text()).toContain('尚不能自动计算');
    wrapper.unmount();
  });
  it.each(['adapted', 'native'] as const)('describes enabled %s rules without claiming no adaptation exists', runtime => {
    const wrapper = mount(StoryAdaptationReport, { props: { report: { ...report, runtime, initial: 'native', findings: [] }, saved: true } });
    expect(wrapper.text()).toContain('本次冻结');
    expect(wrapper.text()).not.toContain('没有可确认的第三方机制适配结论');
    expect(wrapper.text()).toContain(runtime === 'adapted' ? '一次性触发' : '其他第三方机制仍需验证');
    wrapper.unmount();
  });
  it('keeps unverified rules distinct from a runnable declaration', () => {
    const wrapper = mount(StoryAdaptationReport, { props: { report: { ...report, runtime: 'unverified', findings: [] } } });
    expect(wrapper.text()).toContain('没有可确认的第三方机制适配结论');
    expect(wrapper.text()).not.toContain('按本次冻结版本运行');
    wrapper.unmount();
  });
});
