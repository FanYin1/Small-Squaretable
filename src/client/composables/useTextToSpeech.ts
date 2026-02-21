import { ref, onUnmounted } from 'vue';

export function useTextToSpeech() {
  const isSpeaking = ref(false);
  const isSupported = ref(typeof window !== 'undefined' && 'speechSynthesis' in window);

  function stripMarkdown(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>`-]/g, '')
      .replace(/\n+/g, ' ')
      .trim();
  }

  function speak(text: string, lang?: string, rate?: number): void {
    if (!isSupported.value) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
    utterance.lang = lang || 'zh-CN';
    utterance.rate = rate || 1;
    utterance.onend = () => { isSpeaking.value = false; };
    utterance.onerror = () => { isSpeaking.value = false; };
    window.speechSynthesis.speak(utterance);
    isSpeaking.value = true;
  }

  function stop(): void {
    if (!isSupported.value) return;
    window.speechSynthesis.cancel();
    isSpeaking.value = false;
  }

  onUnmounted(() => stop());

  return { isSpeaking, isSupported, speak, stop, stripMarkdown };
}
