/**
 * NSFW 偏好卡片（P2-6）
 *
 * - 平台开关关闭：整张卡片不渲染
 * - 未确认年龄：开关禁用 + 提示 + 「确认已满 18 岁」按钮（弹窗确认后补录）
 * - 服务端 403（AGE_CONFIRMATION_REQUIRED / NSFW_DISABLED）翻成可读提示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import NsfwPreferenceCard from './NsfwPreferenceCard.vue';
import i18n from '../../i18n';

const { mockUserApi, toast, messageBox } = vi.hoisted(() => ({
  mockUserApi: { getPreferences: vi.fn(), updatePreferences: vi.fn(), confirmAge: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  messageBox: { confirm: vi.fn() },
}));

vi.mock('@client/services/user.api', () => ({ userApi: mockUserApi }));
vi.mock('@client/composables/useToast', () => ({ useToast: () => toast }));
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus');
  return { ...actual, ElMessageBox: messageBox };
});

const elStubs = {
  'el-card': { template: '<div class="el-card"><slot name="header" /><slot /></div>', props: ['shadow'] },
  'el-icon': { template: '<i><slot /></i>' },
  'el-button': { template: '<button type="button" class="el-button"><slot /></button>' },
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

  describe('补确认年龄', () => {
    const buttonText = () => i18n.global.t('accountSettings.ageConfirmButton') as string;

    it('已确认年龄：不显示确认按钮', async () => {
      mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
      const wrapper = mountCard();
      await flushPromises();

      expect(wrapper.find('.nsfw-age-button').exists()).toBe(false);
    });

    it('未确认年龄：显示带文字的确认按钮', async () => {
      mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: false });
      const wrapper = mountCard();
      await flushPromises();

      const button = wrapper.find('.nsfw-age-button');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe(buttonText());
    });

    it('弹窗点确定：调用接口、用返回值更新状态、开关变为可用、toast 成功', async () => {
      mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: false });
      mockUserApi.confirmAge.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: true });
      messageBox.confirm.mockResolvedValue('confirm');
      const wrapper = mountCard();
      await flushPromises();
      expect(wrapper.find('.switch').attributes('disabled')).toBeDefined();

      await wrapper.find('.nsfw-age-button').trigger('click');
      await flushPromises();

      expect(messageBox.confirm).toHaveBeenCalledWith(
        i18n.global.t('accountSettings.ageConfirmMessage'),
        i18n.global.t('accountSettings.ageConfirmTitle'),
        expect.objectContaining({
          confirmButtonText: i18n.global.t('accountSettings.ageConfirmOk'),
        }),
      );
      expect(mockUserApi.confirmAge).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith(i18n.global.t('accountSettings.ageConfirmDone'));
      expect(wrapper.find('.switch').attributes('disabled')).toBeUndefined();
      expect(wrapper.find('.nsfw-age-button').exists()).toBe(false);
    });

    it('弹窗取消：不调用接口，不提示，按钮仍在', async () => {
      mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: false });
      messageBox.confirm.mockRejectedValue('cancel');
      const wrapper = mountCard();
      await flushPromises();

      await wrapper.find('.nsfw-age-button').trigger('click');
      await flushPromises();

      expect(mockUserApi.confirmAge).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(wrapper.find('.nsfw-age-button').exists()).toBe(true);
      expect(wrapper.find('.switch').attributes('disabled')).toBeDefined();
    });

    it('接口失败：toast 错误，状态不变', async () => {
      mockUserApi.getPreferences.mockResolvedValue({ nsfwEnabled: true, showNsfw: false, ageConfirmed: false });
      mockUserApi.confirmAge.mockRejectedValue(new Error('boom'));
      messageBox.confirm.mockResolvedValue('confirm');
      const wrapper = mountCard();
      await flushPromises();

      await wrapper.find('.nsfw-age-button').trigger('click');
      await flushPromises();

      expect(toast.error).toHaveBeenCalledWith(i18n.global.t('accountSettings.ageConfirmFailed'));
      expect(toast.success).not.toHaveBeenCalled();
      expect(wrapper.find('.switch').attributes('disabled')).toBeDefined();
    });
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
