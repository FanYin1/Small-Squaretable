<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { validateModelLimits, type ModelLimitsInput } from '../../../types/model-limits';
import { llmPresets } from '../../../types/llm-presets';
import { useI18n } from 'vue-i18n';
import { Cpu, Refresh, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { adminApi, type AdminModelMeta, type AdminModelsResponse, type AdminModelUpdateInput } from '@client/services/admin.api';

const { t } = useI18n();
const loading = ref(false);
const config = ref<AdminModelsResponse | null>(null);
const saving = ref(false);
const selectedChannel = ref('');
const preset = ref('custom');
const aliasesText = ref('{}');
const requestSettings = reactive({ tokenParameter: 'max_tokens' as 'max_tokens' | 'max_completion_tokens', temperature: true, penalties: true, streamUsage: true, jsonMode: true });
const form = reactive<AdminModelUpdateInput & { modelsText: string; limitsText: string }>({
  id: '', name: '', makeDefault: false,
  provider: 'custom',
  apiFormat: 'openai',
  apiKey: '',
  baseUrl: '',
  models: [],
  defaultModel: '',
  modelLimits: {},
  modelsText: '',
  limitsText: '{}',
});

const providerCount = computed(() => config.value?.providers.length ?? 0);
const modelCount = computed(() => config.value?.models.length ?? 0);

const capacityRows = computed(() => {
  let limits: Record<string, Partial<ModelLimitsInput>> = {};
  try { limits = JSON.parse(form.limitsText || '{}'); } catch { /* Raw JSON error is reported on save. */ }
  return [...new Set(form.modelsText.split(',').map(id => id.trim()).filter(Boolean))].map(id => ({
    id, limits: limits?.[id] ?? {},
  }));
});
function setCapacity(model: string, field: keyof ModelLimitsInput, event: Event) {
  try {
    const limits = JSON.parse(form.limitsText || '{}');
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw new Error();
    const raw = (event.target as HTMLInputElement).value;
    limits[model] = { ...limits[model] };
    if (!raw) delete limits[model][field];
    else limits[model][field] = Number(raw);
    form.limitsText = JSON.stringify(limits, null, 2);
  } catch { ElMessage.error(t('admin.models.invalidLimits')); }
}

function providerLabel(provider: string): string {
  return provider === 'custom' ? t('admin.models.customProvider') : provider;
}

function modelProvider(model: AdminModelMeta): string {
  return providerLabel(model.provider);
}

function populateForm(next: AdminModelsResponse) {
  const provider = next.providers.find((item) => item.id === selectedChannel.value) ?? next.providers[0];
  if (!provider) return;
  selectedChannel.value = provider.id;
  form.id = provider.id; form.name = provider.name; form.makeDefault = false;
  form.provider = provider.provider;
  form.apiFormat = provider.apiFormat as AdminModelUpdateInput['apiFormat'];
  aliasesText.value = JSON.stringify(provider.modelAliases ?? {}, null, 2);
  Object.assign(requestSettings, { tokenParameter: 'max_tokens', temperature: true, penalties: true, streamUsage: true, jsonMode: true }, provider.requestOptions);
  form.baseUrl = provider.baseUrl ?? '';
  form.models = provider.models.map((model) => model.id);
  form.modelsText = form.models.join(', ');
  form.defaultModel = provider.defaultModel ?? '';
  form.apiKey = '';
  form.limitsText = JSON.stringify(Object.fromEntries(provider.models.map((model) => [model.id, {
    contextWindow: model.contextWindow,
    ...(model.maxInputTokens === undefined ? {} : { maxInputTokens: model.maxInputTokens }),
    maxOutputTokens: model.outputCapabilityTokens ?? model.maxOutputTokens,
    requestOutputTokens: model.maxOutputTokens,
  }])), null, 2);
}

function newChannel() {
  selectedChannel.value = '';
  Object.assign(form, { id: '', name: '', provider: 'custom', apiFormat: 'openai', apiKey: '', baseUrl: '', models: [], modelsText: '', defaultModel: '', makeDefault: false, limitsText: '{}' });
  aliasesText.value = '{}'; preset.value = 'custom';
  Object.assign(requestSettings, { tokenParameter: 'max_tokens', temperature: true, penalties: true, streamUsage: true, jsonMode: true });
}
function applyPreset() {
  const next = llmPresets.find(item => item.id === preset.value);
  if (!next) return;
  Object.assign(form, { provider: next.provider, apiFormat: next.apiFormat, baseUrl: next.baseUrl });
  if (!selectedChannel.value) { form.name = next.name; }
}

async function fetchModels() {
  loading.value = true;
  try {
    config.value = await adminApi.getModels();
    populateForm(config.value);
  } catch {
    config.value = null;
    ElMessage.error(t('admin.models.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function saveModels() {
  const models = form.modelsText.split(',').map((model) => model.trim()).filter(Boolean);
  if (!models.length || !form.baseUrl.trim()) {
    ElMessage.error(t('admin.models.invalidForm'));
    return;
  }
  let modelLimits: AdminModelUpdateInput['modelLimits'];
  try {
    const parsed: unknown = JSON.parse(form.limitsText || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    modelLimits = validateModelLimits(parsed, models);
    const aliases = JSON.parse(aliasesText.value || '{}');
    if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases) || Object.values(aliases).some(value => typeof value !== 'string')) throw new Error('Invalid aliases');
    form.modelAliases = aliases;
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message.startsWith('CUSTOM_LLM_MODEL_LIMITS:') ? error.message : t('admin.models.invalidLimits'));
    return;
  }
  saving.value = true;
  try {
    form.id ||= `channel-${Date.now().toString(36)}`;
    await adminApi.updateModels({
      id: form.id,
      name: form.name?.trim() || undefined,
      makeDefault: form.makeDefault,
      modelAliases: form.modelAliases,
      requestOptions: { ...requestSettings },
      provider: form.provider,
      apiFormat: form.apiFormat,
      apiKey: form.apiKey?.trim() || undefined,
      baseUrl: form.baseUrl.trim(),
      models,
      defaultModel: form.defaultModel?.trim() || models[0],
      modelLimits,
    });
    selectedChannel.value = form.id;
    ElMessage.success(t('admin.models.saved'));
    await fetchModels();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('admin.models.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(fetchModels);
</script>

<template>
  <div class="model-management">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('admin.models.title') }}</h2>
        <p class="page-subtitle">{{ t('admin.models.subtitle') }}</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="fetchModels">
        {{ t('common.refresh') }}
      </el-button>
    </div>

    <el-alert
      class="source-alert"
      type="info"
      :closable="false"
      title="多渠道模型配置"
      description="分别配置供应商端点、密钥和模型。保存后即时生效；模型名称和容量请以供应商文档为准。"
    />

    <el-card class="edit-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <span>{{ t('admin.models.editTitle') }}</span>
          <el-tag type="warning" size="small">{{ t('admin.models.runtimeSave') }}</el-tag>
        </div>
      </template>
      <div class="channel-toolbar">
        <el-select v-model="selectedChannel" placeholder="选择已配置渠道" :disabled="saving" @change="config && populateForm(config)">
          <el-option v-for="channel in config?.providers ?? []" :key="channel.id" :label="channel.name || channel.id" :value="channel.id" />
        </el-select>
        <el-button :disabled="saving" @click="newChannel">新增渠道</el-button>
      </div>
      <el-form label-position="top" @submit.prevent="saveModels">
        <div class="form-grid">
          <el-form-item label="渠道名称"><el-input v-model="form.name" placeholder="例如：DeepSeek 主渠道" /></el-form-item>
          <el-form-item label="端点模板">
            <el-select v-model="preset" @change="applyPreset"><el-option v-for="item in llmPresets" :key="item.id" :label="item.name" :value="item.id" /></el-select>
          </el-form-item>
          <el-form-item :label="t('admin.models.apiFormat')">
            <el-select v-model="form.apiFormat" style="width: 100%">
              <el-option label="OpenAI compatible" value="openai" />
              <el-option label="Gemini native" value="gemini" />
              <el-option label="Anthropic Messages" value="anthropic" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('admin.models.endpoint')">
            <el-input v-model="form.baseUrl" placeholder="https://provider.example/v1" />
          </el-form-item>
          <el-form-item :label="t('admin.models.modelsInput')">
            <el-input v-model="form.modelsText" :placeholder="t('admin.models.modelsPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('admin.models.defaultInput')">
            <el-input v-model="form.defaultModel" />
          </el-form-item>
        </div>
        <el-form-item :label="t('admin.models.apiKey')">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="config?.providers.find((item) => item.id === selectedChannel)?.hasApiKey ? t('admin.models.keyKeep') : t('admin.models.keyRequired')"
          />
        </el-form-item>
        <section class="capacity-editor" aria-label="逐模型容量参数">
          <h3>模型容量（token）</h3>
          <p class="form-help">按供应商对准确型号的说明填写整数；1M = 1,000,000。上下文为输入与输出合计上限，最大输入可选；实际可用输入还需预留本次输出和 100 token 缓冲。每次输出额度是应用设置，可小于模型最大输出。</p>
          <p class="form-help">以下是管理员配置值，系统不会通过模型名称推测真实容量。未填写独立输入上限表示未提供该参数。</p>
          <div v-for="row in capacityRows" :key="row.id" class="capacity-model" :data-model="row.id">
            <strong>{{ row.id }}</strong>
            <div class="capacity-fields">
              <label>上下文总上限<input type="number" min="1" step="1" :max="Number.MAX_SAFE_INTEGER" :value="row.limits.contextWindow" :disabled="saving" @change="setCapacity(row.id, 'contextWindow', $event)" /></label>
              <label>最大输入（可选）<input type="number" min="1" step="1" :max="row.limits.contextWindow || Number.MAX_SAFE_INTEGER" :value="row.limits.maxInputTokens" :disabled="saving" placeholder="未提供独立上限" @change="setCapacity(row.id, 'maxInputTokens', $event)" /></label>
              <label>模型最大输出<input type="number" min="1" step="1" :max="row.limits.contextWindow ? row.limits.contextWindow - 1 : Number.MAX_SAFE_INTEGER" :value="row.limits.maxOutputTokens" :disabled="saving" @change="setCapacity(row.id, 'maxOutputTokens', $event)" /></label>
              <label>每次输出额度<input type="number" min="1" step="1" :max="row.limits.maxOutputTokens || Number.MAX_SAFE_INTEGER" :value="row.limits.requestOutputTokens" :disabled="saving" @change="setCapacity(row.id, 'requestOutputTokens', $event)" /></label>
            </div>
          </div>
          <el-collapse><el-collapse-item :title="t('admin.models.limitsJson')" name="limits">
            <el-input v-model="form.limitsText" type="textarea" :rows="7" spellcheck="false" :disabled="saving" />
            <div class="form-help">支持 contextWindow、maxInputTokens（可选）、maxOutputTokens、requestOutputTokens。修改 JSON 与上方数字同步；移除模型时请同时移除其 JSON 条目。</div>
          </el-collapse-item></el-collapse>
        </section>
        <el-form-item label="模型别名映射（可选 JSON）">
          <el-input v-model="aliasesText" type="textarea" :rows="3" placeholder='{"我的模型别名":"供应商模型或部署ID"}' />
          <div class="form-help">模型列表填写全站唯一的名称；需要区分同名模型时，在这里映射到实际模型 ID。豆包可填写方舟部署 ID。</div>
        </el-form-item>
        <el-collapse><el-collapse-item title="请求兼容选项" name="options">
          <el-form-item label="OpenAI 兼容协议的输出上限字段">
            <el-select v-model="requestSettings.tokenParameter"><el-option label="max_tokens" value="max_tokens" /><el-option label="max_completion_tokens" value="max_completion_tokens" /></el-select>
          </el-form-item>
          <el-checkbox v-model="requestSettings.temperature">发送温度 / top_p</el-checkbox>
          <el-checkbox v-model="requestSettings.penalties">发送重复惩罚参数</el-checkbox>
          <el-checkbox v-model="requestSettings.streamUsage">请求流末尾用量</el-checkbox>
          <el-checkbox v-model="requestSettings.jsonMode">允许 JSON 模式</el-checkbox>
          <p class="form-help">输出字段和流末尾用量适用于 OpenAI 兼容协议。采样与 JSON 开关也适用于原生协议；原生 Claude 的 JSON 模式采用提示约束。推理模型若不支持采样或惩罚参数，请关闭对应项。</p>
        </el-collapse-item></el-collapse>
        <el-checkbox v-model="form.makeDefault">设为平台默认渠道（记忆整理也使用该渠道的默认模型）</el-checkbox>
        <div class="form-actions">
          <el-button type="primary" :loading="saving" native-type="submit">{{ t('admin.models.save') }}</el-button>
          <span class="form-help">{{ t('admin.models.saveHelp') }}</span>
        </div>
      </el-form>
    </el-card>

    <div v-if="config" class="summary-grid">
      <el-card shadow="hover" class="summary-card">
        <el-icon :size="24"><Cpu /></el-icon>
        <div><strong>{{ providerCount }}</strong><span>{{ t('admin.models.providerCount') }}</span></div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <el-icon :size="24"><Cpu /></el-icon>
        <div><strong>{{ modelCount }}</strong><span>{{ t('admin.models.modelCount') }}</span></div>
      </el-card>
      <el-card shadow="hover" class="summary-card">
        <el-icon :size="24"><Lock /></el-icon>
        <div><strong>{{ config.defaultModel || '-' }}</strong><span>{{ t('admin.models.defaultModel') }}</span></div>
      </el-card>
    </div>

    <el-card v-if="config" v-loading="loading" shadow="never" class="models-card">
      <template #header>
        <div class="card-heading">
          <span>{{ t('admin.models.configuredModels') }}</span>
          <el-tag type="success" size="small">当前生效配置</el-tag>
        </div>
      </template>
      <el-table :data="config.models" stripe>
        <el-table-column prop="id" :label="t('admin.models.model')" min-width="220" />
        <el-table-column :label="t('admin.models.provider')" width="140">
          <template #default="{ row }">{{ modelProvider(row) }}</template>
        </el-table-column>
        <el-table-column :label="t('admin.models.context')" width="150">
          <template #default="{ row }">{{ row.contextWindow.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="最大输入" width="150">
          <template #default="{ row }">{{ row.maxInputTokens === undefined ? '未提供' : row.maxInputTokens.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="每次输出额度" width="150">
          <template #default="{ row }">{{ row.maxOutputTokens.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column :label="t('admin.models.maxOutput')" width="150">
          <template #default="{ row }">{{ (row.outputCapabilityTokens ?? row.maxOutputTokens).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column :label="t('admin.models.status')" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.id === config?.defaultModel" type="primary" size="small">
              {{ t('admin.models.default') }}
            </el-tag>
            <el-tag v-else type="success" size="small">{{ t('admin.models.available') }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div v-if="config" class="provider-list">
      <el-card v-for="provider in config.providers" :key="provider.id" shadow="hover">
        <template #header>
          <div class="card-heading">
            <span>{{ provider.name || providerLabel(provider.id) }}</span>
            <el-tag size="small">{{ provider.apiFormat }}</el-tag>
          </div>
        </template>
        <dl class="provider-details">
          <div><dt>{{ t('admin.models.endpoint') }}</dt><dd>{{ provider.baseUrl || '-' }}</dd></div>
          <div><dt>{{ t('admin.models.providerDefault') }}</dt><dd>{{ provider.defaultModel || '-' }}</dd></div>
          <div><dt>{{ t('admin.models.modelCount') }}</dt><dd>{{ provider.modelCount }}</dd></div>
        </dl>
      </el-card>
    </div>

    <el-empty v-if="!loading && config && config.models.length === 0" :description="t('admin.models.empty')" />
  </div>
</template>

<style scoped lang="scss">
.model-management { max-width: 1280px; margin: 0 auto; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.page-title { margin: 0; color: var(--text-primary); }
.page-subtitle { margin: 6px 0 0; color: var(--text-secondary); }
.source-alert { margin-bottom: 20px; }
.channel-toolbar { display: flex; gap: 12px; margin-bottom: 20px; }
.edit-card { margin-bottom: 20px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.capacity-editor { margin-bottom: 24px; }
.capacity-editor h3 { margin: 0 0 8px; font-size: 16px; }
.capacity-model { border: 1px solid var(--el-border-color); border-radius: 8px; padding: 14px; margin: 12px 0; }
.capacity-model strong { display: block; margin-bottom: 12px; overflow-wrap: anywhere; }
.capacity-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.capacity-fields label { display: grid; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.capacity-fields input { box-sizing: border-box; width: 100%; min-width: 0; padding: 9px; color: var(--text-primary); background: var(--el-fill-color-blank); border: 1px solid var(--el-border-color); border-radius: 4px; font: inherit; }
.capacity-fields input:focus { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.form-help { margin-top: 6px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.form-actions { display: flex; align-items: center; gap: 12px; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
.summary-card :deep(.el-card__body) { display: flex; align-items: center; gap: 14px; }
.summary-card .el-icon { color: var(--el-color-primary); }
.summary-card div { display: grid; gap: 4px; min-width: 0; }
.summary-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.summary-card span { color: var(--text-secondary); font-size: 13px; }
.models-card { margin-bottom: 20px; }
.card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 600; }
.provider-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.provider-details { display: grid; gap: 12px; margin: 0; }
.provider-details div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; }
.provider-details dt { color: var(--text-secondary); }
.provider-details dd { margin: 0; overflow-wrap: anywhere; color: var(--text-primary); }
@media (max-width: 700px) {
  .page-header { align-items: stretch; flex-direction: column; }
  .summary-grid { grid-template-columns: 1fr; }
  .form-grid, .capacity-fields { grid-template-columns: 1fr; }
  .channel-toolbar { flex-wrap: wrap; }
  .models-card { overflow-x: auto; }
}
</style>
