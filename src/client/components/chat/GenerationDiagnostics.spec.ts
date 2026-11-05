import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GenerationDiagnostics from './GenerationDiagnostics.vue';
import { api } from '../../services/api';
import type { GenerationTraceList } from '../../../types/generation-trace';
vi.mock('../../services/api', () => ({ api: { get: vi.fn() } }));
const result: GenerationTraceList = { retentionHours:168, limit:30, traces:[{
  version:1,id:'11111111-1111-4111-8111-111111111111',requestId:'fixture-request', capturedAt:'2026-11-06T00:00:00.000Z', finishedAt:'2026-11-06T00:00:05.000Z',
  model:'fixture-model',status:'failed',stage:'commit',errorCode:'STORY_INVALID_JSON',outcomePersisted:true,promptTraceIds:[],stackFrames:[],durationMs:5000,
  assistantMessageId:3,stateStatus:'interrupted',validation:{result:'failed',code:'invalid_json',warnings:[],jsonFailure:{kind:'syntax',offset:4,length:8}},events:[{stage:'commit',elapsedMs:4000}],
}] };
const create = () => mount(GenerationDiagnostics,{props:{chatId:'story',ownerId:'owner'}});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.get).mockResolvedValue(result);});
afterEach(()=>vi.restoreAllMocks());
it('shows stage, correlation, parse details and exports the selected metadata', async ()=>{
  const wrapper=create();await flushPromises();
  expect(wrapper.text()).toContain('fixture-request');expect(wrapper.text()).toContain('剧情校验与消息保存');
  expect(wrapper.text()).toContain('偏移 4 / 长度 8');expect(wrapper.text()).toContain('格式有误');
  const blob=vi.fn().mockReturnValue('blob:test');vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:blob,revokeObjectURL:vi.fn()}));
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  await wrapper.findAll('button').find(b=>b.text().includes('导出'))!.trigger('click');
  expect(blob).toHaveBeenCalledOnce();wrapper.unmount();vi.unstubAllGlobals();
});
it.each(['owner','chat','unmount'])('discards pending data on %s changes',async change=>{
  let resolve!:(value:GenerationTraceList)=>void;
  vi.mocked(api.get).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  const wrapper=create();vi.mocked(api.get).mockResolvedValue({...result,traces:[]});
  if(change==='unmount')wrapper.unmount();else await wrapper.setProps(change==='owner'?{ownerId:'other'}:{chatId:'other'});
  resolve(result);await flushPromises();
  expect(wrapper.text()).not.toContain('fixture-model');if(change!=='unmount')wrapper.unmount();
});
it('clears previous results on failure, does not show private errors and allows retry',async()=>{
  const wrapper=create();await flushPromises();vi.mocked(api.get).mockRejectedValueOnce(new Error('PRIVATE'));
  await wrapper.find('button').trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('fixture-model');expect(wrapper.text()).not.toContain('PRIVATE');
  await wrapper.find('button').trigger('click');await flushPromises();expect(wrapper.text()).toContain('fixture-model');wrapper.unmount();
});
