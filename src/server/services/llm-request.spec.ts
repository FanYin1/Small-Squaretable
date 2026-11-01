import { expect, it } from 'vitest';
import { prepareChatRequest, prepareNativeChatRequest } from './llm-request';
import type { LLMProviderConfig, ChatCompletionRequest } from '../../types/llm';
const provider: LLMProviderConfig = { provider: 'custom', apiKey: 'test', models: ['local'] };
const request: ChatCompletionRequest = { model: 'local', messages: [], temperature: 0.7, top_p: 0.9, max_tokens: 100,
  n: 1, stream: false, presence_penalty: 0, frequency_penalty: 0, response_format: { type: 'json_object' } };
it('maps public aliases and adapts strict reasoning model parameters without modifying the request', () => {
  expect(prepareChatRequest({ ...provider, modelAliases: { local: 'upstream' }, requestOptions: {
    tokenParameter: 'max_completion_tokens', temperature: false, penalties: false, streamUsage: false, jsonMode: false,
  } }, request, true)).toEqual({ model: 'upstream', messages: [], max_completion_tokens: 100, n: 1, stream: true });
  expect(request).toMatchObject({ model: 'local', max_tokens: 100, temperature: 0.7 });
});
it('keeps default compatibility and requests usage only for streams', () => {
  expect(prepareChatRequest(provider, request)).toEqual(request);
  expect(prepareChatRequest(provider, request, true)).toMatchObject({ stream_options: { include_usage: true } });
});
it('keeps native output limits while applying aliases and channel sampling controls', () => {
  const body = prepareNativeChatRequest({ ...provider, modelAliases: { local: 'native-id' }, requestOptions: {
    tokenParameter: 'max_completion_tokens', temperature: false, jsonMode: false,
  } }, request);
  expect(body).toMatchObject({ model: 'native-id', max_tokens: 100 });
  expect(body).not.toHaveProperty('max_completion_tokens');
  expect(body).not.toHaveProperty('temperature');
  expect(body).not.toHaveProperty('response_format');
});
