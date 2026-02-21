# Iteration 17: Voice/Audio Multimodal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add voice input (speech-to-text), audio message recording, audio playback in chat, and TTS voice output for assistant responses.

**Architecture:** Client-side STT via Web Speech API for real-time transcription. Audio recording via MediaRecorder API, uploaded to server and stored as message attachments. TTS via server-side service generating audio from assistant text. Audio playback via custom waveform player component. The server-side types (`WSAttachment`, `attachmentSchema`) already support `type: 'audio'` — most work is client-side UI and upload infrastructure.

**Tech Stack:** Web Speech API (STT), MediaRecorder API (recording), HTML5 Audio (playback), Hono.js (upload routes), local filesystem (storage)

---

### Task 1: Extend client MessageAttachment type and add audio upload API

**Files:**
- Modify: `src/client/types/index.ts`
- Modify: `src/client/services/upload.api.ts`

**What to do:**

1. In `src/client/types/index.ts`, extend `MessageAttachment.type` to include `'audio'`:
```ts
export interface MessageAttachment {
  id: string;
  type: 'image' | 'file' | 'audio';
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  duration?: number; // audio duration in seconds
}
```

2. In `src/client/services/upload.api.ts`, add `uploadAudio` method:
```ts
async uploadAudio(file: Blob, filename?: string): Promise<{ url: string; duration?: number }> {
  const formData = new FormData();
  formData.append('audio', file, filename || 'recording.webm');
  const response = await this.client.post('/uploads/audio', formData);
  return response.data;
}
```

Run: `npx tsc --noEmit 2>&1 | grep -E 'upload\.api|types/index'` — should be clean.

**Commit:** `feat(types): extend MessageAttachment for audio, add uploadAudio API`

---

### Task 2: Implement server-side audio upload endpoint

**Files:**
- Modify: `src/server/routes/uploads.ts` (currently empty stub)

**What to do:**

Implement `POST /uploads/audio` endpoint in the uploads route:

1. Accept multipart form data with an `audio` field
2. Validate MIME type: `audio/webm`, `audio/mp3`, `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/m4a`
3. Validate file size: max 25MB
4. Save to `uploads/{tenantId}/audio/{uuid}.{ext}` using local filesystem
5. Return `{ url: '/uploads/{tenantId}/audio/{filename}', duration: null }`
6. Require auth middleware

```ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/m4a'];
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

export const uploadRoutes = new Hono();

uploadRoutes.post('/audio', authMiddleware(), async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const file = body['audio'];

  if (!(file instanceof File)) {
    return c.json({ success: false, error: 'No audio file provided' }, 400);
  }

  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    return c.json({ success: false, error: 'Invalid audio format' }, 400);
  }

  if (file.size > MAX_AUDIO_SIZE) {
    return c.json({ success: false, error: 'File too large (max 25MB)' }, 400);
  }

  const ext = file.name?.split('.').pop() || 'webm';
  const filename = `${randomUUID()}.${ext}`;
  const dir = path.join('uploads', user.tenantId, 'audio');
  await fs.mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  return c.json({
    success: true,
    data: { url: `/uploads/${user.tenantId}/audio/${filename}` }
  });
});
```

Also add a unit test file `src/server/routes/uploads.spec.ts` with basic tests for validation (invalid MIME, too large, success).

Run: `npx vitest run src/server/routes/uploads.spec.ts`

**Commit:** `feat(server): implement audio upload endpoint with validation`

---

### Task 3: Create AudioRecorder composable

**Files:**
- Create: `src/client/composables/useAudioRecorder.ts`
- Create: `src/client/composables/useAudioRecorder.spec.ts`

**What to do:**

Create a composable that wraps the MediaRecorder API:

```ts
export function useAudioRecorder() {
  const isRecording = ref(false);
  const duration = ref(0);
  const error = ref<string | null>(null);

  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  async function startRecording(): Promise<void> { ... }
  function stopRecording(): Promise<Blob> { ... }
  function cancelRecording(): void { ... }

  return { isRecording, duration, error, startRecording, stopRecording, cancelRecording };
}
```

Key behaviors:
- `startRecording()`: Request microphone permission via `navigator.mediaDevices.getUserMedia({ audio: true })`, create MediaRecorder with `audio/webm` MIME, start recording, start duration timer
- `stopRecording()`: Stop MediaRecorder, return Blob from accumulated chunks, reset state
- `cancelRecording()`: Stop without returning data, clean up
- `duration`: Increments every second while recording
- `error`: Set if microphone permission denied or MediaRecorder not supported
- Clean up on component unmount (stop stream tracks)

Write unit tests mocking `navigator.mediaDevices.getUserMedia` and `MediaRecorder`.

Run: `npx vitest run src/client/composables/useAudioRecorder.spec.ts`

**Commit:** `feat(client): add useAudioRecorder composable with MediaRecorder API`

