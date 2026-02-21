import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioRecorder } from './useAudioRecorder';

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

function createMockMediaStream() {
  const track = { stop: vi.fn(), kind: 'audio' as const };
  return {
    getTracks: vi.fn(() => [track]),
    _track: track,
  } as unknown as MediaStream & { _track: { stop: ReturnType<typeof vi.fn> } };
}

function createMockMediaRecorder() {
  let _state: 'inactive' | 'recording' | 'paused' = 'inactive';
  const instance = {
    start: vi.fn(() => { _state = 'recording'; }),
    stop: vi.fn(() => {
      _state = 'inactive';
      // Simulate async onstop callback
      setTimeout(() => {
        if (instance.ondataavailable) {
          instance.ondataavailable({ data: new Blob(['audio-data'], { type: 'audio/webm' }) } as BlobEvent);
        }
        if (instance.onstop) {
          instance.onstop(new Event('stop'));
        }
      }, 0);
    }),
    ondataavailable: null as ((e: BlobEvent) => void) | null,
    onstop: null as ((e: Event) => void) | null,
    get state() { return _state; },
  };
  return instance;
}

describe('useAudioRecorder', () => {
  let mockStream: ReturnType<typeof createMockMediaStream>;
  let mockRecorder: ReturnType<typeof createMockMediaRecorder>;

  beforeEach(() => {
    vi.useFakeTimers();
    onUnmountedCallbacks.length = 0;
    mockStream = createMockMediaStream();
    mockRecorder = createMockMediaRecorder();

    // Mock navigator.mediaDevices
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        },
      },
      writable: true,
      configurable: true,
    });

    // Mock MediaRecorder constructor — vitest 4 requires function keyword for new-able mocks
    (globalThis as any).MediaRecorder = vi.fn(function () { return mockRecorder; });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('detects browser support when mediaDevices is available', () => {
    const { isSupported } = useAudioRecorder();
    expect(isSupported.value).toBe(true);
  });

  it('detects no support when mediaDevices is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    const { isSupported } = useAudioRecorder();
    expect(isSupported.value).toBe(false);
  });

  it('has correct initial state', () => {
    const { isRecording, duration, error } = useAudioRecorder();
    expect(isRecording.value).toBe(false);
    expect(duration.value).toBe(0);
    expect(error.value).toBeNull();
  });

  it('startRecording sets isRecording to true', async () => {
    const { isRecording, startRecording } = useAudioRecorder();
    await startRecording();
    expect(isRecording.value).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('startRecording creates MediaRecorder with audio/webm', async () => {
    const { startRecording } = useAudioRecorder();
    await startRecording();
    expect((globalThis as any).MediaRecorder).toHaveBeenCalledWith(mockStream, { mimeType: 'audio/webm' });
    expect(mockRecorder.start).toHaveBeenCalled();
  });

  it('duration increments every second while recording', async () => {
    const { duration, startRecording } = useAudioRecorder();
    await startRecording();

    expect(duration.value).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(duration.value).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(duration.value).toBe(4);
  });

  it('stopRecording returns a Blob and resets state', async () => {
    const { isRecording, duration, startRecording, stopRecording } = useAudioRecorder();
    await startRecording();
    vi.advanceTimersByTime(2000);

    const blobPromise = stopRecording();
    // Let the onstop callback fire
    vi.advanceTimersByTime(0);
    const blob = await blobPromise;

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/webm');
    expect(isRecording.value).toBe(false);
    expect(duration.value).toBe(0);
  });

  it('stopRecording rejects when no active recording', async () => {
    const { stopRecording } = useAudioRecorder();
    await expect(stopRecording()).rejects.toThrow('No active recording');
  });

  it('cancelRecording resets state without returning data', async () => {
    const { isRecording, duration, startRecording, cancelRecording } = useAudioRecorder();
    await startRecording();
    vi.advanceTimersByTime(3000);

    cancelRecording();

    expect(isRecording.value).toBe(false);
    expect(duration.value).toBe(0);
  });

  it('cancelRecording stops stream tracks', async () => {
    const { startRecording, cancelRecording } = useAudioRecorder();
    await startRecording();
    cancelRecording();
    expect(mockStream._track.stop).toHaveBeenCalled();
  });

  it('sets error on permission denied', async () => {
    const permError = new DOMException('Permission denied', 'NotAllowedError');
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(permError);

    const { error, isRecording, startRecording } = useAudioRecorder();
    await startRecording();

    expect(error.value).toBe('Microphone permission denied');
    expect(isRecording.value).toBe(false);
  });

  it('sets generic error on other failures', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Device error'));

    const { error, startRecording } = useAudioRecorder();
    await startRecording();

    expect(error.value).toBe('Failed to start recording');
  });

  it('sets error when not supported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    const { error, startRecording } = useAudioRecorder();
    await startRecording();
    expect(error.value).toBe('Audio recording is not supported in this browser');
  });

  it('clears previous error on successful start', async () => {
    const permError = new DOMException('Permission denied', 'NotAllowedError');
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(permError);

    const { error, startRecording } = useAudioRecorder();
    await startRecording();
    expect(error.value).toBe('Microphone permission denied');

    // Second attempt succeeds
    await startRecording();
    expect(error.value).toBeNull();
  });

  it('cleans up on unmount', async () => {
    const { startRecording } = useAudioRecorder();
    await startRecording();

    // Trigger onUnmounted callback
    onUnmountedCallbacks.forEach((cb) => cb());

    expect(mockStream._track.stop).toHaveBeenCalled();
    expect(mockRecorder.stop).toHaveBeenCalled();
  });
});
