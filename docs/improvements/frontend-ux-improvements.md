# 前端交互与展示改进方案

基于 SillyTavern 最佳实践的 UI/UX 改进建议

**参考文档:** `sillytavern-best-practices-gap-analysis.md`

---

## 1. 角色卡编辑器 (Character Card Editor)

### 当前问题 ❌
- 只能上传 PNG 文件导入角色卡
- 无法在线创建或编辑角色卡
- 用户不了解各个字段的作用
- 没有实时 token 计数

### SillyTavern 参考
![SillyTavern Character Editor](https://docs.sillytavern.app/static/character-editor.png)

**核心功能:**
- 可视化表单编辑所有字段
- 实时 token 计数 (permanent vs temporary)
- 格式化辅助工具 (PLists, Ali:Chat, W++)
- 预览功能
- 导入/导出 PNG 和 JSON

### 建议实现

#### 1.1 创建 `CharacterCardEditor.vue` 组件

**布局结构:**
```
┌─────────────────────────────────────────────────────┐
│ Character Card Editor                    [Save] [×] │
├─────────────────────────────────────────────────────┤
│ ┌─────────────┐  ┌──────────────────────────────┐  │
│ │             │  │ Basic Info                   │  │
│ │   Avatar    │  │ Name: [____________]         │  │
│ │   Upload    │  │ Creator: [__________]        │  │
│ │             │  │ Version: [__________]        │  │
│ └─────────────┘  └──────────────────────────────┘  │
│                                                      │
│ ┌──────────────────────────────────────────────┐   │
│ │ Token Counter                    🔴 850/2048 │   │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│ │ Permanent: 650 | Temporary: 200              │   │
│ └──────────────────────────────────────────────┘   │
│                                                      │
│ [Description] [Personality] [Scenario] [Examples]   │
│ ┌──────────────────────────────────────────────┐   │
│ │ Description (Permanent - 450 tokens)         │   │
│ │ ┌──────────────────────────────────────────┐ │   │
│ │ │ {{char}} is a...                         │ │   │
│ │ │                                          │ │   │
│ │ └──────────────────────────────────────────┘ │   │
│ │ [Format: Plain Text ▼] [Insert Template ▼]  │   │
│ └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**关键特性:**

1. **实时 Token 计数**
```vue
<template>
  <div class="token-counter" :class="getColorClass()">
    <div class="counter-header">
      <span>Token Usage</span>
      <span class="usage">{{ usedTokens }}/{{ maxTokens }}</span>
    </div>
    <el-progress
      :percentage="(usedTokens / maxTokens) * 100"
      :color="getProgressColor()"
      :show-text="false"
    />
    <div class="breakdown">
      <div class="token-category">
        <span class="label">Permanent:</span>
        <span class="value">{{ permanentTokens }}</span>
        <el-tooltip content="Always included in context">
          <el-icon><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
      <div class="token-category">
        <span class="label">Temporary:</span>
        <span class="value">{{ temporaryTokens }}</span>
        <el-tooltip content="Included until context fills">
          <el-icon><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
    </div>
    <div class="details">
      <div>Description: {{ descriptionTokens }}</div>
      <div>Personality: {{ personalityTokens }}</div>
      <div>Scenario: {{ scenarioTokens }}</div>
      <div>Author's Note: {{ authorNoteTokens }}</div>
      <div>First Message: {{ firstMessageTokens }}</div>
      <div>Examples: {{ examplesTokens }}</div>
    </div>
  </div>
</template>
```

2. **格式化辅助工具**
```vue
<el-select v-model="formatType" placeholder="Select Format">
  <el-option label="Plain Text" value="plain" />
  <el-option label="PLists" value="plist" />
  <el-option label="Ali:Chat" value="alichat" />
  <el-option label="W++" value="wpp" />
  <el-option label="Boostyle" value="boostyle" />
</el-select>

<el-dropdown @command="insertTemplate">
  <el-button>Insert Template <el-icon><ArrowDown /></el-icon></el-button>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item command="plist-basic">
        PLists - Basic Character
      </el-dropdown-item>
      <el-dropdown-item command="alichat-dialogue">
        Ali:Chat - Dialogue Example
      </el-dropdown-item>
      <el-dropdown-item command="wpp-personality">
        W++ - Personality Template
      </el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```

3. **Example Dialogues 编辑器**
```vue
<div class="examples-editor">
  <div class="examples-header">
    <h3>Example Dialogues</h3>
    <el-button @click="addExample" type="primary" size="small">
      <el-icon><Plus /></el-icon> Add Example
    </el-button>
  </div>

  <div v-for="(example, index) in examples" :key="index" class="example-block">
    <div class="example-header">
      <span>Example {{ index + 1 }}</span>
      <el-button @click="removeExample(index)" type="danger" size="small" text>
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>

    <div class="dialogue-lines">
      <div v-for="(line, lineIndex) in example.lines" :key="lineIndex" class="dialogue-line">
        <el-select v-model="line.role" class="role-select">
          <el-option label="{{user}}" value="user" />
          <el-option label="{{char}}" value="char" />
        </el-select>
        <el-input
          v-model="line.content"
          type="textarea"
          :rows="2"
          placeholder="Enter dialogue..."
        />
        <el-button @click="removeLine(index, lineIndex)" text>
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <el-button @click="addLine(index)" size="small" text>
      <el-icon><Plus /></el-icon> Add Line
    </el-button>
  </div>
</div>
```

4. **Character Author's Note 编辑器**
```vue
<el-collapse-item name="author-note">
  <template #title>
    <div class="section-title">
      <span>Character Author's Note</span>
      <el-tag size="small" type="warning">Advanced</el-tag>
      <span class="token-count">{{ authorNoteTokens }} tokens</span>
    </div>
  </template>

  <el-alert type="info" :closable="false" style="margin-bottom: 12px;">
    <template #title>
      Injected before every generation at depth 0 (highest priority).
      Recommended for PLists format compressed traits.
    </template>
  </el-alert>

  <el-input
    v-model="characterData.character_author_note"
    type="textarea"
    :rows="6"
    placeholder="[{{char}}'s persona: trait1, trait2; {{char}}'s body: trait3, trait4]"
  />

  <div class="format-helper">
    <el-button size="small" @click="convertToPList">
      Convert to PLists
    </el-button>
    <el-button size="small" @click="showPListGuide">
      PLists Guide
    </el-button>
  </div>
</el-collapse-item>
```

#### 1.2 字段说明与提示

每个字段都应该有清晰的说明：

```vue
<el-form-item>
  <template #label>
    <span>Description</span>
    <el-tooltip placement="top">
      <template #content>
        <div style="max-width: 300px;">
          <strong>Permanent tokens</strong><br/>
          Contains all important facts the AI should know.<br/>
          Always included in context.<br/>
          Recommended: 200-800 tokens
        </div>
      </template>
      <el-icon><QuestionFilled /></el-icon>
    </el-tooltip>
  </template>
  <!-- input field -->
</el-form-item>
```

#### 1.3 预览功能

```vue
<el-dialog v-model="previewVisible" title="Character Preview" width="800px">
  <div class="preview-container">
    <div class="preview-card">
      <img :src="characterData.avatar" class="preview-avatar" />
      <h2>{{ characterData.name }}</h2>
      <p class="creator">by {{ characterData.creator }}</p>

      <el-tabs>
        <el-tab-pane label="Description">
          <div v-html="renderMarkdown(characterData.description)" />
        </el-tab-pane>
        <el-tab-pane label="Personality">
          <div v-html="renderMarkdown(characterData.personality)" />
        </el-tab-pane>
        <el-tab-pane label="First Message">
          <div class="message-preview">
            {{ characterData.first_mes }}
          </div>
        </el-tab-pane>
        <el-tab-pane label="Examples">
          <div v-for="(example, i) in parsedExamples" :key="i" class="example-preview">
            <div v-for="line in example" :key="line.id" :class="`message-${line.role}`">
              <strong>{{ line.role === 'user' ? 'You' : characterData.name }}:</strong>
              {{ line.content }}
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <div class="preview-stats">
      <h3>Statistics</h3>
      <div class="stat-item">
        <span>Total Tokens:</span>
        <span>{{ totalTokens }}</span>
      </div>
      <div class="stat-item">
        <span>Permanent:</span>
        <span>{{ permanentTokens }}</span>
      </div>
      <div class="stat-item">
        <span>Temporary:</span>
        <span>{{ temporaryTokens }}</span>
      </div>
      <div class="stat-item">
        <span>Alternate Greetings:</span>
        <span>{{ characterData.alternate_greetings?.length || 0 }}</span>
      </div>
    </div>
  </div>
</el-dialog>
```

---

## 2. Context 可视化与调试

### 当前问题 ❌
- 用户不知道 AI 实际"看到"了什么
- 无法调试为什么某些信息没有被使用
- 不清楚 token budget 如何分配

### SillyTavern 参考
- Token Counter 实时显示
- Context Viewer 显示完整 prompt
- World Info 触发状态可视化

### 建议实现

#### 2.1 聊天窗口 Token Counter

在聊天界面顶部显示实时 token 使用情况：

```vue
<!-- src/client/components/chat/ChatTokenCounter.vue -->
<template>
  <div class="chat-token-counter">
    <el-popover placement="bottom" :width="400" trigger="click">
      <template #reference>
        <div class="counter-badge" :class="getStatusClass()">
          <el-icon><Histogram /></el-icon>
          <span>{{ usedTokens }}/{{ maxTokens }}</span>
          <el-progress
            :percentage="percentage"
            :color="getColor()"
            :show-text="false"
            style="width: 60px;"
          />
        </div>
      </template>

      <div class="token-breakdown">
        <h4>Context Token Usage</h4>

        <div class="breakdown-section">
          <div class="section-header">
            <span>Character (Permanent)</span>
            <span class="tokens">{{ characterTokens }}</span>
          </div>
          <div class="section-items">
            <div class="item">
              <span>Description</span>
              <span>{{ descriptionTokens }}</span>
            </div>
            <div class="item">
              <span>Personality</span>
              <span>{{ personalityTokens }}</span>
            </div>
            <div class="item">
              <span>Scenario</span>
              <span>{{ scenarioTokens }}</span>
            </div>
            <div class="item">
              <span>Author's Note</span>
              <span>{{ authorNoteTokens }}</span>
            </div>
          </div>
        </div>

        <div class="breakdown-section">
          <div class="section-header">
            <span>World Info</span>
            <span class="tokens">{{ worldInfoTokens }}</span>
          </div>
          <div class="section-items">
            <div v-for="entry in activeWorldInfoEntries" :key="entry.id" class="item">
              <span>{{ entry.name }}</span>
              <span>{{ entry.tokens }}</span>
            </div>
          </div>
        </div>

        <div class="breakdown-section">
          <div class="section-header">
            <span>Chat History</span>
            <span class="tokens">{{ historyTokens }}</span>
          </div>
          <div class="section-items">
            <div class="item">
              <span>Messages included</span>
              <span>{{ includedMessageCount }}/{{ totalMessageCount }}</span>
            </div>
          </div>
        </div>

        <div class="breakdown-section">
          <div class="section-header">
            <span>Intelligence</span>
            <span class="tokens">{{ intelligenceTokens }}</span>
          </div>
          <div class="section-items">
            <div class="item">
              <span>Memories</span>
              <span>{{ memoryTokens }}</span>
            </div>
            <div class="item">
              <span>Emotion</span>
              <span>{{ emotionTokens }}</span>
            </div>
          </div>
        </div>

        <div class="breakdown-total">
          <span>Available for Response</span>
          <span class="available">{{ availableTokens }}</span>
        </div>

        <el-button @click="showContextViewer" size="small" style="width: 100%; margin-top: 12px;">
          View Full Context
        </el-button>
      </div>
    </el-popover>
  </div>
</template>
```

#### 2.2 Context Viewer (完整 Prompt 查看器)

```vue
<!-- src/client/components/chat/ContextViewer.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="Context Viewer"
    width="90%"
    :fullscreen="isFullscreen"
  >
    <div class="context-viewer">
      <div class="viewer-toolbar">
        <el-radio-group v-model="viewMode">
          <el-radio-button label="formatted">Formatted</el-radio-button>
          <el-radio-button label="raw">Raw JSON</el-radio-button>
          <el-radio-button label="tokens">Token View</el-radio-button>
        </el-radio-group>

        <div class="toolbar-actions">
          <el-button @click="copyToClipboard" size="small">
            <el-icon><CopyDocument /></el-icon> Copy
          </el-button>
          <el-button @click="isFullscreen = !isFullscreen" size="small">
            <el-icon><FullScreen /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- Formatted View -->
      <div v-if="viewMode === 'formatted'" class="formatted-view">
        <div v-for="(message, index) in contextMessages" :key="index" class="context-message">
          <div class="message-header">
            <el-tag :type="getRoleTagType(message.role)" size="small">
              {{ message.role }}
            </el-tag>
            <span class="message-index">#{{ index }}</span>
            <span class="message-tokens">{{ estimateTokens(message.content) }} tokens</span>
            <el-tag v-if="message.source" size="small" type="info">
              {{ message.source }}
            </el-tag>
          </div>
          <div class="message-content">
            <pre>{{ message.content }}</pre>
          </div>
        </div>
      </div>

      <!-- Raw JSON View -->
      <div v-else-if="viewMode === 'raw'" class="raw-view">
        <pre><code>{{ JSON.stringify(contextMessages, null, 2) }}</code></pre>
      </div>

      <!-- Token View -->
      <div v-else class="token-view">
        <div class="token-visualization">
          <div
            v-for="(message, index) in contextMessages"
            :key="index"
            class="token-block"
            :style="{ height: `${(estimateTokens(message.content) / totalTokens) * 100}%` }"
            :class="`role-${message.role}`"
          >
            <el-tooltip :content="`${message.role}: ${estimateTokens(message.content)} tokens`">
              <div class="block-content">
                {{ message.role }}
              </div>
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>
```

#### 2.3 World Info 触发状态可视化

在 World Book 管理界面添加"测试扫描"功能：

```vue
<!-- src/client/components/worldbook/WorldBookTester.vue -->
<template>
  <div class="worldbook-tester">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>World Info Scan Tester</span>
          <el-button @click="runTest" type="primary" size="small">
            <el-icon><Search /></el-icon> Test Scan
          </el-button>
        </div>
      </template>

      <el-input
        v-model="testText"
        type="textarea"
        :rows="6"
        placeholder="Enter text to test which World Info entries would be triggered..."
      />

      <div v-if="testResults" class="test-results">
        <h4>Triggered Entries ({{ testResults.triggered.length }})</h4>

        <div v-for="entry in testResults.triggered" :key="entry.id" class="result-entry triggered">
          <div class="entry-header">
            <el-icon color="#67c23a"><CircleCheck /></el-icon>
            <span class="entry-name">{{ entry.name }}</span>
            <el-tag size="small">{{ entry.tokens }} tokens</el-tag>
            <el-tag size="small" type="info">Depth {{ entry.depth }}</el-tag>
          </div>
          <div class="entry-keys">
            <span>Matched keys:</span>
            <el-tag
              v-for="key in entry.matchedKeys"
              :key="key"
              size="small"
              type="success"
            >
              {{ key }}
            </el-tag>
          </div>
          <div class="entry-content">
            {{ entry.content.substring(0, 200) }}...
          </div>
        </div>

        <h4>Not Triggered ({{ testResults.notTriggered.length }})</h4>

        <el-collapse>
          <el-collapse-item
            v-for="entry in testResults.notTriggered"
            :key="entry.id"
            :title="entry.name"
          >
            <div class="entry-keys">
              <span>Keys:</span>
              <el-tag v-for="key in entry.keys" :key="key" size="small">
                {{ key }}
              </el-tag>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-card>
  </div>
</template>
```


---

## 3. 消息交互增强

### 当前问题 ❌
- 无法固定重要消息
- 无法标记消息重要性
- 删除消息可能破坏对话连贯性

### SillyTavern 参考
- Pin messages (固定消息)
- Message importance scoring
- Swipe between alternative responses

### 建议实现

#### 3.1 消息固定功能

```vue
<!-- src/client/components/chat/MessageBubble.vue -->
<template>
  <div class="message-bubble" :class="{ pinned: message.pinned }">
    <!-- Existing message content -->

    <div class="message-actions">
      <!-- Existing actions: edit, delete, regenerate -->

      <el-tooltip :content="message.pinned ? 'Unpin' : 'Pin message'">
        <el-button
          @click="togglePin"
          :type="message.pinned ? 'warning' : 'default'"
          size="small"
          text
        >
          <el-icon><PushPin /></el-icon>
        </el-button>
      </el-tooltip>

      <el-tooltip content="Set importance">
        <el-dropdown @command="setImportance">
          <el-button size="small" text>
            <el-icon><Star /></el-icon>
            <span v-if="message.importance">{{ message.importance }}</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="10">
                <el-rate :model-value="5" disabled size="small" />
                Critical (10)
              </el-dropdown-item>
              <el-dropdown-item :command="8">
                <el-rate :model-value="4" disabled size="small" />
                High (8)
              </el-dropdown-item>
              <el-dropdown-item :command="5">
                <el-rate :model-value="3" disabled size="small" />
                Normal (5)
              </el-dropdown-item>
              <el-dropdown-item :command="3">
                <el-rate :model-value="2" disabled size="small" />
                Low (3)
              </el-dropdown-item>
              <el-dropdown-item :command="1">
                <el-rate :model-value="1" disabled size="small" />
                Minimal (1)
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-tooltip>
    </div>

    <!-- Pinned indicator -->
    <div v-if="message.pinned" class="pinned-indicator">
      <el-icon><PushPin /></el-icon>
      <span>Pinned - Always included in context</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const togglePin = async () => {
  await chatStore.updateMessage(message.id, {
    pinned: !message.pinned
  });
};

const setImportance = async (importance: number) => {
  await chatStore.updateMessage(message.id, { importance });
};
</script>
```

#### 3.2 Alternative Responses (Swipe)

SillyTavern 允许为同一条用户消息生成多个 AI 回复，用户可以左右滑动选择：

```vue
<!-- src/client/components/chat/MessageSwiper.vue -->
<template>
  <div class="message-swiper">
    <div class="swiper-container">
      <el-button
        @click="previousVariant"
        :disabled="currentVariantIndex === 0"
        class="swiper-button prev"
        circle
      >
        <el-icon><ArrowLeft /></el-icon>
      </el-button>

      <div class="message-content">
        <MessageBubble :message="currentVariant" />
      </div>

      <el-button
        @click="nextVariant"
        :disabled="currentVariantIndex === variants.length - 1"
        class="swiper-button next"
        circle
      >
        <el-icon><ArrowRight /></el-icon>
      </el-button>
    </div>

    <div class="swiper-indicator">
      <span>{{ currentVariantIndex + 1 }} / {{ variants.length }}</span>
      <el-button @click="generateNewVariant" size="small" text>
        <el-icon><Refresh /></el-icon> Generate Another
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  messageId: string;
  variants: Message[];
}>();