---

### Task 4: Create AudioPlayer component

**Files:**
- Create: `src/client/components/chat/AudioPlayer.vue`
- Create: `src/client/components/chat/AudioPlayer.spec.ts`

**What to do:**

Create a compact audio player component for rendering audio attachments in chat messages:

Props: `src: string`, `duration?: number`

UI elements:
- Play/pause button (icon toggle)
- Progress bar (clickable for seeking)
- Current time / total duration display
- Playback speed button (1x, 1.5x, 2x)

```vue
<template>
  <div class="audio-player">
    <button class="play-btn" @click="togglePlay">
      <el-icon><VideoPlay v-if="!isPlaying" /><VideoPause v-else /></el-icon>
    </button>
    <div class="progress-bar" @click="seek">
      <div class="progress-fill" :style="{ width: progress + '%' }" />
    </div>
    <span class="time">{{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}</span>
    <button class="speed-btn" @click="cycleSpeed">{{ playbackRate }}x</button>
  </div>
</template>
```

Style: dark rounded pill (matches the chat UI), ~280px wide, 40px tall.

Write unit tests for: render, play/pause toggle, time formatting, speed cycling.

Run: `npx vitest run src/client/components/chat/AudioPlayer.spec.ts`

**Commit:** `feat(client): add AudioPlayer component for chat audio playback`

---

### Task 5: Add voice recording UI to MessageInput

**Files:**
- Modify: `src/client/components/chat/MessageInput.vue`

**What to do:**

Add a microphone button and recording UI to the message input:

1. Import `useAudioRecorder` composable and `uploadApi`
2. Add a microphone icon button next to the existing attach button
3. When recording:
   - Replace the text input area with a recording indicator (red dot + duration + waveform animation)
   - Show cancel (X) and send (checkmark) buttons
4. On send:
   - Call `uploadApi.uploadAudio(blob)` to upload the recording
   - Emit `send` with empty content and the audio attachment
5. Extend the `send` emit signature to include attachments:
```ts
const emit = defineEmits<{
  (e: 'send', content: string, attachments?: MessageAttachment[]): void;
}>();
```

Recording states:
- Idle: show microphone button (grey)
- Recording: show red pulsing indicator + duration + cancel/send buttons
- Uploading: show spinner

Handle errors: microphone permission denied → show toast, MediaRecorder not supported → hide mic button.

**Commit:** `feat(client): add voice recording to MessageInput with upload`

---

### Task 6: Render audio attachments in MessageBubble

**Files:**
- Modify: `src/client/components/chat/MessageBubble.vue`

**What to do:**

Add attachment rendering to MessageBubble:

1. Import `AudioPlayer` component
2. After the message content div, add an attachments section:
```vue
<div v-if="message.attachments?.length" class="message-attachments">
  <template v-for="attachment in message.attachments" :key="attachment.id">
    <AudioPlayer
      v-if="attachment.type === 'audio'"
      :src="attachment.url"
      :duration="attachment.duration"
    />
    <MessageImage
      v-else-if="attachment.type === 'image'"
      :src="attachment.url"
      :alt="attachment.name"
    />
  </template>
</div>
```

3. Style the attachments section with appropriate spacing below the message text.

Run: `npx vitest run src/client/components/chat/MessageBubble.spec.ts` — verify no regressions.

**Commit:** `feat(client): render audio and image attachments in MessageBubble`

---

### Task 7: Add Speech-to-Text (STT) via Web Speech API

**Files:**
- Create: `src/client/composables/useSpeechToText.ts`
- Create: `src/client/composables/useSpeechToText.spec.ts`
- Modify: `src/client/components/chat/MessageInput.vue`

**What to do:**

1. Create `useSpeechToText` composable:
```ts
export function useSpeechToText() {
  const isListening = ref(false);
  const transcript = ref('');
  const interimTranscript = ref('');
  const isSupported = ref(typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window));
  const error = ref<string | null>(null);

  function startListening(lang?: string): void { ... }
  function stopListening(): void { ... }

  return { isListening, transcript, interimTranscript, isSupported, error, startListening, stopListening };
}
```

Key behaviors:
- Uses `SpeechRecognition` or `webkitSpeechRecognition`
- `continuous: true`, `interimResults: true`
- `transcript` accumulates final results
- `interimTranscript` shows real-time partial recognition
- Language defaults to current locale (zh-CN or en-US)
- Auto-restarts on `onend` if still listening

2. Add STT toggle to MessageInput:
- Add a small microphone-with-waves icon button in the input area
- When active, show interim transcript as placeholder text in the input
- Final transcript appends to the input content
- User can edit the transcribed text before sending

Write unit tests mocking `SpeechRecognition`.

Run: `npx vitest run src/client/composables/useSpeechToText.spec.ts`

