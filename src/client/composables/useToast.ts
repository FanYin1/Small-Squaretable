import { inject, ref } from 'vue';

export interface ToastOptions {
  message?: string;
  duration?: number;
  closable?: boolean;
  action?: {
    text: string;
    onClick: () => void;
  };
}

interface ToastContext {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  closable?: boolean;
  action?: {
    text: string;
    onClick: () => void;
  };
}

const MAX_TOASTS = 5;

/**
 * 全局共享的 toast 队列，ToastContainer 负责渲染。
 *
 * 不能只靠 ToastContainer 的 provide：App.vue 里它和 <router-view> 是兄弟节点，
 * 页面组件不是它的后代，inject 永远拿不到，之前所有 toast 都被静默丢弃了。
 */
const toasts = ref<ToastItem[]>([]);

const sharedContext: ToastContext = {
  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    // 超过上限丢掉最旧的
    toasts.value = [...toasts.value, { ...toast, id }].slice(-MAX_TOASTS);
  },
  removeToast: (id) => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  },
};

export const toastStore = { toasts, ...sharedContext };

export function useToast() {
  // 测试或局部场景仍可 provide('toast', ...) 覆盖
  const toastContext = inject<ToastContext>('toast', sharedContext);

  const addToast = toastContext.addToast;

  const success = (title: string, options: ToastOptions = {}) => {
    addToast({
      type: 'success',
      title,
      message: options.message,
      duration: options.duration ?? 3000,
      closable: options.closable ?? true,
      action: options.action,
    });
  };

  const error = (title: string, options: ToastOptions = {}) => {
    addToast({
      type: 'error',
      title,
      message: options.message,
      duration: options.duration ?? 4000,
      closable: options.closable ?? true,
      action: options.action,
    });
  };

  const warning = (title: string, options: ToastOptions = {}) => {
    addToast({
      type: 'warning',
      title,
      message: options.message,
      duration: options.duration ?? 3500,
      closable: options.closable ?? true,
      action: options.action,
    });
  };

  const info = (title: string, options: ToastOptions = {}) => {
    addToast({
      type: 'info',
      title,
      message: options.message,
      duration: options.duration ?? 3000,
      closable: options.closable ?? true,
      action: options.action,
    });
  };

  return {
    success,
    error,
    warning,
    info,
  };
}