const currentVariantIndex = ref(0);

const currentVariant = computed(() => props.variants[currentVariantIndex.value]);

const previousVariant = () => {
  if (currentVariantIndex.value > 0) {
    currentVariantIndex.value--;
  }
};

const nextVariant = () => {
  if (currentVariantIndex.value < props.variants.length - 1) {
    currentVariantIndex.value++;
  }
};

const generateNewVariant = async () => {
  // Regenerate response for the same user message
  await chatStore.regenerateMessage(props.messageId);
};
</script>
```

#### 3.3 Quick Replies (快速回复)

```vue
<!-- src/client/components/chat/QuickReplies.vue -->
<template>
  <div class="quick-replies">
    <el-button
      v-for="reply in quickReplies"
      :key="reply.id"
      @click="sendQuickReply(reply)"
      size="small"
      class="quick-reply-button"
    >
      {{ reply.label }}
    </el-button>

    <el-button @click="showQuickReplyEditor" size="small" text>
      <el-icon><Setting /></el-icon> Manage
    </el-button>
  </div>
</template>

<script setup lang="ts">
interface QuickReply {
  id: string;
  label: string;
  content: string;
}

const quickReplies = ref<QuickReply[]>([
  { id: '1', label: 'Continue', content: 'Please continue.' },
  { id: '2', label: 'Explain', content: 'Can you explain that in more detail?' },
  { id: '3', label: 'Summarize', content: 'Can you summarize what we discussed?' },
]);

