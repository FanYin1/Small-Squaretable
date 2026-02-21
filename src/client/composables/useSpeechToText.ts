import { ref, onUnmounted } from 'vue';

export function useSpeechToText() {
  const isListening = ref(false);
  const transcript = ref('');
  const interimTranscript = ref('');
  const isSupported = ref(
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
  );
  const error = ref<string | null>(null);

  let recognition: any = null;

  function startListening(lang?: string): void {
    if (!isSupported.value) {
      error.value = 'Speech recognition not supported';
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang || 'zh-CN';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (final) transcript.value += final;
      interimTranscript.value = interim;
    };

    recognition.onerror = (event: any) => {
      error.value =
        event.error === 'not-allowed' ? 'Microphone permission denied' : event.error;
      isListening.value = false;
    };

    recognition.onend = () => {
      if (isListening.value) recognition.start(); // auto-restart
    };

    recognition.start();
    isListening.value = true;
    error.value = null;
  }

  function stopListening(): void {
    if (recognition) {
      recognition.stop();
      recognition = null;
    }
    isListening.value = false;
    interimTranscript.value = '';
  }

  function clearTranscript(): void {
    transcript.value = '';
    interimTranscript.value = '';
  }

  onUnmounted(() => stopListening());

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
