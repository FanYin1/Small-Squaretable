# Iteration 38: Expression Sprite Editor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a full expression sprite management UI to CharacterEditor — upload images per emotion label, preview them, store in `cardData.extensions.expressions`, and display in chat via the existing ExpressionSprite component.

**Architecture:** 5 tasks in dependency order. T1 adds the image upload endpoint. T2 creates the ExpressionEditor component. T3 wires it into CharacterEditor. T4 adds expression preview in the editor. T5 runs final verification. T1 is independent; T2 depends on T1; T3 depends on T2; T4 depends on T3.

**Tech Stack:** TypeScript strict, Vue 3, Hono.js, Vitest

---

### Task 1: Add image upload endpoint

**Files:**
- Modify: `src/server/routes/uploads.ts`

**What to do:**

Currently only `POST /uploads/audio` exists. Add `POST /uploads/image` for expression sprite uploads.

1. Add image constants after the existing audio constants (around line 18):
```ts
const ALLOWED_IMAGE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
```

2. Add the image upload handler after the audio handler. Follow the same pattern:
```ts
uploadRoutes.post('/image', authMiddleware(), async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No file provided' } }, 400);
  }

  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid image type' } }, 400);
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'File too large (max 5MB)' } }, 400);
  }

  // Save file
  const ext = file.name.split('.').pop() || 'png';
  const filename = `${nanoid()}.${ext}`;
  const dir = path.join(storagePath, user.tenantId, 'images');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const url = `/uploads/${user.tenantId}/images/${filename}`;
  return c.json({ success: true, data: { url } });
});
```

Check the existing audio handler for the exact pattern (imports, storagePath variable, nanoid usage, etc.) and match it.

**Tests:** ~3 tests in `src/server/routes/uploads.spec.ts` (create or add to existing)
- Successful image upload returns URL
- Rejects invalid MIME type
- Rejects oversized file

**Commit:** `feat(uploads): add image upload endpoint`

---

### Task 2: Create ExpressionEditor component

**Files:**
- Create: `src/client/components/character/ExpressionEditor.vue`
- Modify: `src/client/i18n/locales/en-US.json`
- Modify: `src/client/i18n/locales/zh-CN.json`

**What to do:**

Create a component that displays a grid of 12 emotion labels + "neutral" + "default", each with an upload slot and preview.

1. Component props/emit pattern (follow VoiceSettings.vue pattern):
```ts
const props = defineProps<{
  modelValue?: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', config: Record<string, string>): void;
}>();
```

2. Internal state — a reactive map of emotion label to URL:
```ts
const EMOTION_LABELS = [
  'neutral', 'default',
  'excited', 'happy', 'loving', 'calm', 'curious', 'surprised',
  'confused', 'bored', 'sad', 'fearful', 'angry', 'disgusted',
];

const expressions = reactive<Record<string, string>>({});

// Sync from props
watch(() => props.modelValue, (val) => {
  Object.keys(expressions).forEach(k => delete expressions[k]);
  if (val) Object.assign(expressions, val);
}, { immediate: true });

// Emit on change
watch(expressions, () => {
  const nonEmpty = Object.fromEntries(
    Object.entries(expressions).filter(([, v]) => v)
  );
  emit('update:modelValue', Object.keys(nonEmpty).length > 0 ? nonEmpty : {});
}, { deep: true });
```

3. Upload handler — use the new `/api/v1/uploads/image` endpoint (or use base64 data URL like avatar upload for simplicity). For server upload:
```ts
async function handleUpload(label: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif';
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      ElMessage.error(t('expressionEditor.fileTooLarge'));
      return;
    }
    // Convert to data URL for simplicity (same as avatar upload)
    const reader = new FileReader();
    reader.onloadend = () => {
      expressions[label] = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
```

Using data URLs keeps it consistent with the avatar upload pattern and avoids needing the server upload endpoint for now. The server upload endpoint (T1) is still useful for future server-side rendering and for large sprite sets.

4. Template — grid of emotion cards:
```vue
<template>
  <div class="expression-editor">
    <div class="expression-grid">
      <div v-for="label in EMOTION_LABELS" :key="label" class="expression-card">
        <div class="expression-label">{{ t(`expressionEditor.${label}`, label) }}</div>
        <div class="expression-preview" @click="handleUpload(label)">
          <img v-if="expressions[label]" :src="expressions[label]" :alt="label" class="preview-image" />
          <div v-else class="upload-placeholder">
            <el-icon><Plus /></el-icon>
          </div>
        </div>
        <el-button v-if="expressions[label]" type="danger" text size="small" @click="delete expressions[label]">
          {{ t('common.delete') }}
        </el-button>
      </div>
    </div>
  </div>
</template>
```

5. Style — responsive grid:
```css
.expression-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.expression-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.expression-preview {
  width: 100px;
  height: 100px;
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
```

6. Add i18n keys under `expressionEditor` section in both locale files:
- en-US: `"title": "Expression Sprites"`, `"fileTooLarge": "Image must be under 5MB"`, plus each emotion label
- zh-CN: `"title": "表情精灵"`, `"fileTooLarge": "图片不能超过5MB"`, plus Chinese emotion labels: `"neutral": "中性"`, `"default": "默认"`, `"excited": "兴奋"`, `"happy": "开心"`, `"loving": "爱意"`, `"calm": "平静"`, `"curious": "好奇"`, `"surprised": "惊讶"`, `"confused": "困惑"`, `"bored": "无聊"`, `"sad": "悲伤"`, `"fearful": "恐惧"`, `"angry": "愤怒"`, `"disgusted": "厌恶"`