const sendQuickReply = (reply: QuickReply) => {
  // Replace {{char}} and {{user}} placeholders
  const content = reply.content
    .replace(/\{\{char\}\}/gi, chatStore.currentCharacter?.name || 'Character')
    .replace(/\{\{user\}\}/gi, userStore.user?.username || 'User');

  chatStore.sendMessage(content);
};
</script>
```

---

## 4. World Book 管理增强

### 当前问题 ❌
- 界面功能有限
- 无法批量管理 entries
- 没有导入/导出功能
- 无法可视化 entry 之间的关系

### SillyTavern 参考
- Lorebook 可视化编辑器
- 支持 SillyTavern JSON 格式导入/导出
- Entry 依赖关系可视化

### 建议实现

#### 4.1 增强的 World Book 编辑器

```vue
<!-- src/client/components/worldbook/WorldBookEditor.vue -->
<template>
  <div class="worldbook-editor">
    <div class="editor-toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="Search entries..."
        prefix-icon="Search"
        clearable
      />

      <el-button-group>
        <el-button @click="createEntry" type="primary">
          <el-icon><Plus /></el-icon> New Entry
        </el-button>
        <el-button @click="importLorebook">
          <el-icon><Upload /></el-icon> Import
        </el-button>
        <el-button @click="exportLorebook">
          <el-icon><Download /></el-icon> Export
        </el-button>
      </el-button-group>

      <el-dropdown @command="handleBulkAction">
        <el-button>
          Bulk Actions <el-icon><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="enable">Enable Selected</el-dropdown-item>
            <el-dropdown-item command="disable">Disable Selected</el-dropdown-item>
            <el-dropdown-item command="delete">Delete Selected</el-dropdown-item>
            <el-dropdown-item command="export">Export Selected</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="editor-content">
      <!-- Entry List -->
      <div class="entry-list">
        <el-checkbox-group v-model="selectedEntries">
          <div
            v-for="entry in filteredEntries"
            :key="entry.id"
            class="entry-item"
            :class="{ active: entry.id === activeEntryId }"
            @click="selectEntry(entry.id)"
          >
            <el-checkbox :label="entry.id" @click.stop />

            <div class="entry-info">
              <div class="entry-header">
                <span class="entry-name">{{ entry.name }}</span>
                <el-tag v-if="!entry.enabled" size="small" type="info">Disabled</el-tag>
                <el-tag size="small">{{ entry.tokens }} tokens</el-tag>
              </div>
              <div class="entry-keys">
                <el-tag
                  v-for="key in entry.keys.slice(0, 3)"
                  :key="key"
                  size="small"
                  type="info"
                >
                  {{ key }}
                </el-tag>
                <span v-if="entry.keys.length > 3">+{{ entry.keys.length - 3 }}</span>
              </div>
            </div>

            <div class="entry-actions">
              <el-button @click.stop="duplicateEntry(entry.id)" size="small" text>
                <el-icon><CopyDocument /></el-icon>
              </el-button>
              <el-button @click.stop="deleteEntry(entry.id)" size="small" text type="danger">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </el-checkbox-group>
      </div>

      <!-- Entry Editor -->
      <div v-if="activeEntry" class="entry-editor">
        <el-form :model="activeEntry" label-position="top">
          <el-form-item label="Entry Name">
            <el-input v-model="activeEntry.name" />
          </el-form-item>

          <el-form-item label="Keys (comma-separated)">
            <el-input
              v-model="keysInput"
              placeholder="key1, key2, key3"
              @blur="updateKeys"
            />
            <div class="keys-preview">
              <el-tag
                v-for="key in activeEntry.keys"
                :key="key"
                closable
                @close="removeKey(key)"
              >
                {{ key }}
              </el-tag>
            </div>
          </el-form-item>

          <el-row :gutter="12">
            <el-col :span="8">
              <el-form-item label="Depth">
                <el-input-number
                  v-model="activeEntry.depth"
                  :min="0"
                  :max="10"
                />
                <el-tooltip content="0 = highest priority (before last user message)">
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="Insertion Order">
                <el-input-number
                  v-model="activeEntry.insertionOrder"
                  :min="0"
                  :max="999"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="Priority">
                <el-input-number
                  v-model="activeEntry.priority"
                  :min="0"
                  :max="100"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <el-form-item label="Content">
            <el-input
              v-model="activeEntry.content"
              type="textarea"
              :rows="12"
            />
            <div class="content-stats">
              <span>{{ activeEntry.tokens }} tokens</span>
              <span>{{ activeEntry.content.length }} characters</span>
            </div>
          </el-form-item>

          <el-form-item label="Advanced Options">
            <el-checkbox v-model="activeEntry.enabled">Enabled</el-checkbox>
            <el-checkbox v-model="activeEntry.recursive">
              Recursive Scanning
              <el-tooltip content="Scan this entry's content for other entry keys">
                <el-icon><QuestionFilled /></el-icon>
              </el-tooltip>
            </el-checkbox>
            <el-checkbox v-model="activeEntry.caseSensitive">Case Sensitive</el-checkbox>
          </el-form-item>

          <el-form-item label="Character Filter">
            <el-select
              v-model="activeEntry.characterFilter"
              multiple
              placeholder="All characters"
            >
              <el-option
                v-for="char in characters"
                :key="char.id"
                :label="char.name"
                :value="char.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item>
            <el-button @click="saveEntry" type="primary">Save</el-button>
            <el-button @click="cancelEdit">Cancel</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>
