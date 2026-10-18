/**
 * NSFW 偏好卡片（P2-6）
 *
 * - 平台开关关闭：整张卡片不渲染
 * - 未确认年龄：开关禁用 + 提示
 * - 服务端 403（AGE_CONFIRMATION_REQUIRED / NSFW_DISABLED）翻成可读提示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import NsfwPreferenceCard from './NsfwPreferenceCard.vue';
import i18n from '../../i18n';

const { mockUserApi, toast } = vi.hoisted(() => ({
  mockUserApi: { getPreferences: vi.fn(), updatePreferences: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@client/services/user.api', () => ({ userApi: mockUserApi }));
vi.mock('@client/composables/useToast', () => ({ useToast: () => toast }));

const elStubs = {
  'el-card': { template: '<div class="el-card"><slot name="header" /><slot /></div>', props: ['shadow'] },
  'el-icon': { template: '<i><slot /></i>' },
  'el-switch': {
    template: '<input type="checkbox" class="switch" :checked="modelValue" :disabled="disabled" />',
    props: ['modelValue', 'disabled'],
    emits: ['change'],
  },
};

function mountCard() {
  return mount(NsfwPreferenceCard, { global: { plugins: [i18n], stubs: elStubs } });
}

async function toggle(wrapper: ReturnType<typeof mountCard>, value: boolean) {
  wrapper.findComponent(elStubs['el-switch']).vm.$emit('change', value);
  await flushPromises();
}

describe('NsfwPreferenceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('平台开关关闭时不渲染卡片', async () => {
    mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: false, showNsfw: false, ageConfirmed: true });
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('.el-card').exists()).toBe(false);
  });

  it('读取偏好失败时不渲染卡片（不影响设置页）', async () => {
    mockUserApi.getPreferences.mockRejectedValue(new Error('network'));
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('.el-card').exists()).toBe(false);
  });

  it('已确认年龄：显示开关，可打开', async () => {
    mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    mockUserApi.updatePreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: true, ageConfirmed: true });
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('.el-card').exists()).toBe(true);
    expect(wrapper.find('.switch').attributes('disabled')).toBeUndefined();

    await toggle(wrapper, true);

    expect(mockUserApi.updatePreferences).toHaveBeenCalledWith({ showNsfw: true });
    expect(toast.success).toHaveBeenCalled();
    expect((wrapper.find('.switch').element as HTMLInputElement).checked).toBe(true);
  });

  it('未确认年龄：开关禁用并显示提示', async () => {
    mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: false });
    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('.switch').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain(i18n.global.t('accountSettings.nsfwAgeRequired') as string);
  });

  it('服务端返回 AGE_CONFIRMATION_REQUIRED：提示需要确认年龄，开关保持关', async () => {
    const { ApiError } = await import('@client/services/api');
    mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    mockUserApi.updatePreferences.mockRejectedValue(new ApiError(403, 'AGE_CONFIRMATION_REQUIRED', 'x'));
    const wrapper = mountCard();
    await flushPromises();

    await toggle(wrapper, true);

    expect(toast.warning).toHaveBeenCalledWith(i18n.global.t('accountSettings.nsfwAgeRequired'));
    expect((wrapper.find('.switch').element as HTMLInputElement).checked).toBe(false);
  });

  it('服务端返回 NSFW_DISABLED：提示平台未开放', async () => {
    const { ApiError } = await import('@client/services/api');
    mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
    mockUserApi.updatePreferences.mockRejectedValue(new ApiError(403, 'NSFW_DISABLED', 'x'));
    const wrapper = mountCard();
    await flushPromises();

    await toggle(wrapper, true);

    expect(toast.warning).toHaveBeenCalledWith(i18n.global.t('accountSettings.nsfwPlatformOff'));
  });

  it('其他错误：通用失败提示', async () => {
    mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: true, ageConfirmed: true });
    mockUserApi.updatePreferences.mockRejectedValue(new Error('boom'));
    const wrapper = mountCard();
    await flushPromises();

    await toggle(wrapper, false);

    expect(toast.error).toHaveBeenCalledWith(i18n.global.t('accountSettings.nsfwSaveFailed'));
  });
});
