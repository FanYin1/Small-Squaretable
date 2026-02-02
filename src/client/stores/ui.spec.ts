import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from './ui';
import '../test-setup';

describe('UI Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.className = '';
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const store = useUiStore();

      expect(store.sidebarCollapsed).toBe(false);
      expect(store.loading).toBe(false);
      expect(store.loadingText).toBe('');
    });

    it('should initialize theme from localStorage', () => {
      localStorage.setItem('theme', 'dark');

      const store = useUiStore();

      expect(store.theme).toBe('dark');
    });

    it('should initialize theme from system preference when no localStorage', () => {
      const matchMediaMock = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      window.matchMedia = matchMediaMock;

      const store = useUiStore();

      expect(store.theme).toBe('dark');
    });

    it('should default to light theme when no preference', () => {
      const matchMediaMock = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      window.matchMedia = matchMediaMock;

      const store = useUiStore();

      expect(store.theme).toBe('light');
    });
  });

  describe('Sidebar Actions', () => {
    it('should toggle sidebar', () => {
      const store = useUiStore();

      expect(store.sidebarCollapsed).toBe(false);

      store.toggleSidebar();
      expect(store.sidebarCollapsed).toBe(true);

      store.toggleSidebar();
      expect(store.sidebarCollapsed).toBe(false);
    });

    it('should set sidebar collapsed state', () => {
      const store = useUiStore();

      store.setSidebarCollapsed(true);
      expect(store.sidebarCollapsed).toBe(true);

      store.setSidebarCollapsed(false);
      expect(store.sidebarCollapsed).toBe(false);
    });

    it('should handle multiple toggles', () => {
      const store = useUiStore();

      for (let i = 0; i < 5; i++) {
        store.toggleSidebar();
      }

      expect(store.sidebarCollapsed).toBe(true);
    });
  });

  describe('Theme Actions', () => {
    it('should set theme', () => {
      const store = useUiStore();

      store.setTheme('dark');
      expect(store.theme).toBe('dark');

      store.setTheme('light');
      expect(store.theme).toBe('light');
    });

    it('should toggle theme', () => {
      const store = useUiStore();
      store.theme = 'light';

      store.toggleTheme();
      expect(store.theme).toBe('dark');

      store.toggleTheme();
      expect(store.theme).toBe('light');
    });

    it('should persist theme to localStorage', () => {
      const store = useUiStore();

      store.setTheme('dark');
      expect(localStorage.getItem('theme')).toBe('dark');

      store.setTheme('light');
      expect(localStorage.getItem('theme')).toBe('light');
    });

    it('should update document class on theme change', () => {
      const store = useUiStore();

      store.setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);

      store.setTheme('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should apply theme immediately on initialization', () => {
      localStorage.setItem('theme', 'dark');

      const store = useUiStore();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should handle rapid theme changes', () => {
      const store = useUiStore();

      for (let i = 0; i < 10; i++) {
        store.toggleTheme();
      }

      expect(store.theme).toBe('light');
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });
  });

  describe('Loading Actions', () => {
    it('should start loading without text', () => {
      const store = useUiStore();

      store.startLoading();

      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('');
    });

    it('should start loading with text', () => {
      const store = useUiStore();

      store.startLoading('Loading data...');

      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('Loading data...');
    });

    it('should stop loading', () => {
      const store = useUiStore();

      store.startLoading('Loading...');
      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('Loading...');

      store.stopLoading();
      expect(store.loading).toBe(false);
      expect(store.loadingText).toBe('');
    });

    it('should handle multiple start/stop cycles', () => {
      const store = useUiStore();

      store.startLoading('First');
      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('First');

      store.stopLoading();
      expect(store.loading).toBe(false);

      store.startLoading('Second');
      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('Second');

      store.stopLoading();
      expect(store.loading).toBe(false);
    });

    it('should handle stop loading when not loading', () => {
      const store = useUiStore();

      expect(store.loading).toBe(false);
      store.stopLoading();
      expect(store.loading).toBe(false);
    });

    it('should handle multiple start loading calls', () => {
      const store = useUiStore();

      store.startLoading('First');
      store.startLoading('Second');

      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('Second');
    });
  });

  describe('State Persistence', () => {
    it('should persist theme across store instances', () => {
      const store1 = useUiStore();
      store1.setTheme('dark');

      // Create new pinia instance to simulate page reload
      setActivePinia(createPinia());
      const store2 = useUiStore();

      expect(store2.theme).toBe('dark');
    });

    it('should not persist sidebar state', () => {
      const store1 = useUiStore();
      store1.setSidebarCollapsed(true);

      // Create new pinia instance
      setActivePinia(createPinia());
      const store2 = useUiStore();

      expect(store2.sidebarCollapsed).toBe(false);
    });

    it('should not persist loading state', () => {
      const store1 = useUiStore();
      store1.startLoading('Loading...');

      // Create new pinia instance
      setActivePinia(createPinia());
      const store2 = useUiStore();

      expect(store2.loading).toBe(false);
      expect(store2.loadingText).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid theme in localStorage', () => {
      localStorage.setItem('theme', 'invalid');

      const matchMediaMock = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      window.matchMedia = matchMediaMock;

      const store = useUiStore();

      // Should fall back to system preference
      expect(store.theme).toBe('light');
    });

    it('should handle empty loading text', () => {
      const store = useUiStore();

      store.startLoading('');

      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('');
    });

    it('should handle very long loading text', () => {
      const store = useUiStore();
      const longText = 'A'.repeat(1000);

      store.startLoading(longText);

      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe(longText);
    });

    it('should handle special characters in loading text', () => {
      const store = useUiStore();
      const specialText = '🚀 Loading... <script>alert("xss")</script>';

      store.startLoading(specialText);

      expect(store.loadingText).toBe(specialText);
    });
  });

  describe('Integration', () => {
    it('should handle multiple UI state changes', () => {
      const store = useUiStore();

      // Simulate a complex UI interaction
      store.startLoading('Fetching data...');
      store.setSidebarCollapsed(true);
      store.setTheme('dark');

      expect(store.loading).toBe(true);
      expect(store.loadingText).toBe('Fetching data...');
      expect(store.sidebarCollapsed).toBe(true);
      expect(store.theme).toBe('dark');

      store.stopLoading();
      store.toggleSidebar();
      store.toggleTheme();

      expect(store.loading).toBe(false);
      expect(store.loadingText).toBe('');
      expect(store.sidebarCollapsed).toBe(false);
      expect(store.theme).toBe('light');
    });

    it('should maintain independent state for different actions', () => {
      const store = useUiStore();

      store.startLoading('Loading...');
      expect(store.sidebarCollapsed).toBe(false);
      expect(store.theme).toBe('light');

      store.toggleSidebar();
      expect(store.loading).toBe(true);
      expect(store.theme).toBe('light');

      store.setTheme('dark');
      expect(store.loading).toBe(true);
      expect(store.sidebarCollapsed).toBe(true);
    });
  });

  describe('Reactivity', () => {
    it('should trigger watchers on theme change', () => {
      const store = useUiStore();
      const themeChanges: string[] = [];

      // Watch theme changes
      const unwatch = vi.fn();
      store.$subscribe((mutation, state) => {
        if (mutation.events && 'theme' in (mutation.events as any)) {
          themeChanges.push(state.theme);
        }
      });

      store.setTheme('dark');
      store.setTheme('light');

      expect(themeChanges.length).toBeGreaterThan(0);
    });

    it('should be reactive to sidebar changes', () => {
      const store = useUiStore();
      const states: boolean[] = [];

      store.$subscribe((mutation, state) => {
        states.push(state.sidebarCollapsed);
      });

      store.toggleSidebar();
      store.toggleSidebar();

      expect(states.length).toBeGreaterThan(0);
    });
  });
});