**Tests:** ~3 tests in `src/client/components/character/ExpressionEditor.spec.ts`
- Renders all 14 emotion label cards
- Emits update when expression is set
- Shows preview image when expression URL exists

**Commit:** `feat(editor): create ExpressionEditor component`

---

### Task 3: Wire ExpressionEditor into CharacterEditor

**Files:**
- Modify: `src/client/pages/CharacterEditor.vue`

**What to do:**

1. Import the component:
```ts
import ExpressionEditor from '@client/components/character/ExpressionEditor.vue';
```

2. Add state refs (near `showVoiceSettings` and `voiceConfig`):
```ts
const showExpressionEditor = ref(false);
const expressionConfig = ref<Record<string, string>>({});
```

3. In `fetchCharacter()`, load expressions from cardData:
```ts
if (cd.extensions?.expressions) {
  expressionConfig.value = { ...(cd.extensions.expressions as Record<string, string>) };
  showExpressionEditor.value = true;
}
```

4. In `handleSave()`, include expressions in the extensions merge:
```ts
extensions: {
  ...(originalCardData.value.extensions as Record<string, unknown> || {}),
  voice: voiceConfig.value,
  expressions: Object.keys(expressionConfig.value).length > 0 ? expressionConfig.value : undefined,
},
```

5. Add UI section in the template, after Voice Settings and before Avatar. Follow the same collapsible pattern:
```vue
<!-- Expression Sprites -->
<el-divider content-position="left">
  <span class="voice-toggle" @click="showExpressionEditor = !showExpressionEditor">
    {{ t('expressionEditor.title') }}
    <el-icon style="margin-left: 4px;">
      <arrow-up v-if="showExpressionEditor" />
      <arrow-down v-else />
    </el-icon>
  </span>
</el-divider>

<ExpressionEditor
  v-if="showExpressionEditor"
  v-model="expressionConfig"
/>
```

6. Also load expressions from templates in the `onMounted` template path.

**Tests:** ~2 tests in `src/client/pages/CharacterEditor.spec.ts` (add to existing)
- Expressions loaded from character cardData
- Expressions included in save payload under `extensions.expressions`

**Commit:** `feat(editor): wire ExpressionEditor into CharacterEditor`

---

### Task 4: Add expression preview in editor

**Files:**
- Modify: `src/client/components/character/ExpressionEditor.vue`

**What to do:**

Add a preview section at the top of the ExpressionEditor that shows the current sprite at a larger size, with a dropdown to select which emotion to preview. This lets creators see how their sprites will look in chat.

1. Add preview state:
```ts
const previewEmotion = ref('neutral');
const previewUrl = computed(() => {
  return expressions[previewEmotion.value]
    || expressions['neutral']
    || expressions['default']
    || null;
});
```

2. Add preview UI above the grid:
```vue
<div v-if="Object.keys(expressions).some(k => expressions[k])" class="expression-preview-section">
  <div class="preview-header">
    <span>{{ t('expressionEditor.preview') }}</span>
    <el-select v-model="previewEmotion" size="small" style="width: 140px;">
      <el-option v-for="label in EMOTION_LABELS" :key="label" :label="t(`expressionEditor.${label}`, label)" :value="label" />
    </el-select>
  </div>
  <div class="preview-display">
    <img v-if="previewUrl" :src="previewUrl" :alt="previewEmotion" class="large-preview" />
    <div v-else class="no-preview">{{ t('expressionEditor.noSprite') }}</div>
  </div>
</div>
```

3. Style the preview:
```css
.expression-preview-section {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.large-preview {
  max-height: 200px;
  max-width: 100%;
  object-fit: contain;
  display: block;
  margin: 0 auto;
}
```

4. Add i18n keys:
- en-US: `"preview": "Preview"`, `"noSprite": "No sprite for this emotion"`
- zh-CN: `"preview": "预览"`, `"noSprite": "此情绪无精灵图"`

**Tests:** ~1 test in `src/client/components/character/ExpressionEditor.spec.ts` (add to existing)
- Preview shows correct image for selected emotion

**Commit:** `feat(editor): add expression sprite preview`

---

### Task 5: Final verification

**What to do:**

1. Run `npx vitest run` — expect 1860+ tests passing, 0 failures (excluding pre-existing MessageInput failures)
2. Run `npx tsc --noEmit` — expect 0 errors
3. Verify:
   - Image upload endpoint works
   - ExpressionEditor renders 14 emotion cards
   - Expressions saved to `cardData.extensions.expressions`
   - Preview shows correct sprite
   - ExpressionSprite in chat reads the saved expressions

**Commit:** None (verification only).

---

## Verification

After all tasks:
- `npx vitest run` — 1860+ tests passing
- `npx tsc --noEmit` — 0 errors
- Expression sprites uploadable per emotion in CharacterEditor
- Expressions stored in `cardData.extensions.expressions`
- Preview shows sprite for selected emotion
- Chat displays sprites via ExpressionSprite component
