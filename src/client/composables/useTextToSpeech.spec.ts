import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTextToSpeech } from './useTextToSpeech';

// Mock onUnmounted since we're not inside a Vue component setup
const onUnmountedCallbacks: Array<() => void> = [];
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onUnmounted: (cb: () => void) => {
      onUnmountedCallbacks.push(cb);
    },
  };
});

function createMockSpeechSynthesis() {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    speaking: false,
  };
}

let lastUtterance: any = null;

describe('useTextToSpeech', () => {
  let mockSynthesis: ReturnType<typeof createMockSpeechSynthesis>;

  beforeEach(() => {
    onUnmountedCallbacks.length = 0;
    mockSynthesis = createMockSpeechSynthesis();
    lastUtterance = null;

    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      configurable: true,
      value: mockSynthesis,
    });

    // Capture utterance instances
    (window as any).SpeechSynthesisUtterance = vi.fn(function (this: any, text: string) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.voice = undefined;
      this.onend = null;
      this.onerror = null;
      lastUtterance = this;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects support when speechSynthesis is available', () => {
    const { isSupported } = useTextToSpeech();
    expect(isSupported.value).toBe(true);
  });

  it('detects no support when speechSynthesis is missing', () => {
    delete (window as any).speechSynthesis;
    const { isSupported } = useTextToSpeech();
    expect(isSupported.value).toBe(false);
  });

  it('speak sets isSpeaking to true', () => {
    const { isSpeaking, speak } = useTextToSpeech();
    speak('Hello world');
    expect(isSpeaking.value).toBe(true);
    expect(mockSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  it('speak cancels previous speech before starting', () => {
    const { speak } = useTextToSpeech();
    speak('First');
    speak('Second');
    expect(mockSynthesis.cancel).toHaveBeenCalledTimes(2);
  });

  it('speak uses default lang zh-CN and rate 1', () => {
    const { speak } = useTextToSpeech();
    speak('Hello');
    expect(lastUtterance.lang).toBe('zh-CN');
    expect(lastUtterance.rate).toBe(1);
  });

  it('speak accepts custom lang and rate via VoiceConfig', () => {
    const { speak } = useTextToSpeech();
    speak('Hello', { lang: 'en-US', rate: 1.5 });
    expect(lastUtterance.lang).toBe('en-US');
    expect(lastUtterance.rate).toBe(1.5);
  });

  it('speak accepts custom pitch via VoiceConfig', () => {
    const { speak } = useTextToSpeech();
    speak('Hello', { pitch: 1.5 });
    expect(lastUtterance.pitch).toBe(1.5);
  });

  it('speak defaults pitch to 1 when not specified', () => {
    const { speak } = useTextToSpeech();
    speak('Hello');
    expect(lastUtterance.pitch).toBe(1);
  });

  it('speak sets voice when voiceName matches an available voice', () => {
    const mockVoice = { name: 'Google US English', lang: 'en-US' };
    mockSynthesis.getVoices = vi.fn(() => [mockVoice]);
    (window as any).speechSynthesis = mockSynthesis;

    const { speak } = useTextToSpeech();
    speak('Hello', { voiceName: 'Google US English' });
    expect(lastUtterance.voice).toBe(mockVoice);
  });

  it('speak does not set voice when voiceName has no match', () => {
    mockSynthesis.getVoices = vi.fn(() => [{ name: 'Other Voice', lang: 'en-US' }]);
    (window as any).speechSynthesis = mockSynthesis;

    const { speak } = useTextToSpeech();
    speak('Hello', { voiceName: 'Nonexistent Voice' });
    expect(lastUtterance.voice).toBeUndefined();
  });

  it('getAvailableVoices returns voices from speechSynthesis', () => {
    const voices = [{ name: 'Voice A' }, { name: 'Voice B' }];
    mockSynthesis.getVoices = vi.fn(() => voices);
    (window as any).speechSynthesis = mockSynthesis;

    const { getAvailableVoices } = useTextToSpeech();
    expect(getAvailableVoices()).toEqual(voices);
  });

  it('getAvailableVoices returns empty array when not supported', () => {
    delete (window as any).speechSynthesis;
    const { getAvailableVoices } = useTextToSpeech();
    expect(getAvailableVoices()).toEqual([]);
  });

  it('isSpeaking resets to false on utterance end', () => {
    const { isSpeaking, speak } = useTextToSpeech();
    speak('Hello');
    expect(isSpeaking.value).toBe(true);
    lastUtterance.onend();
    expect(isSpeaking.value).toBe(false);
  });

  it('isSpeaking resets to false on utterance error', () => {
    const { isSpeaking, speak } = useTextToSpeech();
    speak('Hello');
    expect(isSpeaking.value).toBe(true);
    lastUtterance.onerror();
    expect(isSpeaking.value).toBe(false);
  });

  it('stop cancels synthesis and resets isSpeaking', () => {
    const { isSpeaking, speak, stop } = useTextToSpeech();
    speak('Hello');
    expect(isSpeaking.value).toBe(true);
    stop();
    expect(isSpeaking.value).toBe(false);
    expect(mockSynthesis.cancel).toHaveBeenCalled();
  });

  it('speak does nothing when not supported', () => {
    delete (window as any).speechSynthesis;
    const { isSpeaking, speak } = useTextToSpeech();
    speak('Hello');
    expect(isSpeaking.value).toBe(false);
  });

  it('stop does nothing when not supported', () => {
    delete (window as any).speechSynthesis;
    const { stop } = useTextToSpeech();
    expect(() => stop()).not.toThrow();
  });

  it('cleans up on unmount', () => {
    const { speak } = useTextToSpeech();
    speak('Hello');
    onUnmountedCallbacks.forEach((cb) => cb());
    expect(mockSynthesis.cancel).toHaveBeenCalled();
  });

  describe('stripMarkdown', () => {
    it('removes code blocks', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('before ```code here``` after')).toBe('before  after');
    });

    it('removes inline code', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('use `console.log` here')).toBe('use  here');
    });

    it('extracts link text from markdown links', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('click [here](https://example.com) now')).toBe('click here now');
    });

    it('removes markdown formatting characters', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('**bold** and *italic*')).toBe('bold and italic');
    });

    it('replaces newlines with spaces', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('line one\n\nline two')).toBe('line one line two');
    });

    it('removes headers', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('## Header text')).toBe('Header text');
    });

    it('handles empty string', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('')).toBe('');
    });

    it('handles plain text without changes', () => {
      const { stripMarkdown } = useTextToSpeech();
      expect(stripMarkdown('Hello world')).toBe('Hello world');
    });
  });
});
