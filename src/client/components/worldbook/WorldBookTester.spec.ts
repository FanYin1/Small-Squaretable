import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import WorldBookTester from './WorldBookTester.vue';
import { worldbookApi } from '../../services/worldbook.api';

vi.mock('../../services/worldbook.api', () => ({ worldbookApi: { scanEntries: vi.fn() } }));
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }));

const mountTester = () => mount(WorldBookTester, { props: { worldBookId: 'book', modelValue: true }, global: {
  stubs: {
    ElDialog: { template: '<section><slot/><slot name="footer"/></section>' },
    ElInput: { props: ['modelValue'], emits: ['update:modelValue', 'input'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\')"/>' },
    ElButton: { template: '<button><slot/></button>' }, ElTag: { template: '<span><slot/></span>' },
    ElIcon: true, ElEmpty: true, ElCollapseTransition: { template: '<div><slot/></div>' },
  },
} });
const result = { matches: [], mode: 'single_book_preview' as const, note: '单本预览，不是历史请求记录', diagnostics: {
  budgetUsed: 0, budgetLimit: 10, scanMessageCount: 10, maxRecursionDepth: 3,
  decisions: [{ entryId: 'excluded-entry', status: 'excluded' as const, reason: 'token_budget_exceeded', unsupported: ['sticky'] }],
} };

beforeEach(() => vi.clearAllMocks());

async function scan(wrapper: ReturnType<typeof mountTester>) {
  await wrapper.get('textarea').setValue('gate');
  await wrapper.findAll('button').find(button => button.text().includes('Scan'))!.trigger('click');
}

describe('World book scan diagnostics', () => {
  it('shows actual exclusions and compatibility limits even with zero injected entries', async () => {
    vi.mocked(worldbookApi.scanEntries).mockResolvedValue(result);
    const wrapper = mountTester();
    await scan(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('超出世界书预算');
    expect(wrapper.text()).toContain('暂不支持：sticky');
    expect(wrapper.text()).toContain('单本预览，不是历史请求记录');
    wrapper.unmount();
  });

  it('discards an old response after the user changes the test input', async () => {
    let finish!: (value: typeof result) => void;
    vi.mocked(worldbookApi.scanEntries).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const wrapper = mountTester();
    await scan(wrapper);
    await wrapper.get('textarea').setValue('new input');
    finish(result);
    await flushPromises();
    expect(wrapper.text()).not.toContain('excluded-entry');
    wrapper.unmount();
  });
});
