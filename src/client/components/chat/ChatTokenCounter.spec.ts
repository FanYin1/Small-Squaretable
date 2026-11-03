import { beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
const state = vi.hoisted(() => ({ chat: {} as any }));
vi.mock('@client/stores/chat', () => ({ useChatStore: () => state.chat }));
vi.mock('@client/stores/characterIntelligence', () => ({ useCharacterIntelligenceStore: () => ({ memories: [] }) }));
import ChatTokenCounter from './ChatTokenCounter.vue';

beforeEach(() => {
  state.chat = reactive({ availableModels: [{ id: 'alias', contextWindow: 200000, maxInputTokens: 150000, maxOutputTokens: 10000 }],
    currentModel: 'alias', messages: [], currentCharacter: null });
});
it('labels estimates and reacts to configured input/output limits', async () => {
  const wrapper = mount(ChatTokenCounter, { global: { stubs: {
    'el-popover': { template: '<section><slot name="reference" /><slot /></section>' },
    'el-progress': true, 'el-icon': true, 'el-tag': { template: '<span><slot /></span>' }, 'el-button': true,
  } } });
  expect(wrapper.text()).toContain('页面文字估算');
  expect(wrapper.text()).toContain('10000 token');
  expect(wrapper.get('.available').text()).toBe('149900');
  state.chat.availableModels[0].maxOutputTokens = 128000;
  await wrapper.vm.$nextTick();
  expect(wrapper.get('.available').text()).toBe('71900');
  state.chat.currentModel = 'unavailable';
  await wrapper.vm.$nextTick();
  expect(wrapper.get('.available').text()).toBe('未知');
  wrapper.unmount();
});
