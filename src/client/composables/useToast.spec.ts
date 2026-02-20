import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, provide, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useToast } from './useToast';

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

  it('falls back to default context when no provider exists', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let result: ReturnType<typeof useToast>;
    const Comp = defineComponent({
      setup() {
        result = useToast();
        return () => h('div');
      },
    });
    mount(Comp);
    // Should not throw, just warn
    expect(() => result!.success('test')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ToastContainer not found'));
    warnSpy.mockRestore();
  });
});