```

#### 4.2 Lorebook 导入/导出

```typescript
// src/client/services/lorebook.service.ts

export interface SillyTavernLorebook {
  name: string;
  description?: string;
  entries: {
    uid: number;
    key: string[];
    keysecondary: string[];
    comment: string;
    content: string;
    constant: boolean;
    selective: boolean;
    insertion_order: number;
    enabled: boolean;
    position: 'before_char' | 'after_char';
    use_regex: boolean;
    extensions: {
      position: number;
      exclude_recursion: boolean;
      display_index: number;
      probability: number;
      useProbability: boolean;
      depth: number;
      selectiveLogic: number;
      group: string;
      group_override: boolean;
      group_weight: number;
      prevent_recursion: boolean;
      delay_until_recursion: boolean;
      scan_depth: number | null;
      match_whole_words: boolean | null;
      use_group_scoring: boolean;
      case_sensitive: boolean | null;
      automation_id: string;
      role: number;
      vectorized: boolean;
      sticky: number;
      cooldown: number;
      delay: number;
    };
  }[];
}

export async function importSillyTavernLorebook(
  file: File,
  worldbookId: string
): Promise<void> {
  const content = await file.text();
  const lorebook: SillyTavernLorebook = JSON.parse(content);

  for (const entry of lorebook.entries) {
    await worldbookEntryService.create({
      worldbookId,
      name: entry.comment || entry.key[0],
      keys: [...entry.key, ...entry.keysecondary],
      content: entry.content,
      enabled: entry.enabled,
      depth: entry.extensions.depth || 4,
      insertionOrder: entry.insertion_order,
      priority: entry.extensions.group_weight || 50,
      recursive: !entry.extensions.prevent_recursion,
      caseSensitive: entry.extensions.case_sensitive ?? false,
      position: entry.position === 'before_char' ? 'before_character' : 'after_character',
    });
  }
}