**Commit:** `feat(client): add speech-to-text composable and integrate into MessageInput`

---

### Task 8: Add Text-to-Speech (TTS) for assistant messages

**Files:**
- Create: `src/client/composables/useTextToSpeech.ts`
- Create: `src/client/composables/useTextToSpeech.spec.ts`
- Modify: `src/client/components/chat/MessageBubble.vue`

**What to do:**

1. Create `useTextToSpeech` composable using the Web Speech Synthesis API:
```ts
export function useTextToSpeech() {
  const isSpeaking = ref(false);
  const isSupported = ref(typeof window !== 'undefined' && 'speechSynthesis' in window);

  function speak(text: string, lang?: string, rate?: number): void { ... }
  function stop(): void { ... }

  return { isSpeaking, isSupported, speak, stop };
}
```

Key behaviors:
- Uses `window.speechSynthesis` and `SpeechSynthesisUtterance`
- Strips markdown formatting from text before speaking
- Supports language selection (zh-CN, en-US)
- Rate control (0.5x to 2x)
- Auto-stops when component unmounts

2. Add a "play voice" button to assistant messages in MessageBubble:
- Small speaker icon button in the message action bar (next to Copy)
- Only shown for assistant messages and when `speechSynthesis` is supported
- Toggles between speak/stop
- Icon changes to indicate speaking state

Write unit tests mocking `speechSynthesis`.

Run: `npx vitest run src/client/composables/useTextToSpeech.spec.ts`

**Commit:** `feat(client): add text-to-speech for assistant messages`

---

### Task 9: Add i18n keys for voice features

**Files:**
- Modify: `src/client/locales/en-US.json`
- Modify: `src/client/locales/zh-CN.json`

**What to do:**

Add i18n keys for all voice-related UI text:

```json
{
  "voice": {
    "record": "Record voice message",
    "recording": "Recording...",
    "stopRecording": "Stop recording",
    "cancelRecording": "Cancel recording",
    "sendRecording": "Send recording",
    "uploading": "Uploading audio...",
    "micPermissionDenied": "Microphone permission denied",
    "micNotSupported": "Audio recording not supported in this browser",
    "speechToText": "Speech to text",
    "listening": "Listening...",
    "sttNotSupported": "Speech recognition not supported in this browser",
    "playVoice": "Read aloud",
    "stopVoice": "Stop reading",
    "ttsNotSupported": "Text-to-speech not supported in this browser",
    "playbackSpeed": "Playback speed"
  }
}
```

And the zh-CN equivalents:
```json
{
  "voice": {
    "record": "录制语音消息",
    "recording": "录音中...",
    "stopRecording": "停止录音",
    "cancelRecording": "取消录音",
    "sendRecording": "发送录音",
    "uploading": "上传音频中...",
    "micPermissionDenied": "麦克风权限被拒绝",
    "micNotSupported": "此浏览器不支持录音",
    "speechToText": "语音转文字",
    "listening": "聆听中...",
    "sttNotSupported": "此浏览器不支持语音识别",
    "playVoice": "朗读",
    "stopVoice": "停止朗读",
    "ttsNotSupported": "此浏览器不支持语音合成",
    "playbackSpeed": "播放速度"
  }
}
```

Then update MessageInput and MessageBubble to use `$t('voice.*')` for all voice-related strings.

Run: `npx vitest run 2>&1 | tail -5` — verify no regressions.

**Commit:** `feat(i18n): add voice feature translations (en-US + zh-CN)`

---

### Task 10: Final verification and docs update

**What to do:**

1. Run `npx tsc --noEmit` — expect 0 errors
2. Run `npx vitest run` — expect all tests passing
3. Run `npm run build` — expect clean production build
4. Update `ROADMAP.md` — add Iteration 17 entry:
```markdown
### 迭代 17: 语音/音频多模态 ✅ (2026-02-22)
- ✅ **音频上传** — POST /uploads/audio, MIME 验证, 25MB 限制, 租户隔离存储
- ✅ **语音录制** — useAudioRecorder composable (MediaRecorder API), MessageInput 录音 UI
- ✅ **音频播放** — AudioPlayer 组件 (播放/暂停/进度/倍速), MessageBubble 附件渲染
- ✅ **语音转文字 (STT)** — useSpeechToText composable (Web Speech API), 实时转录
- ✅ **文字转语音 (TTS)** — useTextToSpeech composable (Speech Synthesis API), 助手消息朗读
- ✅ **i18n** — voice.* 键 (en-US + zh-CN)
```

**Commit:** `docs: update ROADMAP.md for Iteration 17 (voice/audio multimodal)`

---

## Verification

After all tasks:
- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — all tests passing (no regressions)
- `npm run build` — production build succeeds
- Voice recording works in MessageInput
- Audio playback works in MessageBubble
- STT transcribes speech to text input
- TTS reads assistant messages aloud
