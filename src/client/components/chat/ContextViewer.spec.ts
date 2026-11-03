import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ContextViewer from './ContextViewer.vue';

it('shows an unavailable state instead of invented conversation or usage', async () => {
  const wrapper = mount(ContextViewer, { props: { chatId: 'synthetic', modelValue: true }, global: { stubs: {
    'el-dialog': { template: '<section><slot /></section>' },
    'el-empty': { props: ['description'], template: '<p>{{ description }}</p>' },
  } } });
  expect(wrapper.text()).toContain('本轮实际上下文详情暂未接入');
  expect(wrapper.text()).not.toMatch(/Alice|55 tokens|glm-4.5-air|128000/);
  await wrapper.setProps({ chatId: 'another-story' });
  expect(wrapper.text()).toContain('不代表已发送给模型的内容');
  wrapper.unmount();
});