export async function exportSillyTavernLorebook(
  worldbookId: string
): Promise<SillyTavernLorebook> {
  const entries = await worldbookEntryService.findByWorldbookId(worldbookId);

  return {
    name: 'Exported Lorebook',
    entries: entries.map((entry, index) => ({
      uid: index,
      key: entry.keys,
      keysecondary: [],
      comment: entry.name,
      content: entry.content,
      constant: false,
      selective: false,
      insertion_order: entry.insertionOrder,
      enabled: entry.enabled,
      position: entry.position === 'before_character' ? 'before_char' : 'after_char',
      use_regex: false,
      extensions: {
        position: 0,
        exclude_recursion: !entry.recursive,
        display_index: index,
        probability: 100,
        useProbability: false,
        depth: entry.depth,
        selectiveLogic: 0,
        group: '',
        group_override: false,
        group_weight: entry.priority,
        prevent_recursion: !entry.recursive,
        delay_until_recursion: false,
        scan_depth: null,
        match_whole_words: null,
        use_group_scoring: false,
        case_sensitive: entry.caseSensitive,
        automation_id: '',
        role: 0,
        vectorized: false,
        sticky: 0,
        cooldown: 0,
        delay: 0,
      },
    })),
  };
}
```


---

## 5. 用户体验优化

### 5.1 Onboarding & Tutorials

新用户首次使用时的引导：

```vue
<!-- src/client/components/onboarding/OnboardingTour.vue -->
<template>
  <el-tour v-model="currentStep" :steps="tourSteps">
    <template #default="{ current }">
      <div class="tour-content">
        <h3>{{ tourSteps[current].title }}</h3>
        <p>{{ tourSteps[current].description }}</p>
        <img v-if="tourSteps[current].image" :src="tourSteps[current].image" />
      </div>
    </template>
  </el-tour>
