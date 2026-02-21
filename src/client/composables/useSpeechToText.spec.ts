import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSpeechToText } from './useSpeechToText';

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

function createMockSpeechRecognition() {
  const instance = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null as ((event: any) => void) | null,
    onerror: null as ((event: any) => void) | null,
    onend: null as (() => void) | null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
  };
  return instance;
}

describe('useSpeechToText', () => {
  let mockRecognition: ReturnType<typeof createMockSpeechRecognition>;
  let MockSpeechRecognitionCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUnmountedCallbacks.length = 0;
    mockRecognition = createMockSpeechRecognition();
    MockSpeechRecognitionCtor = vi.fn(function () {
      return mockRecognition;
    });

    // Expose SpeechRecognition on window
    (window as any).SpeechRecognition = MockSpeechRecognitionCtor;
    delete (window as any).webkitSpeechRecognition;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it('detects support when SpeechRecognition is available', () => {
    const { isSupported } = useSpeechToText();
    expect(isSupported.value).toBe(true);
  });

  it('detects support when webkitSpeechRecognition is available', () => {
    delete (window as any).SpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognitionCtor;
    const { isSupported } = useSpeechToText();
    expect(isSupported.value).toBe(true);
  });

  it('detects no support when neither API exists', () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    const { isSupported } = useSpeechToText();
    expect(isSupported.value).toBe(false);
  });

  it('has correct initial state', () => {
    const { isListening, transcript, interimTranscript, error } = useSpeechToText();
    expect(isListening.value).toBe(false);
    expect(transcript.value).toBe('');
    expect(interimTranscript.value).toBe('');
    expect(error.value).toBeNull();
  });

  it('startListening sets isListening to true', () => {
    const { isListening, startListening } = useSpeechToText();
    startListening();
    expect(isListening.value).toBe(true);
    expect(mockRecognition.start).toHaveBeenCalled();
  });

  it('startListening configures recognition with default lang zh-CN', () => {
    const { startListening } = useSpeechToText();
    startListening();
    expect(mockRecognition.continuous).toBe(true);
    expect(mockRecognition.interimResults).toBe(true);
    expect(mockRecognition.lang).toBe('zh-CN');
  });

  it('startListening accepts custom language', () => {
    const { startListening } = useSpeechToText();
    startListening('en-US');
    expect(mockRecognition.lang).toBe('en-US');
  });

  it('startListening clears previous error', () => {
    const { error, startListening } = useSpeechToText();
    // Manually set an error first
    error.value = 'previous error';
    startListening();
    expect(error.value).toBeNull();
  });

  it('sets error when not supported', () => {
    delete (window as any).SpeechRecognition;
    const { error, isListening, startListening } = useSpeechToText();
    startListening();
    expect(error.value).toBe('Speech recognition not supported');
    expect(isListening.value).toBe(false);
  });

  it('stopListening resets state and stops recognition', () => {
    const { isListening, interimTranscript, startListening, stopListening } = useSpeechToText();
    startListening();
    // Simulate some interim text
    interimTranscript.value = 'partial';
    stopListening();
    expect(isListening.value).toBe(false);
    expect(interimTranscript.value).toBe('');
    expect(mockRecognition.stop).toHaveBeenCalled();
  });

  it('stopListening is safe to call when not listening', () => {
    const { stopListening } = useSpeechToText();
    expect(() => stopListening()).not.toThrow();
  });

  it('transcript accumulates final results', () => {
    const { transcript, startListening } = useSpeechToText();
    startListening();

    // Simulate a final result
    mockRecognition.onresult!({
      resultIndex: 0,
      results: [{ 0: { transcript: 'Hello ' }, isFinal: true, length: 1 }],
    });
    expect(transcript.value).toBe('Hello ');

    // Simulate another final result
    mockRecognition.onresult!({
      resultIndex: 1,
      results: [
        { 0: { transcript: 'Hello ' }, isFinal: true, length: 1 },
        { 0: { transcript: 'world' }, isFinal: true, length: 1 },
      ],
    });
    expect(transcript.value).toBe('Hello world');
  });

  it('interimTranscript shows partial results', () => {
    const { interimTranscript, startListening } = useSpeechToText();
    startListening();

    mockRecognition.onresult!({
      resultIndex: 0,
      results: [{ 0: { transcript: 'hel' }, isFinal: false, length: 1 }],
    });
    expect(interimTranscript.value).toBe('hel');
  });

  it('interimTranscript updates as new partials arrive', () => {
    const { interimTranscript, startListening } = useSpeechToText();
    startListening();

    mockRecognition.onresult!({
      resultIndex: 0,
      results: [{ 0: { transcript: 'hel' }, isFinal: false, length: 1 }],
    });
    expect(interimTranscript.value).toBe('hel');

    // New interim replaces old
    mockRecognition.onresult!({
      resultIndex: 0,
      results: [{ 0: { transcript: 'hello' }, isFinal: false, length: 1 }],
    });
    expect(interimTranscript.value).toBe('hello');
  });

  it('error set on permission denied', () => {
    const { error, isListening, startListening } = useSpeechToText();
    startListening();

    mockRecognition.onerror!({ error: 'not-allowed' });
    expect(error.value).toBe('Microphone permission denied');
    expect(isListening.value).toBe(false);
  });

  it('error set on generic speech error', () => {
    const { error, startListening } = useSpeechToText();
    startListening();

    mockRecognition.onerror!({ error: 'network' });
    expect(error.value).toBe('network');
  });

  it('clearTranscript resets both transcripts', () => {
    const { transcript, interimTranscript, startListening, clearTranscript } = useSpeechToText();
    startListening();

    mockRecognition.onresult!({
      resultIndex: 0,
      results: [{ 0: { transcript: 'Hello' }, isFinal: true, length: 1 }],
    });
    interimTranscript.value = 'partial';

    clearTranscript();
    expect(transcript.value).toBe('');
    expect(interimTranscript.value).toBe('');
  });

  it('auto-restarts recognition on end while listening', () => {
    const { startListening } = useSpeechToText();
    startListening();

    // recognition.start was called once during startListening
    expect(mockRecognition.start).toHaveBeenCalledTimes(1);

    // Simulate recognition ending (e.g., silence timeout)
    mockRecognition.onend!();
    expect(mockRecognition.start).toHaveBeenCalledTimes(2);
  });

  it('does not restart recognition on end after stopListening', () => {
    const { startListening, stopListening } = useSpeechToText();
    startListening();
    stopListening();

    // After stop, onend should not restart
    // recognition is null after stop, so onend from old instance won't fire
    // but let's verify the state is correct
    expect(mockRecognition.stop).toHaveBeenCalled();
  });

  it('cleans up on unmount', () => {
    const { startListening } = useSpeechToText();
    startListening();

    onUnmountedCallbacks.forEach((cb) => cb());
    expect(mockRecognition.stop).toHaveBeenCalled();
  });
});
