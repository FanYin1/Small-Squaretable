import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageInput from './MessageInput.vue';

describe('MessageInput', () => {
  it('renders component', () => {
    const wrapper = mount(MessageInput, {
      global: {
        stubs: {
          'el-input': {
            template: '<div class="el-input-stub"><textarea /></div>',
          },
          'el-button': {
            template: '<button><slot /></button>',
          },
        },
      },
    });
    expect(wrapper.find('.message-input').exists()).toBe(true);
  });

  it('has correct default props', () => {
    const wrapper = mount(MessageInput, {
      global: {
        stubs: {
          'el-input': true,
          'el-button': true,
        },
      },
    });
    expect(wrapper.props('maxLength')).toBe(4000);
    expect(wrapper.props('rows')).toBe(3);
  });

  it('accepts custom props', () => {
    const wrapper = mount(MessageInput, {
      props: {
        placeholder: 'Custom placeholder',
        maxLength: 2000,
        disabled: true,
      },
      global: {
        stubs: {
          'el-input': true,
          'el-button': true,
        },
      },
    });
    expect(wrapper.props('placeholder')).toBe('Custom placeholder');
    expect(wrapper.props('maxLength')).toBe(2000);
    expect(wrapper.props('disabled')).toBe(true);
  });
});