</template>

<script setup lang="ts">
const tourSteps = [
  {
    target: '.character-selector',
    title: 'Select a Character',
    description: 'Choose a character to chat with, or create your own!',
  },
  {
    target: '.token-counter',
    title: 'Token Counter',
    description: 'Monitor your context usage. Green = plenty of space, Red = running out!',
  },
  {
    target: '.message-input',
    title: 'Send Messages',
    description: 'Type your message here. Use Shift+Enter for new lines.',
  },
  {
    target: '.memory-button',
    title: 'Character Memory',
    description: 'View what the character remembers about your conversations.',
  },
  {
    target: '.worldbook-button',
    title: 'World Info',
    description: 'Add background lore that gets injected when relevant keywords appear.',
  },
];
</script>
```

### 5.2 Character Card Templates

提供预设模板降低创建门槛：

```vue
<!-- src/client/components/character/CharacterTemplates.vue -->
<template>
  <el-dialog v-model="visible" title="Character Templates" width="800px">
    <div class="templates-grid">
      <el-card
        v-for="template in templates"
        :key="template.id"
        class="template-card"
        @click="selectTemplate(template)"
      >
        <img :src="template.thumbnail" class="template-thumbnail" />
        <h3>{{ template.name }}</h3>
        <p>{{ template.description }}</p>
        <div class="template-stats">
          <el-tag size="small">{{ template.tokens }} tokens</el-tag>
          <el-tag size="small" type="info">{{ template.format }}</el-tag>
        </div>
      </el-card>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
