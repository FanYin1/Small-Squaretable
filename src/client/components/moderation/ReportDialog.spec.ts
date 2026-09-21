import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportDialog from './ReportDialog.vue';
import { reportApi } from '@client/services/report.api';
import { VIOLATION_CATEGORIES } from '@/types/moderation';

vi.mock('@client/services/report.api', () => ({
  reportApi: { submitReport: vi.fn() },
}));

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } });

// el-* 组件全部 stub 成透传的原生元素，让断言落在组件自己的逻辑上
const stubs = {
  ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>' },
  ElRadioGroup: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    // 把绑定值透出到 DOM，好断言 v-model 真的接上了
    template: '<div class="radio-group" :data-selected="modelValue"><slot /></div>',
  },
  ElRadio: {
    props: ['value', 'label'],
    template: '<label class="radio" :data-value="value ?? label"><slot /></label>',
  },
  ElInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  ElButton: {
    props: ['disabled', 'loading'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
  },
};

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ReportDialog, {
    props: {
      modelValue: true,
      targetType: 'character' as const,
      targetId: '11111111-1111-4111-8111-111111111111',
      ...props,
    },
    global: { plugins: [i18n], stubs },
  });
}

describe('ReportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportApi.submitReport).mockResolvedValue({ id: 'report-1' } as never);
  });

  // 预选一个分类等于替用户做判断，提交上来的统计口径就不可信了。
  // 重开时的清空由另一条用例覆盖，这条管的是首次挂载。
  it('preselects no category', () => {
    const wrapper = mountDialog();

    expect(wrapper.vm.category).toBe('');
    expect(wrapper.find('.radio-group').attributes('data-selected')).toBe('');
  });

  it('renders one option per violation category', () => {
    const wrapper = mountDialog();
    const radios = wrapper.findAll('.radio');

    expect(radios).toHaveLength(VIOLATION_CATEGORIES.length);
    const values = radios.map((r) => r.attributes('data-value'));
    for (const category of VIOLATION_CATEGORIES) {
      expect(values).toContain(category);
    }
  });

  it('submits the selected category and reason', async () => {
    const wrapper = mountDialog();

    wrapper.vm.category = 'violence';
    wrapper.vm.reason = '过度暴力描写';
    await wrapper.vm.$nextTick();

    // 单选组必须真的绑到 category，否则界面选了什么都提交不出去
    expect(wrapper.find('.radio-group').attributes('data-selected')).toBe('violence');

    await wrapper.vm.submit();

    expect(reportApi.submitReport).toHaveBeenCalledWith({
      targetType: 'character',
      targetId: '11111111-1111-4111-8111-111111111111',
      category: 'violence',
      reason: '过度暴力描写',
    });
  });

  // 空白理由提交出去只会拿到服务端 400，本地先拦住
  it('does not submit without a reason', async () => {
    const wrapper = mountDialog();
    wrapper.vm.category = 'harassment';
    wrapper.vm.reason = '   ';
    await wrapper.vm.submit();

    expect(reportApi.submitReport).not.toHaveBeenCalled();
  });

  it('does not submit without a category', async () => {
    const wrapper = mountDialog();
    wrapper.vm.category = '';
    wrapper.vm.reason = '有问题';
    await wrapper.vm.submit();

    expect(reportApi.submitReport).not.toHaveBeenCalled();
  });

  it('closes and emits submitted on success', async () => {
    const wrapper = mountDialog();
    wrapper.vm.category = 'other';
    wrapper.vm.reason = '刷屏';
    await wrapper.vm.submit();

    expect(wrapper.emitted('submitted')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false]);
  });

  // 失败时必须留住用户填的内容，否则要重新写一遍理由
  it('keeps the dialog open and preserves input when submission fails', async () => {
    vi.mocked(reportApi.submitReport).mockRejectedValue(new Error('rate limited'));
    const wrapper = mountDialog();
    wrapper.vm.category = 'pornography';
    wrapper.vm.reason = '色情内容';
    await wrapper.vm.submit();

    expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    expect(wrapper.vm.reason).toBe('色情内容');
    expect(wrapper.vm.submitting).toBe(false);
  });

  it('passes the target type through for comments', async () => {
    const wrapper = mountDialog({
      targetType: 'comment',
      targetId: '22222222-2222-4222-8222-222222222222',
    });
    wrapper.vm.category = 'harassment';
    wrapper.vm.reason = '人身攻击';
    await wrapper.vm.submit();

    expect(reportApi.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'comment',
        targetId: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });

  it('resets the form when reopened', async () => {
    const wrapper = mountDialog({ modelValue: false });
    wrapper.vm.category = 'violence';
    wrapper.vm.reason = '旧内容';

    await wrapper.setProps({ modelValue: true });

    expect(wrapper.vm.category).toBe('');
    expect(wrapper.vm.reason).toBe('');
  });
});
