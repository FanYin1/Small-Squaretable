import { ref, onUnmounted } from 'vue';

export interface VoiceConfig {
  lang?: string;       // e.g. 'en-US', 'zh-CN', 'ja-JP'
  rate?: number;       // 0.5 - 2.0
  pitch?: number;      // 0 - 2
  voiceName?: string;  // specific SpeechSynthesisVoice name
}

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

  function getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!isSupported.value) return [];
    return window.speechSynthesis.getVoices();
  }

  function speak(text: string, config?: VoiceConfig): void {
    if (!isSupported.value) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
    utterance.lang = config?.lang || 'zh-CN';
    utterance.rate = config?.rate || 1;
    utterance.pitch = config?.pitch || 1;
    if (config?.voiceName) {
      const voice = getAvailableVoices().find(v => v.name === config.voiceName);
      if (voice) utterance.voice = voice;
    }
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

  return { isSpeaking, isSupported, speak, stop, stripMarkdown, getAvailableVoices };
}
