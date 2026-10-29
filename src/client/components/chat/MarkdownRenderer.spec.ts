import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MarkdownRenderer from './MarkdownRenderer.vue';
import i18n from '../../i18n';

describe('story prose emphasis', () => {
  const render = (content: string, streaming = false) => mount(MarkdownRenderer, {
    props: { content, streaming }, global: { plugins: [i18n], stubs: { SandboxedHtml: true } },
  });

  it.each(['要求是**“连续踏步10分钟，中途不休息”**。', '牢记**连续踏步。**再继续。'])('renders CJK punctuation boundaries without rewriting %s', content => {
    const wrapper = render(content);
    expect(wrapper.find('strong').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('**');
    expect(wrapper.props('content')).toBe(content);
    wrapper.unmount();
  });

  it('keeps code, escaped delimiters, incomplete emphasis and HTML safety boundaries', () => {
    const wrapper = render('要求是**“连续”**。 `**“原样”**` \\*\\*“字面”\\*\\*\n\n```text\n**“代码”**\n```\n\n未闭合**“等待\n\n[**“依据”**](javascript:alert(1))<img src="x" onerror="alert(1)">');
    expect(wrapper.findAll('strong').map(element => element.text())).toEqual(['“连续”', '“依据”']);
    expect(wrapper.findAll('code').map(element => element.text())).toEqual(['**“原样”**', '**“代码”**']);
    expect(wrapper.text()).toContain('**“字面”**');
    expect(wrapper.text()).toContain('未闭合**“等待');
    expect(wrapper.html()).not.toMatch(/href="javascript:|onerror=/);
    wrapper.unmount();
  });

  it('renders streaming emphasis and final prose consistently while retaining the HTML sandbox', async () => {
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
    const wrapper = render('要求是', true);
    try {
      await wrapper.setProps({ content: '要求是**“连续”**。' });
      expect(wrapper.get('strong').text()).toBe('“连续”');
      await wrapper.setProps({ streaming: false, content: '要求是**“连续”**。\n\n<!doctype html><html><body>**“原卡HTML”**</body></html>' });
      expect(wrapper.get('strong').text()).toBe('“连续”');
      expect(wrapper.get('sandboxed-html-stub').attributes('html')).toContain('**“原卡HTML”**');
    } finally { wrapper.unmount(); frame.mockRestore(); }
  });
});

describe('story control blocks in reading', () => {
  it('removes hidden HTML before splitting it into sandboxed segments', () => {
    const content = '<UpdateVariable><!DOCTYPE html><html><body>private payload</body></html></UpdateVariable><content>“欢迎回来。”</content>';
    const wrapper = mount(MarkdownRenderer, { props: { content }, global: { plugins: [i18n], stubs: { SandboxedHtml: true } } });
    expect(wrapper.text()).toBe('“欢迎回来。”');
    expect(wrapper.find('sandboxed-html-stub').exists()).toBe(false);
    expect(wrapper.props('content')).toBe(content);
    wrapper.unmount();
  });

  it('does not reveal an unfinished control payload when the displayed source changes', async () => {
    const wrapper = mount(MarkdownRenderer, { props: { content: '你推开门。<VariableInsert>{"secret":42' }, global: { plugins: [i18n] } });
    expect(wrapper.text()).toBe('你推开门。');
    await wrapper.setProps({ content: '你推开门。<VariableInsert>{"secret":42}</VariableInsert>有人等你。' });
    expect(wrapper.text()).toContain('有人等你。');
    expect(wrapper.text()).not.toContain('secret');
    wrapper.unmount();
  });
});
