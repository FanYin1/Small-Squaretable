import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ContextViewer from './ContextViewer.vue';
import { promptTraceApi } from '../../services/prompt-trace.api';
import type { PromptTrace } from '../../../types/prompt-trace';
vi.mock('../../services/prompt-trace.api', () => ({ promptTraceApi: { list: vi.fn() } }));
const trace: PromptTrace = {
  version: 1, id: 'trace', requestId: 'request-fixture', userMessageId: 3, capturedAt: '2026-11-05T12:00:00.000Z',
  stage: 'upstream_request_prepared', model: 'fixture-model', template: 'default',
  transport: { outputTokens: 1000, adapter: 'openai_chat', bodyBytes: 200, bodySha256: 'a'.repeat(64) },
  snapshots: { content: 1, worldbook: 1, identityRevision: null }, assembly: null,
  budget: { contextWindow: 10000, maxInputTokens: null, outputTokens: 1000, bufferTokens: 100, availableInputTokens: 8900, estimatedInputTokens: 50, depthReservedTokens: 30 },
  history: { supplied: 2, retained: 1, omitted: 1, retainedIds: [3], omittedIds: [1], summarized: false, summaryTokens: 0 },
  messages: [{ index: 0, role: 'system', source: 'assembled_system', characters: 30, estimatedTokens: 10 }],
  messageCount: 1, omittedMessageDetails: 0, sourceProjectionApplied: false,
};
const result = { traces: [trace], retentionHours: 24, limit: 10 };
const mountViewer = (open = true) => mount(ContextViewer, { props: { modelValue: open, chatId: 'story-a', ownerId: 'owner' }, global: {
  stubs: { StoryWorkspaceDrawer: { props: ['open'], template: '<section v-if="open"><slot/></section>' } },
} });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(promptTraceApi.list).mockResolvedValue(result); });
describe('stored prompt diagnostics', () => {
  it('loads only on demand and explains actual-request and estimated-usage boundaries', async () => {
    const wrapper = mountViewer(false); expect(promptTraceApi.list).not.toHaveBeenCalled();
    await wrapper.setProps({ modelValue: true }); await flushPromises();
    expect(promptTraceApi.list).toHaveBeenCalledWith('story-a');
    expect(wrapper.text()).toContain('fixture-model'); expect(wrapper.text()).toContain('不代表模型成功回复或剧情已保存');
    expect(wrapper.text()).toContain('不是供应商账单'); expect(wrapper.text()).toContain('本次省略 1 条');
    expect(wrapper.text()).toContain('应用消息顺序'); wrapper.unmount();
  });
  it.each(['chat', 'owner', 'close'] as const)('discards stale responses after %s changes', async change => {
    let resolve!: (value: typeof result) => void;
    vi.mocked(promptTraceApi.list).mockReturnValueOnce(new Promise(finish => { resolve = finish; }));
    const wrapper = mountViewer();
    vi.mocked(promptTraceApi.list).mockResolvedValue({ ...result, traces: [] });
    await wrapper.setProps(change === 'chat' ? { chatId: 'story-b' } : change === 'owner' ? { ownerId: 'another-owner' } : { modelValue: false });
    resolve(result); await flushPromises();
    expect(wrapper.text()).not.toContain('fixture-model'); wrapper.unmount();
  });
  it('clears prior diagnostics on read failure and allows retry', async () => {
    const wrapper = mountViewer(); await flushPromises();
    vi.mocked(promptTraceApi.list).mockRejectedValueOnce(new Error('private implementation detail'));
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('诊断暂时无法读取'); expect(wrapper.text()).not.toContain('fixture-model');
    expect(wrapper.text()).not.toContain('private implementation detail');
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('fixture-model'); wrapper.unmount();
  });
  it('explains missing historical records instead of fabricating a preview', async () => {
    vi.mocked(promptTraceApi.list).mockResolvedValue({ ...result, traces: [] });
    const wrapper = mountViewer(); await flushPromises();
    expect(wrapper.text()).toContain('旧轮次、前置失败及过期记录不能回溯'); wrapper.unmount();
  });
});
