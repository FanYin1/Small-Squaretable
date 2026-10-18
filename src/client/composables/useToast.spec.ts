import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, provide, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useToast, toastStore } from './useToast';
import ToastContainer from '../components/ui/ToastContainer.vue';

// Helper to run composable with provide/inject context
function withToastProvider(mockAddToast: ReturnType<typeof vi.fn>) {
  let result: ReturnType<typeof useToast>;
  const Wrapper = defineComponent({
    setup() {
      provide('toast', { addToast: mockAddToast, removeToast: vi.fn() });
      return () =>
        h(
          defineComponent({
            setup() {
              result = useToast();
              return () => h('div');
            },
          }),
        );
    },
  });
  mount(Wrapper);
  return result!;
}

describe('useToast', () => {
  let mockAddToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAddToast = vi.fn();
  });

  it('success() calls addToast with type success and default duration 3000', () => {
    const toast = withToastProvider(mockAddToast);
    toast.success('Done');
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Done', duration: 3000, closable: true }),
    );
  });

  it('error() calls addToast with type error and default duration 4000', () => {
    const toast = withToastProvider(mockAddToast);
    toast.error('Failed');
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Failed', duration: 4000, closable: true }),
    );
  });

  it('warning() calls addToast with type warning and default duration 3500', () => {
    const toast = withToastProvider(mockAddToast);
    toast.warning('Careful');
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', title: 'Careful', duration: 3500, closable: true }),
    );
  });

  it('info() calls addToast with type info and default duration 3000', () => {
    const toast = withToastProvider(mockAddToast);
    toast.info('FYI');
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info', title: 'FYI', duration: 3000, closable: true }),
    );
  });

  it('passes custom options through to addToast', () => {
    const toast = withToastProvider(mockAddToast);
    const onClick = vi.fn();
    toast.success('Saved', {
      message: 'Record saved successfully',
      duration: 5000,
      closable: false,
      action: { text: 'Undo', onClick },
    });
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'success',
      title: 'Saved',
      message: 'Record saved successfully',
      duration: 5000,
      closable: false,
      action: { text: 'Undo', onClick },
    });
  });

  // App.vue 里 ToastContainer 与 <router-view> 是兄弟节点，页面组件不是它的后代，
  // 拿不到它 provide 的上下文。没有 provider 时必须落到共享队列，而不是静默丢弃。
  it('without a provider, toasts go to the shared queue that ToastContainer renders', () => {
    toastStore.toasts.value = [];
    let result: ReturnType<typeof useToast>;
    const Comp = defineComponent({
      setup() {
        result = useToast();
        return () => h('div');
      },
    });
    mount(Comp);

    result!.error('Register failed', { message: 'Invite code invalid' });

    expect(toastStore.toasts.value).toHaveLength(1);
    expect(toastStore.toasts.value[0]).toMatchObject({
      type: 'error',
      title: 'Register failed',
      message: 'Invite code invalid',
    });
  });

  it('shared queue keeps at most 5 toasts and removeToast drops by id', () => {
    toastStore.toasts.value = [];
    for (let i = 0; i < 7; i++) toastStore.addToast({ type: 'info', title: `t${i}` });

    expect(toastStore.toasts.value.map((t) => t.title)).toEqual(['t2', 't3', 't4', 't5', 't6']);

    toastStore.removeToast(toastStore.toasts.value[0].id);
    expect(toastStore.toasts.value.map((t) => t.title)).toEqual(['t3', 't4', 't5', 't6']);
  });
});

describe('ToastContainer', () => {
  it('renders toasts raised by a component outside its subtree', async () => {
    toastStore.toasts.value = [];
    const Page = defineComponent({
      setup() {
        const toast = useToast();
        return () => h('button', { onClick: () => toast.error('Register failed') });
      },
    });
    // 与 App.vue 相同的结构：页面和 ToastContainer 是兄弟
    const Root = defineComponent({ setup: () => () => h('div', [h(Page), h(ToastContainer)]) });
    const wrapper = mount(Root, { attachTo: document.body, global: { stubs: { teleport: true } } });

    await wrapper.find('button').trigger('click');
    // Toast 在 onMounted 的 requestAnimationFrame 里才置 isVisible，等一帧再等一次渲染
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await nextTick();

    expect(wrapper.find('.toast-title').text()).toBe('Register failed');
    wrapper.unmount();
  });
});
