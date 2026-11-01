import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import ModelManagement from './ModelManagement.vue';
import i18n from '../../i18n';
const mocks = vi.hoisted(() => ({ getModels: vi.fn(), updateModels: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@client/services/admin.api', () => ({ adminApi: mocks }));
vi.mock('element-plus', () => ({ ElMessage: { error: mocks.error, success: mocks.success } }));
const meta = { id: 'first-model', provider: 'custom', contextWindow: 10000, maxOutputTokens: 2048, defaultTemperature: 0.7 };
const providers = [{ id: 'custom', name: 'Existing', provider: 'custom', apiFormat: 'gemini', baseUrl: 'https://existing.invalid', hasApiKey: true,
  models: [meta], defaultModel: meta.id, modelCount: 1, modelAliases: {}, requestOptions: {} },
  { id: 'deepseek', name: 'Another', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://second.invalid', hasApiKey: true,
    models: [{ ...meta, id: 'second-model' }], defaultModel: 'second-model', modelCount: 1, modelAliases: { 'second-model': 'upstream' }, requestOptions: { streamUsage: false } }];
const getConfig = () => structuredClone({ source: 'runtime', restartRequired: false, providers, models: [meta], defaultModel: meta.id });
beforeEach(() => { vi.clearAllMocks(); mocks.getModels.mockResolvedValue(getConfig()); mocks.updateModels.mockResolvedValue({ models: [] }); });
async function setup() {
  const wrapper = shallowMount(ModelManagement, { global: { plugins: [i18n], renderStubDefaultSlot: false, stubs: { 'el-table-column': { template: '<div />' } } } });
  await flushPromises(); return { wrapper, vm: wrapper.vm as any };
}
describe('Model management channels', () => {
  it('edits the selected channel and keeps its secret write-only', async () => {
    const { wrapper, vm } = await setup();
    vm.selectedChannel = 'deepseek'; vm.populateForm(getConfig());
    expect(vm.form.apiKey).toBe(''); expect(vm.form.id).toBe('deepseek');
    expect(vm.requestSettings.streamUsage).toBe(false);
    await vm.saveModels();
    expect(mocks.updateModels).toHaveBeenCalledWith(expect.objectContaining({ id: 'deepseek', apiKey: undefined, models: ['second-model'], modelAliases: { 'second-model': 'upstream' } }));
    expect(vm.selectedChannel).toBe('deepseek'); wrapper.unmount();
  });
  it('creates an independent provider from a preset without carrying over keys or aliases', async () => {
    const { wrapper, vm } = await setup();
    vm.form.apiKey = 'unsaved'; vm.newChannel(); vm.preset = 'anthropic'; vm.applyPreset();
    expect(vm.form.apiKey).toBe(''); expect(vm.aliasesText).toBe('{}'); expect(vm.form.id).toBe('');
    expect(vm.form.apiFormat).toBe('anthropic');
    vm.form.apiKey = 'new-key'; vm.form.modelsText = 'claude-test'; await vm.saveModels();
    expect(mocks.updateModels).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^channel-/), apiFormat: 'anthropic', provider: 'anthropic', apiKey: 'new-key' }));
    wrapper.unmount();
  });
  it('blocks malformed limits and surfaces configuration save errors', async () => {
    const { wrapper, vm } = await setup();
    vm.form.limitsText = '[]'; await vm.saveModels(); expect(mocks.updateModels).not.toHaveBeenCalled();
    vm.form.limitsText = '{}'; mocks.updateModels.mockRejectedValue(new Error('Model names must be unique'));
    await vm.saveModels(); expect(mocks.error).toHaveBeenCalledWith('Model names must be unique'); wrapper.unmount();
  });
  it('saves numeric field edits with separate input/output capacities and exact token values', async () => {
    const { wrapper, vm } = await setup();
    vm.setCapacity('first-model', 'maxInputTokens', { target: { value: '8000' } });
    vm.setCapacity('first-model', 'maxOutputTokens', { target: { value: '4000' } });
    vm.setCapacity('first-model', 'requestOutputTokens', { target: { value: '1000' } });
    expect(vm.capacityRows[0].limits.maxInputTokens).toBe(8000);
    await vm.saveModels();
    expect(mocks.updateModels).toHaveBeenCalledWith(expect.objectContaining({ modelLimits: {
      'first-model': { contextWindow: 10000, maxInputTokens: 8000, maxOutputTokens: 4000, requestOutputTokens: 1000 },
    } }));
    wrapper.unmount();
  });
  it('rejects an output request above capability before calling the API and retains edits', async () => {
    const { wrapper, vm } = await setup();
    vm.setCapacity('first-model', 'requestOutputTokens', { target: { value: '3000' } });
    await vm.saveModels();
    expect(mocks.updateModels).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('requestOutputTokens'));
    expect(vm.capacityRows[0].limits.requestOutputTokens).toBe(3000);
    wrapper.unmount();
  });

});
