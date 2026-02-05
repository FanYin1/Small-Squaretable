import { inject, readonly } from 'vue';

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

interface ToastItem {
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

// Create a default no-op context for components used outside the app root
const defaultToastContext: ToastContext = {
  addToast: () => {
    console.warn('ToastContainer not found. Make sure ToastContainer is included in App.vue');
  },
  removeToast: () => {
    // No-op
  },
};

export function useToast() {
  const toastContext = inject<ToastContext>('toast', defaultToastContext);

  const addToast = readonly(toastContext.addToast);

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
