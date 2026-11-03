<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { validateModelLimits, type ModelLimitsInput } from '../../../types/model-limits';
import { llmPresets } from '../../../types/llm-presets';
import { useI18n } from 'vue-i18n';
import { Cpu, Refresh, Lock } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
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
const search = ref('');
const visibility = ref('all');
const entryOpen = ref(false);
const entryMode = ref<'create' | 'view' | 'edit'>('create');
const entry = reactive({ id: '', channelId: '', upstreamId: '', hidden: false, makeDefault: false,
  contextWindow: undefined as number | undefined, maxInputTokens: undefined as number | undefined,
  maxOutputTokens: undefined as number | undefined, requestOutputTokens: undefined as number | undefined });
const filteredModels = computed(() => (config.value?.models ?? []).filter(model =>
  [model.id, model.channelName, model.upstreamId].some(value => value?.toLowerCase().includes(search.value.trim().toLowerCase()))
  && (visibility.value === 'all' || (visibility.value === 'hidden') === Boolean(model.hidden))));

function openEntry(model?: AdminModelMeta, readOnly = false) {
  entryMode.value = model ? readOnly ? 'view' : 'edit' : 'create';
  Object.assign(entry, { id: model?.id ?? '', channelId: model?.channelId ?? selectedChannel.value ?? '',
    upstreamId: model?.upstreamId ?? '', hidden: model?.hidden ?? false, makeDefault: false,
    contextWindow: model?.contextWindow, maxInputTokens: model?.maxInputTokens,
    maxOutputTokens: model ? model.outputCapabilityTokens ?? model.maxOutputTokens : undefined,
    requestOutputTokens: model?.maxOutputTokens });
  if (!entry.channelId) entry.channelId = config.value?.providers[0]?.id ?? '';
  entryOpen.value = true;
}

async function saveEntry() {
  if (saving.value || entryMode.value === 'view') return;
  const id = entry.id.trim();
  let limits: ModelLimitsInput;
  try {
    if (!id || !entry.channelId) throw new Error('请选择渠道并填写模型名称');
    limits = validateModelLimits({ [id]: { contextWindow: entry.contextWindow,
      ...(entry.maxInputTokens == null ? {} : { maxInputTokens: entry.maxInputTokens }),
      maxOutputTokens: entry.maxOutputTokens, requestOutputTokens: entry.requestOutputTokens } }, [id])[id];
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '请检查容量参数'); return; }
  saving.value = true;
  try {
    const data = { upstreamId: entry.upstreamId.trim(), limits, hidden: entry.hidden, makeDefault: entry.makeDefault };
    if (entryMode.value === 'create') await adminApi.createModel({ ...data, id, channelId: entry.channelId });
    else await adminApi.editModel(id, data);
    entryOpen.value = false;
    ElMessage.success('模型已保存，聊天模型列表在下次打开时更新');
    await fetchModels();
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '模型保存失败'); }
  finally { saving.value = false; }
}

async function toggleModel(model: AdminModelMeta) {
  if (saving.value) return;
  saving.value = true;
  try {
    await adminApi.editModel(model.id, { hidden: !model.hidden });
    ElMessage.success(model.hidden ? '模型已恢复显示' : '模型已隐藏，已有会话仍可使用');
    await fetchModels();
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '修改失败'); }
  finally { saving.value = false; }
}

