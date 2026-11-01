import type { ChatCompletionRequest, LLMProviderConfig } from '../../types/llm';

/** Only explicit channel settings alter parameters; model-name guesses are avoided. */
export function prepareChatRequest(provider: LLMProviderConfig, request: ChatCompletionRequest, stream = false) {
  const body: Record<string, unknown> = { ...request, model: provider.modelAliases?.[request.model] || request.model, stream };
  const options = provider.requestOptions;
  if (options?.temperature === false) { delete body.temperature; delete body.top_p; }
  if (options?.penalties === false) { delete body.presence_penalty; delete body.frequency_penalty; }
  if (options?.jsonMode === false) delete body.response_format;
  if (options?.tokenParameter === 'max_completion_tokens' && body.max_tokens !== undefined) {
    body.max_completion_tokens = body.max_tokens; delete body.max_tokens;
  }
  if (stream && options?.streamUsage !== false && process.env.LLM_STREAM_INCLUDE_USAGE !== 'false') {
    body.stream_options = { ...((request as ChatCompletionRequest & { stream_options?: Record<string, unknown> }).stream_options ?? {}), include_usage: true };
  } else { delete body.stream_options; }
  return body;
}

/** Native adapters keep max_tokens internally and translate it to their own wire field. */
export function prepareNativeChatRequest(provider: LLMProviderConfig, request: ChatCompletionRequest): ChatCompletionRequest {
  const body = prepareChatRequest(provider, request) as unknown as ChatCompletionRequest;
  body.max_tokens = request.max_tokens;
  delete (body as unknown as Record<string, unknown>).max_completion_tokens;
  return body;
}
