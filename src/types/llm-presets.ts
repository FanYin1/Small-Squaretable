/** Endpoint templates only: model IDs and limits must be supplied from the account's provider docs. */
export const llmPresets = [
  { id: 'custom', name: '自定义 / 中转服务', provider: 'custom', apiFormat: 'openai', baseUrl: '' },
  { id: 'openai', name: 'OpenAI', provider: 'openai', apiFormat: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic / Claude', provider: 'anthropic', apiFormat: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'gemini', name: 'Google Gemini', provider: 'custom', apiFormat: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'deepseek', name: 'DeepSeek', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'qwen', name: '通义千问 / DashScope', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'moonshot', name: 'Moonshot / Kimi', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'glm', name: '智谱 GLM', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'doubao', name: '豆包 / 火山方舟', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'xai', name: 'xAI / Grok', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://api.x.ai/v1' },
  { id: 'openrouter', name: 'OpenRouter', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'siliconflow', name: '硅基流动', provider: 'custom', apiFormat: 'openai', baseUrl: 'https://api.siliconflow.cn/v1' },
  { id: 'ollama', name: 'Ollama / 本地模型', provider: 'ollama', apiFormat: 'openai', baseUrl: 'http://host.docker.internal:11434/v1' },
] as const;
