<template>
  <div class="character-card-editor">
    <el-tabs v-model="activeTab" class="editor-tabs">
      <!-- Basic Info Tab -->
      <el-tab-pane label="Basic Info" name="basic">
        <el-form :model="cardData" label-position="top">
          <el-form-item label="Name">
            <el-input v-model="cardData.name" placeholder="Character name" @input="emitUpdate" />
            <span class="token-count">{{ estimateTokens(cardData.name || '') }} tokens</span>
          </el-form-item>

          <el-form-item label="Description">
            <el-input
              v-model="cardData.description"
              type="textarea"
              :rows="6"
              placeholder="Physical appearance, background, etc."
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.description || '') }} tokens</span>
          </el-form-item>

          <el-form-item label="Personality">
            <el-input
              v-model="cardData.personality"
              type="textarea"
              :rows="4"
              placeholder="Character traits, behavior patterns"
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.personality || '') }} tokens</span>
          </el-form-item>

          <el-form-item label="Scenario">
            <el-input
              v-model="cardData.scenario"
              type="textarea"
              :rows="4"
              placeholder="Current situation, setting"
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.scenario || '') }} tokens</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Greetings Tab -->
      <el-tab-pane label="Greetings" name="greetings">
        <el-form :model="cardData" label-position="top">
          <el-form-item label="First Message">
            <el-input
              v-model="cardData.first_mes"
              type="textarea"
              :rows="6"
              placeholder="The character's opening message"
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.first_mes || '') }} tokens</span>
          </el-form-item>

          <el-form-item label="Alternate Greetings">
            <div class="alternate-greetings">
              <div
                v-for="(greeting, index) in alternateGreetings"
                :key="index"
                class="greeting-item"
              >
                <el-input
                  v-model="alternateGreetings[index]"
                  type="textarea"
                  :rows="4"
                  :placeholder="`Alternate greeting ${index + 1}`"
                  @input="updateAlternateGreetings"
                />
                <div class="greeting-actions">
                  <span class="token-count">{{ estimateTokens(greeting) }} tokens</span>
                  <el-button
                    text
                    type="danger"
                    @click="removeGreeting(index)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
              <el-button @click="addGreeting" class="add-greeting-btn">
                <el-icon><Plus /></el-icon> Add Alternate Greeting
              </el-button>
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Example Dialogues Tab -->
      <el-tab-pane label="Example Dialogues" name="examples">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="format-hint"
        >
          <template #title>
            Format: Use <code>&lt;START&gt;</code> to separate multiple examples. Use <code>{{char}}</code> and <code>{{user}}</code> placeholders.
          </template>
        </el-alert>
        <el-form :model="cardData" label-position="top">
          <el-form-item label="Example Dialogues">
            <el-input
              v-model="cardData.mes_example"
              type="textarea"
              :rows="12"
              placeholder="{{user}}: Hello!&#10;{{char}}: Hi there! How can I help you?&#10;<START>&#10;{{user}}: What's your favorite color?&#10;{{char}}: I love blue!"
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.mes_example || '') }} tokens</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Advanced Tab -->
      <el-tab-pane label="Advanced" name="advanced">
        <el-form :model="cardData" label-position="top">
          <el-form-item label="System Prompt (Optional)">
            <el-input
              v-model="cardData.system_prompt"
              type="textarea"
              :rows="6"
              placeholder="Custom system prompt. Use {{original}} to include default prompt."
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.system_prompt || '') }} tokens</span>
          </el-form-item>

          <el-form-item label="Character Author's Note">
            <el-alert
              type="info"
              :closable="false"
              show-icon
              class="format-hint"
            >
              <template #title>
                Injected at depth 0 (highest priority). Use PLists format for compressed traits.
              </template>
            </el-alert>
            <el-input
              v-model="cardData.character_author_note"
              type="textarea"
              :rows="4"
              placeholder="[{{char}}'s persona: trait1, trait2; {{char}}'s body: feature1, feature2]"
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.character_author_note || '') }} tokens</span>
          </el-form-item>

          <el-form-item label="Post-History Instructions">
            <el-input
              v-model="cardData.post_history_instructions"
              type="textarea"
              :rows="4"
              placeholder="Instructions inserted after chat history"
              @input="emitUpdate"
            />
            <span class="token-count">{{ estimateTokens(cardData.post_history_instructions || '') }} tokens</span>
          </el-form-item>

          <el-form-item label="Creator Notes">
            <el-input
              v-model="cardData.creator_notes"
              type="textarea"
              :rows="3"
              placeholder="Notes for other users (not sent to AI)"
              @input="emitUpdate"
            />
          </el-form-item>

          <el-form-item label="Tags">
            <el-select
              v-model="tags"
              multiple
              filterable
              allow-create
              placeholder="Add tags"
              @change="updateTags"
              style="width: 100%"
            >
              <el-option
                v-for="tag in commonTags"
                :key="tag"
                :label="tag"
                :value="tag"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="Prompt Template">
            <el-alert
              type="info"
              :closable="false"
              show-icon
              class="format-hint"
              style="margin-bottom: 8px"
            >
              <template #title>
                Choose a prompt format for models that don't support chat completion API (e.g., Alpaca, Vicuna).
              </template>
            </el-alert>
            <el-select
              v-model="promptTemplate"
              placeholder="Select prompt template"
              @change="updatePromptTemplate"
              style="width: 100%"
            >
              <el-option label="Default (OpenAI Chat)" value="default" />
              <el-option label="Alpaca" value="alpaca" />
              <el-option label="ChatML" value="chatml" />
              <el-option label="Vicuna" value="vicuna" />
              <el-option label="Llama 2 Chat" value="llama2" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Regex Scripts Tab -->
      <el-tab-pane label="Regex Scripts" name="regex">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="format-hint"
          style="margin-bottom: 16px"
        >
          <template #title>
            Regex scripts post-process AI output. Use for formatting, censoring, or transforming responses.
          </template>
        </el-alert>

        <div class="regex-scripts-editor">
          <div class="scripts-header">
            <h3>Scripts ({{ regexScripts.length }})</h3>
            <el-button type="primary" @click="addRegexScript">
              <el-icon><Plus /></el-icon> Add Script
            </el-button>
          </div>

          <el-empty
            v-if="regexScripts.length === 0"
            description="No regex scripts defined"
          />

          <div v-else class="scripts-list">
            <el-card
              v-for="(script, index) in regexScripts"
              :key="index"
              class="script-card"
              shadow="hover"
            >
              <div class="script-header">
                <el-switch
                  v-model="script.enabled"
                  @change="emitUpdate"
                  style="margin-right: 12px"
                />
                <el-input
                  v-model="script.scriptName"
                  placeholder="Script name"
                  style="flex: 1; max-width: 300px"
                  @input="emitUpdate"
                />
                <el-button
                  text
                  type="danger"
                  @click="removeRegexScript(index)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>

              <el-form label-position="top" class="script-form">
                <el-form-item label="Find Pattern (Regex)">
                  <el-input
                    v-model="script.findRegex"
                    placeholder="/pattern/flags or plain pattern"
                    @input="emitUpdate"
                  />
                  <span class="hint">Use /pattern/gi format or plain text. Example: /hello/gi</span>
                </el-form-item>

                <el-form-item label="Replace With">
                  <el-input
                    v-model="script.replaceString"
                    placeholder="Replacement text (can use $1, $2 for capture groups)"
                    @input="emitUpdate"
                  />
                </el-form-item>

                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="Placement">
                      <el-checkbox-group v-model="script.placement" @change="emitUpdate">
                        <el-checkbox :label="1">AI Output</el-checkbox>
                        <el-checkbox :label="2">User Input</el-checkbox>
                      </el-checkbox-group>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Options">
                      <el-checkbox v-model="script.markdownOnly" @change="emitUpdate">
                        Markdown Only (display-time only)
                      </el-checkbox>
                      <el-checkbox v-model="script.promptOnly" @change="emitUpdate">
                        Prompt Only (before sending to AI)
                      </el-checkbox>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-form-item label="Trim Strings (Optional)">
                  <div class="trim-strings">
                    <el-tag
                      v-for="(trim, ti) in script.trimStrings || []"
                      :key="ti"
                      closable
                      @close="removeTrimString(index, ti)"
                      style="margin-right: 8px; margin-bottom: 8px"
                    >
                      {{ trim }}
                    </el-tag>
                    <el-input
                      v-model="trimStringInput[index]"
                      placeholder="Add trim string or /regex/"
                      style="width: 200px"
                      size="small"
                      @keyup.enter="addTrimString(index)"
                    >
                      <template #append>
                        <el-button @click="addTrimString(index)">Add</el-button>
                      </template>
                    </el-input>
                  </div>
                  <span class="hint">Strings or /regex/ patterns to remove after replacement</span>
                </el-form-item>
              </el-form>
            </el-card>
          </div>
        </div>
      </el-tab-pane>

      <!-- Token Summary Tab -->
      <el-tab-pane label="Token Summary" name="summary">
        <div class="token-summary">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="Name">
              {{ estimateTokens(cardData.name || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="Description">
              {{ estimateTokens(cardData.description || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="Personality">
              {{ estimateTokens(cardData.personality || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="Scenario">
              {{ estimateTokens(cardData.scenario || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="First Message">
              {{ estimateTokens(cardData.first_mes || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="Example Dialogues">
              {{ estimateTokens(cardData.mes_example || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="System Prompt">
              {{ estimateTokens(cardData.system_prompt || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="Author's Note">
              {{ estimateTokens(cardData.character_author_note || '') }} tokens
            </el-descriptions-item>
            <el-descriptions-item label="Post-History Instructions">
              {{ estimateTokens(cardData.post_history_instructions || '') }} tokens
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <div class="total-tokens">
            <h3>Total Character Tokens</h3>
            <el-tag :type="getTotalTokensType()" size="large">
              {{ totalTokens }} tokens
            </el-tag>
            <p class="token-hint">
              This is the permanent token cost for this character (excluding chat history).
            </p>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import type { CharacterCardData } from '@client/types';

const props = defineProps<{
  modelValue: CharacterCardData;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: CharacterCardData): void;
}>();

const activeTab = ref('basic');
const cardData = ref<CharacterCardData>({ ...props.modelValue });
const alternateGreetings = ref<string[]>([...(props.modelValue.alternate_greetings || [])]);
const tags = ref<string[]>([...(props.modelValue.tags || [])]);
const promptTemplate = ref<string>('default');

// Initialize promptTemplate from cardData.extensions
function initPromptTemplate() {
  const extensions = cardData.value.extensions as Record<string, unknown> | undefined;
  if (extensions && typeof extensions.promptTemplate === 'string') {
    promptTemplate.value = extensions.promptTemplate;
  } else {
    promptTemplate.value = 'default';
  }
}

// Initialize on mount
initPromptTemplate();

// Regex Scripts
interface RegexScript {
  scriptName?: string;
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  placement: number[];
  enabled: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
}

const regexScripts = ref<RegexScript[]>([]);
const trimStringInput = ref<Record<number, string>>({});

// Initialize regex scripts from cardData
function initRegexScripts() {
  const extensions = cardData.value.extensions as Record<string, unknown> | undefined;
  if (extensions && Array.isArray(extensions.regex_scripts)) {
    regexScripts.value = (extensions.regex_scripts as any[]).map(s => ({
      scriptName: s.scriptName || '',
      findRegex: s.findRegex || '',
      replaceString: s.replaceString || '',
      trimStrings: s.trimStrings || [],
      placement: Array.isArray(s.placement) ? s.placement : [1],
      enabled: !s.disabled,
      markdownOnly: s.markdownOnly || false,
      promptOnly: s.promptOnly || false,
    }));
  }
}

// Initialize on mount
initRegexScripts();

const commonTags = [
  'fantasy', 'sci-fi', 'modern', 'historical',
  'anime', 'realistic', 'comedy', 'drama',
  'action', 'romance', 'mystery', 'horror',
];

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  cardData.value = { ...newValue };
  alternateGreetings.value = [...(newValue.alternate_greetings || [])];
  tags.value = [...(newValue.tags || [])];
  initRegexScripts();
  initPromptTemplate();
}, { deep: true });

function estimateTokens(text: string): number {
  if (!text) return 0;
  const hasAsian = /[\u4e00-\u9fa5]/.test(text);
  const ratio = hasAsian ? 1.5 : 4;
  return Math.ceil(text.length / ratio);
}

const totalTokens = computed(() => {
  return (
    estimateTokens(cardData.value.name || '') +
    estimateTokens(cardData.value.description || '') +
    estimateTokens(cardData.value.personality || '') +
    estimateTokens(cardData.value.scenario || '') +
    estimateTokens(cardData.value.first_mes || '') +
    estimateTokens(cardData.value.mes_example || '') +
    estimateTokens(cardData.value.system_prompt || '') +
    estimateTokens(cardData.value.character_author_note || '') +
    estimateTokens(cardData.value.post_history_instructions || '')
  );
});

function getTotalTokensType() {
  if (totalTokens.value > 2000) return 'danger';
  if (totalTokens.value > 1000) return 'warning';
  return 'success';
}

function emitUpdate() {
  // Update regex scripts in extensions
  if (!cardData.value.extensions) {
    cardData.value.extensions = {};
  }
  (cardData.value.extensions as Record<string, unknown>).regex_scripts = regexScripts.value.map(s => ({
    scriptName: s.scriptName,
    findRegex: s.findRegex,
    replaceString: s.replaceString,
    trimStrings: s.trimStrings,
    placement: s.placement,
    disabled: !s.enabled,
    markdownOnly: s.markdownOnly,
    promptOnly: s.promptOnly,
  }));

  emit('update:modelValue', { ...cardData.value });
}

function addGreeting() {
  alternateGreetings.value.push('');
}

function removeGreeting(index: number) {
  alternateGreetings.value.splice(index, 1);
  updateAlternateGreetings();
}

function updateAlternateGreetings() {
  cardData.value.alternate_greetings = alternateGreetings.value.filter(g => g.trim());
  emitUpdate();
}

function updateTags() {
  cardData.value.tags = tags.value;
  emitUpdate();
}

function updatePromptTemplate() {
  if (!cardData.value.extensions) {
    cardData.value.extensions = {};
  }
  (cardData.value.extensions as Record<string, unknown>).promptTemplate = promptTemplate.value;
  emitUpdate();
}

// Regex Scripts methods
function addRegexScript() {
  regexScripts.value.push({
    scriptName: `Script ${regexScripts.value.length + 1}`,
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    placement: [1], // AI Output by default
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
  });
  emitUpdate();
}

function removeRegexScript(index: number) {
  regexScripts.value.splice(index, 1);
  emitUpdate();
}

function addTrimString(scriptIndex: number) {
  const input = trimStringInput.value[scriptIndex];
  if (!input || !input.trim()) return;

  const script = regexScripts.value[scriptIndex];
  if (!script.trimStrings) {
    script.trimStrings = [];
  }
  script.trimStrings.push(input.trim());
  trimStringInput.value[scriptIndex] = '';
  emitUpdate();
}

function removeTrimString(scriptIndex: number, trimIndex: number) {
  const script = regexScripts.value[scriptIndex];
  if (script.trimStrings) {
    script.trimStrings.splice(trimIndex, 1);
    emitUpdate();
  }
}
</script>

<style scoped lang="scss">
.character-card-editor {
  .editor-tabs {
    :deep(.el-tabs__content) {
      padding: 20px 0;
    }
  }

  .token-count {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-color-primary);
    font-weight: 500;
  }

  .format-hint {
    margin-bottom: 16px;

    code {
      padding: 2px 6px;
      background: var(--el-fill-color-dark);
      border-radius: 3px;
      font-family: 'Consolas', 'Monaco', monospace;
    }
  }

  .alternate-greetings {
    .greeting-item {
      margin-bottom: 16px;
      padding: 12px;
      border: 1px solid var(--el-border-color-light);
      border-radius: 8px;

      .greeting-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
      }
    }

    .add-greeting-btn {
      width: 100%;
    }
  }

  .token-summary {
    .total-tokens {
      text-align: center;
      padding: 24px;

      h3 {
        margin: 0 0 16px 0;
        font-size: 18px;
        font-weight: 600;
      }

      .el-tag {
        font-size: 24px;
        padding: 12px 24px;
      }

      .token-hint {
        margin-top: 12px;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  .regex-scripts-editor {
    .scripts-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
    }

    .scripts-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .script-card {
      .script-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .script-form {
        .hint {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }

        .trim-strings {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
      }
    }
  }
}
</style>