const templates = [
  {
    id: 'minimalist',
    name: 'Minimalist (PLists)',
    description: 'Token-efficient character using PLists format. ~400 tokens.',
    format: 'PLists',
    tokens: 400,
    thumbnail: '/templates/minimalist.png',
    data: {
      description: '',
      personality: '',
      scenario: '',
      character_author_note: '[{{char}}\'s persona: trait1, trait2; {{char}}\'s body: trait3]',
      first_mes: 'Hello!',
      mes_example: '<START>\n{{user}}: Hi!\n{{char}}: *waves* Hello there!',
    },
  },
  {
    id: 'detailed',
    name: 'Detailed (Ali:Chat)',
    description: 'Rich character with dialogue examples. ~800 tokens.',
    format: 'Ali:Chat',
    tokens: 800,
    thumbnail: '/templates/detailed.png',
    data: {
      description: '{{char}} is a...\n\n<START>\n{{user}}: Tell me about yourself.\n{{char}}: *smiles warmly* Well...',
      personality: 'friendly, curious, helpful',
      scenario: 'You meet {{char}} at...',
      first_mes: '*{{char}} approaches with a warm smile*\n\nHello! I\'ve been looking forward to meeting you.',
      mes_example: '<START>\n{{user}}: What do you like to do?\n{{char}}: *eyes light up* Oh, I love...',
    },
  },
  {
    id: 'roleplay',
    name: 'Roleplay (W++)',
    description: 'Structured roleplay character. ~600 tokens.',
    format: 'W++',
    tokens: 600,
    thumbnail: '/templates/roleplay.png',
    data: {
      description: '{{char}}= [Character("Name") {Age("25") Gender("Female") ...}]',
      personality: 'Personality("trait1" + "trait2")',
      scenario: 'Scenario("You are...")',
      first_mes: '*The scene begins...*',
      mes_example: '',
    },
  },
];
</script>
```

### 5.3 Format Conversion Tools

帮助用户在不同格式之间转换：

```vue
<!-- src/client/components/character/FormatConverter.vue -->
<template>
  <el-dialog v-model="visible" title="Format Converter" width="900px">
    <div class="converter-layout">
      <div class="input-section">
        <h3>Input</h3>
        <el-select v-model="inputFormat" placeholder="Select format">
          <el-option label="Plain Text" value="plain" />
          <el-option label="PLists" value="plist" />
          <el-option label="Ali:Chat" value="alichat" />
          <el-option label="W++" value="wpp" />
          <el-option label="Boostyle" value="boostyle" />
        </el-select>
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="15"
          placeholder="Paste your character description here..."
        />
      </div>

      <div class="converter-arrow">
        <el-button @click="convert" type="primary" circle>
          <el-icon><Right /></el-icon>
        </el-button>
      </div>

      <div class="output-section">
        <h3>Output</h3>
        <el-select v-model="outputFormat" placeholder="Select format">
          <el-option label="Plain Text" value="plain" />
          <el-option label="PLists" value="plist" />
          <el-option label="Ali:Chat" value="alichat" />
          <el-option label="W++" value="wpp" />
          <el-option label="Boostyle" value="boostyle" />
        </el-select>
        <el-input
          v-model="outputText"
          type="textarea"
          :rows="15"
          readonly
        />
        <div class="output-stats">
          <span>Input: {{ inputTokens }} tokens</span>
          <span>Output: {{ outputTokens }} tokens</span>
          <span :class="{ positive: tokenSaved > 0, negative: tokenSaved < 0 }">
            {{ tokenSaved > 0 ? '-' : '+' }}{{ Math.abs(tokenSaved) }} tokens
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="copyOutput">Copy Output</el-button>
      <el-button @click="applyToCharacter" type="primary">Apply to Character</el-button>
    </template>
  </el-dialog>
</template>
```

### 5.4 Keyboard Shortcuts

```vue
<!-- src/client/composables/useKeyboardShortcuts.ts -->
export function useKeyboardShortcuts() {
  const shortcuts = {
    'Ctrl+Enter': 'Send message',
    'Ctrl+R': 'Regenerate last response',
    'Ctrl+E': 'Edit last message',
    'Ctrl+D': 'Delete last message',
    'Ctrl+K': 'Open character selector',
    'Ctrl+/': 'Show shortcuts help',
    'Ctrl+B': 'Toggle sidebar',
    'Ctrl+T': 'Toggle token counter',
    'Ctrl+M': 'Toggle memory panel',
    'Ctrl+W': 'Toggle world info panel',
    'Esc': 'Close dialogs',
  };

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
  });

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          chatStore.sendMessage();
          break;
        case 'r':
          e.preventDefault();
          chatStore.regenerateLastMessage();
          break;
        // ... more shortcuts
      }
    }
  };

  return { shortcuts };
}
```

### 5.5 Accessibility Improvements

```vue
<!-- Ensure all interactive elements have proper ARIA labels -->
<el-button
  @click="sendMessage"
  aria-label="Send message"
  :aria-disabled="!canSend"
>
  <el-icon><Promotion /></el-icon>
</el-button>

<!-- Add keyboard navigation to message list -->
<div
  v-for="(message, index) in messages"
  :key="message.id"
  :tabindex="0"
  role="article"
  :aria-label="`Message from ${message.role} at ${formatTime(message.createdAt)}`"
  @keydown.enter="selectMessage(message)"
>
  <!-- message content -->
</div>

<!-- Screen reader announcements for dynamic content -->
<div role="status" aria-live="polite" class="sr-only">
  {{ statusMessage }}
</div>
```

---

## 6. 性能优化

### 6.1 Virtual Scrolling for Long Chats

```vue
<!-- src/client/components/chat/VirtualMessageList.vue -->
<template>
  <div ref="containerRef" class="virtual-message-list">
    <RecycleScroller
      :items="messages"
      :item-size="estimateItemSize"
      key-field="id"
      v-slot="{ item }"
    >
      <MessageBubble :message="item" />
    </RecycleScroller>
  </div>
</template>

<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

const estimateItemSize = (message: Message) => {
  // Estimate height based on content length
  const baseHeight = 80;
  const contentHeight = Math.ceil(message.content.length / 50) * 20;
  return baseHeight + contentHeight;
};
</script>
```

### 6.2 Debounced Token Counting

```typescript
// src/client/composables/useTokenCounter.ts
import { debounce } from 'lodash-es';

