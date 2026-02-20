import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useLoading', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadModule() {
    const mod = await import('./useLoading');
    return mod.useLoading();
  }

  it('has initial state: visible false, text "Loading..."', async () => {
    const { visible } = await loadModule();
    expect(visible.value.visible).toBe(false);
    expect(visible.value.text).toBe('Loading...');
  });

  it('startLoading sets visible true and custom text', async () => {
    const { visible, startLoading } = await loadModule();
    startLoading('Saving...');
    expect(visible.value.visible).toBe(true);
    expect(visible.value.text).toBe('Saving...');
  });

  it('stopLoading resets visible and text', async () => {
    const { visible, startLoading, stopLoading } = await loadModule();
    startLoading('Processing...');
    stopLoading();
    expect(visible.value.visible).toBe(false);
    expect(visible.value.text).toBe('Loading...');
  });

  it('setLoadingText updates text', async () => {
    const { visible, startLoading, setLoadingText } = await loadModule();
    startLoading();
    setLoadingText('Almost done...');
    expect(visible.value.text).toBe('Almost done...');
  });

  it('startLoading uses default text when none provided', async () => {
    const { visible, startLoading } = await loadModule();
    startLoading();
    expect(visible.value.visible).toBe(true);
    expect(visible.value.text).toBe('Loading...');
  });

  it('auto-timeout fires after specified duration', async () => {
    const { visible, startLoading } = await loadModule();
    startLoading('Working...', 5000);
    expect(visible.value.visible).toBe(true);

    vi.advanceTimersByTime(5000);

    expect(visible.value.visible).toBe(false);
    expect(visible.value.text).toBe('Loading...');
  });

  it('stopLoading clears timeout so auto-stop does not fire', async () => {
    const { visible, startLoading, stopLoading } = await loadModule();
    startLoading('Working...', 5000);
    stopLoading();

    // Start again with a long timeout
    startLoading('Round 2', 60000);
    // Advance past the original 5s — old timeout should have been cleared
    vi.advanceTimersByTime(5000);

    // Still visible because the old timeout was cleared and the new one hasn't fired
    expect(visible.value.visible).toBe(true);
    expect(visible.value.text).toBe('Round 2');
  });
});
