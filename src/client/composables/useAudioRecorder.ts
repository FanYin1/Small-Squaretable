import { ref, onUnmounted } from 'vue';

export function useAudioRecorder() {
  const isRecording = ref(false);
  const duration = ref(0);
  const error = ref<string | null>(null);
  const isSupported = ref(
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  );

  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let stream: MediaStream | null = null;

  function cleanup() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    mediaRecorder = null;
    chunks = [];
    isRecording.value = false;
    duration.value = 0;
  }

  async function startRecording(): Promise<void> {
    if (!isSupported.value) {
      error.value = 'Audio recording is not supported in this browser';
      return;
    }

    try {
      error.value = null;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunks = [];

      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.start();
      isRecording.value = true;
      duration.value = 0;

      timer = setInterval(() => {
        duration.value++;
      }, 1000);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : 'Failed to start recording';
      error.value = message;
      cleanup();
    }
  }

  function stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        reject(new Error('No active recording'));
        return;
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        cleanup();
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }

  function cancelRecording(): void {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    cleanup();
  }

  onUnmounted(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    cleanup();
  });

  return {
    isRecording,
    duration,
    error,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