export function useTokenCounter() {
  const tokens = ref(0);

  const countTokens = debounce(async (text: string) => {
    // Call backend API to estimate tokens
    const result = await api.post('/utils/estimate-tokens', { text });
    tokens.value = result.tokens;
  }, 300);

  return { tokens, countTokens };
}
```

### 6.3 Lazy Loading for Character Cards

```vue
<template>
  <div class="character-grid">
    <el-card
      v-for="character in visibleCharacters"
      :key="character.id"
      v-loading="character.loading"
    >
      <img
        v-lazy="character.avatar"
        :alt="character.name"
        class="character-avatar"
      />
      <!-- character info -->
    </el-card>

    <div ref="sentinelRef" class="load-more-sentinel" />
  </div>
</template>

<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core';

const sentinelRef = ref<HTMLElement>();
const page = ref(1);

useIntersectionObserver(
  sentinelRef,
  ([{ isIntersecting }]) => {
    if (isIntersecting) {
      loadMoreCharacters();
    }
  }
);

const loadMoreCharacters = async () => {
  page.value++;
  const newCharacters = await characterService.list({ page: page.value });
  characters.value.push(...newCharacters);
};
</script>
```

---

## 7. 实施优先级

### P0 - 立即实现 (本周)
1. **Token Counter UI** - 用户最需要的可见性
2. **Character Author's Note Editor** - 支持 PLists 优化
3. **Message Pin/Importance** - 改善 context management

### P1 - 高优先级 (2周内)
4. **Character Card Editor** - 降低使用门槛
5. **Context Viewer** - 调试工具
6. **World Book Tester** - 验证 lore 触发

### P2 - 中优先级 (1个月内)
7. **Alternative Responses (Swipe)** - 提升用户体验
8. **Quick Replies** - 便利功能
9. **Format Converter** - 帮助用户迁移
10. **Lorebook Import/Export** - 兼容性

### P3 - 低优先级 (未来)
11. **Onboarding Tour** - 新用户引导
12. **Character Templates** - 降低创建门槛
13. **Keyboard Shortcuts** - 高级用户功能
14. **Virtual Scrolling** - 性能优化

---

## 8. 技术实现建议

### 8.1 新增 Pinia Store

```typescript
// src/client/stores/editor.ts
export const useEditorStore = defineStore('editor', () => {
  const activeCharacter = ref<CharacterCardData | null>(null);
  const tokenBreakdown = ref<TokenBreakdown>({
    description: 0,
    personality: 0,
    scenario: 0,
    authorNote: 0,
    firstMessage: 0,
    examples: 0,
  });

  const calculateTokens = async () => {
    if (!activeCharacter.value) return;

    const results = await Promise.all([
      api.post('/utils/estimate-tokens', { text: activeCharacter.value.description }),
      api.post('/utils/estimate-tokens', { text: activeCharacter.value.personality }),
      // ... more fields
    ]);

    tokenBreakdown.value = {
      description: results[0].tokens,
      personality: results[1].tokens,
      // ...
    };
  };

  return {
    activeCharacter,
    tokenBreakdown,
    calculateTokens,
  };
});
```

### 8.2 新增 API Endpoints

```typescript
// src/server/routes/utils.ts
app.post('/api/v1/utils/estimate-tokens', async (c) => {
  const { text } = await c.req.json();
  const tokens = estimateTokens(text);
  return c.json({ tokens });
});

app.post('/api/v1/utils/convert-format', async (c) => {
  const { text, from, to } = await c.req.json();
  const converted = convertFormat(text, from, to);
  return c.json({ converted, tokens: estimateTokens(converted) });
});

app.post('/api/v1/worldbook/test-scan', async (c) => {
  const { worldbookId, text } = await c.req.json();
  const results = await worldInfoEngine.testScan(worldbookId, text);
  return c.json(results);
});
```

### 8.3 新增 Database Fields

```sql
-- Add to messages table
ALTER TABLE messages
ADD COLUMN pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN importance INTEGER DEFAULT 5,
ADD COLUMN variants JSONB DEFAULT '[]';

-- Add to worldbook_entries table
ALTER TABLE worldbook_entries
ADD COLUMN depth INTEGER DEFAULT 4,
ADD COLUMN insertion_order INTEGER DEFAULT 100,
ADD COLUMN recursive BOOLEAN DEFAULT TRUE,
ADD COLUMN case_sensitive BOOLEAN DEFAULT FALSE,
ADD COLUMN character_filter TEXT[],
ADD COLUMN character_exclusion TEXT[];

-- Add to characters table (for cardData)
-- character_author_note is stored in cardData JSONB field
```

---

## 总结

基于 SillyTavern 最佳实践，我们的前端需要以下核心改进：

### 最重要的 3 个功能
1. **Token Counter** - 让用户看到 context 使用情况
2. **Character Card Editor** - 降低角色创建门槛
3. **Context Viewer** - 调试工具，理解 AI "看到"了什么

### 用户体验提升
- Message pinning/importance
- Alternative responses (swipe)
- Quick replies
- World Book tester
- Format converter

### 技术债务
- Virtual scrolling for performance
- Debounced token counting
- Lazy loading for character cards

**预计工作量:** 4-6 周 (2 个开发者)

**最后更新:** 2026-03-01
