import { AppError } from '../../core/errors';

const explanations = {
  context: '上游报告输入或总上下文超出限制，请核对模型容量并缩减上下文。',
  output: '上游拒绝输出长度参数，请核对 max_tokens 与该模型的输出限制。',
  sampling: '上游拒绝采样参数，请核对 temperature / top_p 的支持范围。',
  model: '上游报告模型不可用或不支持，请核对模型名称、映射和渠道权限。',
  messages: '上游拒绝消息格式，请检查角色顺序、内容或 assistant 预填充限制。',
  authentication: '上游拒绝身份认证，请管理员核对该渠道密钥。',
  permission: '上游拒绝访问，请管理员核对渠道权限。',
  rate_limit: '上游请求限流，请稍后再试。',
  unavailable: '上游服务暂时不可用，请稍后再试。',
  unknown: '上游拒绝请求，未取得可识别的具体原因，请管理员检查渠道配置。',
} as const;
type Category = keyof typeof explanations;
type BodyState = 'read' | 'empty' | 'too_large' | 'timeout' | 'unreadable';

export class AnthropicApiError extends AppError {
  constructor(status: number, public readonly category: Category = 'unknown', public readonly bodyState: BodyState = 'empty') {
    super(`Anthropic HTTP ${status}：${explanations[category]}`, status, 'LLM_API_ERROR');
    this.name = 'AnthropicApiError';
  }
  get retryable() { return this.statusCode === 408 || this.statusCode === 429 || this.statusCode >= 500; }
}

// Never retain or reflect raw upstream error text: gateways may echo keys or user messages.
function classify(status: number, body: string): Category {
  if (status === 401) return 'authentication';
  if (status === 403) return 'permission';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'unavailable';
  let value: unknown;
  try { value = JSON.parse(body); } catch { return 'unknown'; }
  const parsed = value as { error?: { message?: unknown; type?: unknown; param?: unknown } } | null;
  const error = parsed?.error;
  if (!error || typeof error !== 'object') return 'unknown';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const param = typeof error.param === 'string' ? error.param.toLowerCase() : '';
  if (/prompt is too long|input is too long|context (?:length|window)|maximum context|too many (?:input )?tokens/.test(message)) return 'context';
  if (param === 'max_tokens' || /\bmax_tokens\b/.test(message)) return 'output';
  if (['temperature', 'top_p'].includes(param) || /\b(?:temperature|top_p)\b/.test(message)) return 'sampling';
  if (param === 'model' || /(?:model.*(?:not found|not exist|not supported|unavailable|invalid)|(?:unknown|invalid|unsupported) model)/.test(message)) return 'model';
  if (/^messages(?:\[|\.|$)/.test(param) || /(?:messages(?:\[|\.|:)|roles? must|assistant.*prefill|prefill.*assistant|last message.*(?:assistant|user)|first message.*user)/.test(message)) return 'messages';
  return 'unknown';
}

export async function assertAnthropicResponse(response: Response): Promise<void> {
  if (response.ok) return;
  let body = '', bodyState: BodyState = 'empty';
  const reader = response.body?.getReader();
  if (reader) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const deadline = new Promise<null>(resolve => {
      timer = setTimeout(() => { expired = true; resolve(null); }, 1500);
    });
    try {
      const decoder = new TextDecoder();
      let bytes = 0;
      while (true) {
        const chunk = await Promise.race([reader.read(), deadline]);
        if (expired || chunk === null) { bodyState = 'timeout'; break; }
        if (chunk.done) { body += decoder.decode(); bodyState = body ? 'read' : 'empty'; break; }
        bytes += chunk.value.byteLength;
        if (bytes > 16 * 1024) { bodyState = 'too_large'; break; }
        body += decoder.decode(chunk.value, { stream: true });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      bodyState = 'unreadable';
    } finally {
      clearTimeout(timer);
      // A broken upstream's cancel promise must not hold this request open.
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  throw new AnthropicApiError(response.status, classify(response.status, bodyState === 'read' ? body : ''), bodyState);
}
