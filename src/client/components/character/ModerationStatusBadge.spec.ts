/**
 * 作者侧审核状态徽标
 *
 * 发布后角色是 'pending'，公开入口要求 'approved'，所以只显示「已发布/未发布」
 * 会直接骗人：作者以为上线了，实际在排队；被驳回的角色永远不会出现在市场里，
 * 而作者看不到任何解释。
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ModerationStatusBadge from './ModerationStatusBadge.vue';
import zhCN from '@client/i18n/locales/zh-CN.json';

function mountBadge(props: Record<string, unknown>) {
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: { 'zh-CN': zhCN },
  });

  return mount(ModerationStatusBadge, {
    props,
    global: {
      plugins: [i18n],
      stubs: {
        ElTag: { template: '<span class="tag" :data-type="type"><slot /></span>', props: ['type'] },
        ElTooltip: { template: '<span class="tooltip" :data-content="content"><slot /></span>', props: ['content'] },
      },
    },
  });
}

describe('ModerationStatusBadge', () => {
  it('待审核时给出明确文案，而不是沉默的「已发布」', () => {
    const wrapper = mountBadge({ status: 'pending' });
    expect(wrapper.text()).toContain(zhCN.moderation.status.pending);
  });

  it('已通过用成功色', () => {
    const wrapper = mountBadge({ status: 'approved' });
    expect(wrapper.text()).toContain(zhCN.moderation.status.approved);
    expect(wrapper.find('.tag').attributes('data-type')).toBe('success');
  });

  it('被驳回用危险色——这是需要作者动手的状态', () => {
    const wrapper = mountBadge({ status: 'rejected' });
    expect(wrapper.find('.tag').attributes('data-type')).toBe('danger');
  });

  it('管理员下架和作者自己被驳回要能区分开', () => {
    const rejected = mountBadge({ status: 'rejected' });
    const hidden = mountBadge({ status: 'hidden' });
    expect(rejected.text()).not.toBe(hidden.text());
  });

  it('驳回理由透出给作者，否则他不知道改什么', () => {
    const wrapper = mountBadge({ status: 'rejected', note: '过度暴力描写' });
    expect(wrapper.find('.tooltip').attributes('data-content')).toContain('过度暴力描写');
  });

  it('没有理由时不渲染空 tooltip', () => {
    const wrapper = mountBadge({ status: 'rejected' });
    expect(wrapper.find('.tooltip').exists()).toBe(false);
  });

  it('draft 不显示徽标——未发布本来就是默认状态，不需要提示', () => {
    const wrapper = mountBadge({ status: 'draft' });
    expect(wrapper.find('.tag').exists()).toBe(false);
  });

  it('字段缺失（老数据）时也不显示，不能崩', () => {
    const wrapper = mountBadge({});
    expect(wrapper.find('.tag').exists()).toBe(false);
  });

  it('违规分类一并显示，让作者知道触碰了哪条线', () => {
    const wrapper = mountBadge({ status: 'rejected', category: 'violence', note: '说明' });
    expect(wrapper.find('.tooltip').attributes('data-content'))
      .toContain(zhCN.report.categories.violence);
  });
});
