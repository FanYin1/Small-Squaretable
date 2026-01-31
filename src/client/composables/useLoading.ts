import { ref, readonly } from 'vue';

interface LoadingState {
  visible: boolean;
  text: string;
}

const loadingState = ref<LoadingState>({
  visible: false,
  text: 'Loading...',
});

let timeoutId: ReturnType<typeof setTimeout> | null = null;

export function useLoading() {
  const visible = readonly(ref(() => loadingState.value.visible));
  const text = readonly(ref(() => loadingState.value.text));

  /**
   * Start loading with optional text and timeout
   * @param loadingText - Text to display while loading
   * @param timeout - Timeout in milliseconds (default: 30000ms)
   */
  function startLoading(loadingText: string = 'Loading...', timeout: number = 30000) {
    loadingState.value.visible = true;
    loadingState.value.text = loadingText;

    // Clear existing timeout if any
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set auto-timeout
    timeoutId = setTimeout(() => {
      stopLoading();
      console.warn('Loading timeout exceeded');
    }, timeout);
  }

  /**
   * Stop loading
   */
  function stopLoading() {
    loadingState.value.visible = false;
    loadingState.value.text = 'Loading...';

    // Clear timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  /**
   * Update loading text
   */
  function setLoadingText(newText: string) {
    loadingState.value.text = newText;
  }

  return {
    visible: readonly(loadingState),
    startLoading,
    stopLoading,
    setLoadingText,
  };
}