async function removeModel(model: AdminModelMeta) {
  if (saving.value) return;
  try {
    await ElMessageBox.confirm(`删除模型“${model.id}”后，使用它的会话需要重新选择模型。历史消息不会删除；如果只想从选择列表中移除，请使用隐藏。`,
      '删除模型', { type: 'warning', confirmButtonText: '删除模型', cancelButtonText: '取消' });
  } catch { return; }
  saving.value = true;
  try {
    await adminApi.deleteModel(model.id);
    ElMessage.success('模型已删除，历史会话保留');
    await fetchModels();
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '删除失败'); }
  finally { saving.value = false; }
}

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

    <el-card v-if="config" v-loading="loading" shadow="never" class="models-card">
      <template #header>
        <div class="card-heading">
          <span>{{ t('admin.models.configuredModels') }}</span>
          <el-tag type="success" size="small">当前生效配置</el-tag>
        </div>
      </template>
      <div class="model-toolbar">
        <el-input v-model="search" clearable placeholder="搜索模型、上游名称或渠道" aria-label="搜索模型" />
        <el-select v-model="visibility" aria-label="模型显示状态">
          <el-option label="全部模型" value="all" /><el-option label="公开可选" value="visible" /><el-option label="已隐藏" value="hidden" />
        </el-select>
        <el-button type="primary" :disabled="saving || loading || !config.providers.length" @click="openEntry()">新增模型</el-button>
      </div>
      <p class="form-help">隐藏模型不再出现在用户选择列表，但已有会话仍可使用。删除会移除调用配置，历史消息保留。平台至少保留一个公开可选模型。</p>
      <el-table :data="filteredModels" stripe empty-text="没有匹配的模型">
        <el-table-column prop="id" :label="t('admin.models.model')" min-width="220" />
        <el-table-column prop="channelName" label="渠道" min-width="140" />
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
            <el-tag v-if="row.hidden" type="info" size="small">已隐藏</el-tag>
            <el-tag v-else-if="row.id === config?.defaultModel" type="primary" size="small">
              {{ t('admin.models.default') }}
            </el-tag>
            <el-tag v-else type="success" size="small">{{ t('admin.models.available') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="250">
          <template #default="{ row }">
            <el-button link :disabled="saving || loading" @click="openEntry(row, true)">查看</el-button>
            <el-button link type="primary" :disabled="saving || loading" @click="openEntry(row)">编辑</el-button>
            <el-button link :disabled="saving || loading" @click="toggleModel(row)">{{ row.hidden ? '显示' : '隐藏' }}</el-button>
            <el-button link type="danger" :disabled="saving || loading" @click="removeModel(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>


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
          <p class="form-help">按供应商对准确型号的说明填写整数；1M = 1,000,000。上下文为输入与输出合计上限，最大输入可选；实际可用输入还需预留本次输出和 100 token 缓冲。每次输出额度是所有生成入口的应用上限，可小于模型最大输出。单次请求可申请更少；计费按生效额度预扣，不再另设输出硬上限。</p>
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


    <el-dialog v-model="entryOpen" :title="entryMode === 'create' ? '新增模型' : entryMode === 'view' ? '模型详情' : '编辑模型'" width="min(640px, 94vw)" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
      <el-form class="model-entry-form" label-position="top" :disabled="saving || entryMode === 'view'" @submit.prevent="saveEntry">
        <el-form-item label="所属渠道"><el-select v-model="entry.channelId" :disabled="entryMode !== 'create'" style="width:100%">
          <el-option v-for="channel in config?.providers ?? []" :key="channel.id" :label="channel.name" :value="channel.id" />
        </el-select></el-form-item>
        <el-form-item label="用户看到的模型名称"><el-input v-model="entry.id" :disabled="entryMode !== 'create'" maxlength="200" /></el-form-item>
        <p class="form-help">模型名称作为会话引用标识，创建后保持不变。新增到现有渠道会沿用该渠道的端点、密钥和协议。</p>
        <el-form-item label="供应商模型名称 / 部署 ID"><el-input v-model="entry.upstreamId" placeholder="留空则使用上面的模型名称" maxlength="200" /></el-form-item>
        <div class="form-grid">
          <el-form-item label="上下文总上限"><el-input-number v-model="entry.contextWindow" :min="1" :max="Number.MAX_SAFE_INTEGER" :precision="0" /></el-form-item>
          <el-form-item label="最大输入（可选）"><el-input-number v-model="entry.maxInputTokens" :min="1" :max="Number.MAX_SAFE_INTEGER" :precision="0" /></el-form-item>
          <el-form-item label="模型最大输出"><el-input-number v-model="entry.maxOutputTokens" :min="1" :max="Number.MAX_SAFE_INTEGER" :precision="0" /></el-form-item>
          <el-form-item label="每次输出额度"><el-input-number v-model="entry.requestOutputTokens" :min="1" :max="Number.MAX_SAFE_INTEGER" :precision="0" /></el-form-item>
        </div>
        <p class="form-help">容量单位为 token，请按供应商文档填写；每次输出额度不能超过模型最大输出，上下文需容纳输入与输出。</p>
        <el-checkbox v-model="entry.hidden" @change="entry.hidden && (entry.makeDefault = false)">在用户模型列表中隐藏</el-checkbox>
        <el-checkbox v-model="entry.makeDefault" :disabled="entry.hidden">设为平台默认模型（也影响记忆整理）</el-checkbox>
        <div class="form-actions"><el-button v-if="entryMode !== 'view'" type="primary" native-type="submit" :loading="saving">保存模型</el-button></div>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="entryOpen = false">{{ entryMode === 'view' ? '关闭' : '取消' }}</el-button></template>
    </el-dialog>

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
.model-toolbar { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.model-toolbar .el-input { flex: 1; min-width: 180px; }
.model-toolbar .el-select { width: 150px; }
.model-entry-form :deep(.el-input-number) { width: 100%; }
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
