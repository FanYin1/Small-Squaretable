/**
 * Prompt Templates Configuration
 *
 * Defines various prompt format templates for different LLM models
 * (Alpaca, ChatML, Vicuna, etc.)
 */

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrefix: string;
  systemSuffix: string;
  userPrefix: string;
  userSuffix: string;
  assistantPrefix: string;
  assistantSuffix: string;
  /** Whether to wrap the entire conversation */
  wrapConversation?: boolean;
  conversationPrefix?: string;
  conversationSuffix?: string;
}

/**
 * Default template (OpenAI ChatML-like format)
 */
const defaultTemplate: PromptTemplate = {
  id: 'default',
  name: 'Default',
  description: 'Standard OpenAI-style chat format',
  systemPrefix: '',
  systemSuffix: '\n\n',
  userPrefix: '',
  userSuffix: '\n\n',
  assistantPrefix: '',
  assistantSuffix: '\n\n',
};

/**
 * Alpaca template
 * Format: ### Instruction:\n{text}\n\n### Response:\n
 */
const alpacaTemplate: PromptTemplate = {
  id: 'alpaca',
  name: 'Alpaca',
  description: 'Alpaca instruction format',
  systemPrefix: '### Instruction:\n',
  systemSuffix: '\n\n',
  userPrefix: '### Instruction:\n',
  userSuffix: '\n\n',
  assistantPrefix: '### Response:\n',
  assistantSuffix: '\n\n',
};

/**
 * ChatML template
 * Format: <|im_start|>role\n{text}<|im_end|>\n
 */
const chatmlTemplate: PromptTemplate = {
  id: 'chatml',
  name: 'ChatML',
  description: 'ChatML format (OpenAI fine-tuned models)',
  systemPrefix: '<|im_start|>system\n',
  systemSuffix: '<|im_end|>\n',
  userPrefix: '<|im_start|>user\n',
  userSuffix: '<|im_end|>\n',
  assistantPrefix: '<|im_start|>assistant\n',
  assistantSuffix: '<|im_end|>\n',
};

/**
 * Vicuna template
 * Format: SYSTEM: {text}\nUSER: {text}\nASSISTANT: {text}
 */
const vicunaTemplate: PromptTemplate = {
  id: 'vicuna',
  name: 'Vicuna',
  description: 'Vicuna conversation format',
  systemPrefix: 'SYSTEM: ',
  systemSuffix: '\n',
  userPrefix: 'USER: ',
  userSuffix: '\n',
  assistantPrefix: 'ASSISTANT: ',
  assistantSuffix: '\n',
};

/**
 * Llama 2 Chat template
 * Format: <s>[INST] <<SYS>>\n{system}\n<</SYS>>\n\n{user} [/INST] {assistant} </s>
 */
const llama2Template: PromptTemplate = {
  id: 'llama2',
  name: 'Llama 2 Chat',
  description: 'Llama 2 chat format with special tokens',
  systemPrefix: '[INST] <<SYS>>\n',
  systemSuffix: '\n<</SYS>>\n\n',
  userPrefix: '',
  userSuffix: ' [/INST] ',
  assistantPrefix: '',
  assistantSuffix: ' </s><s>[INST] ',
  wrapConversation: true,
  conversationPrefix: '<s>',
  conversationSuffix: '',
};

/**
 * All available templates
 */
export const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  default: defaultTemplate,
  alpaca: alpacaTemplate,
  chatml: chatmlTemplate,
  vicuna: vicunaTemplate,
  llama2: llama2Template,
};

/**
 * Get template by ID
 */
export function getPromptTemplate(templateId: string): PromptTemplate {
  return PROMPT_TEMPLATES[templateId] || PROMPT_TEMPLATES.default;
}

/**
 * Format messages using a specific template
 */
export function formatMessagesWithTemplate(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  templateId: string
): string {
  const template = getPromptTemplate(templateId);
  let result = '';

  if (template.wrapConversation && template.conversationPrefix) {
    result += template.conversationPrefix;
  }

  for (const message of messages) {
    const { role, content } = message;

    switch (role) {
      case 'system':
        result += template.systemPrefix + content + template.systemSuffix;
        break;
      case 'user':
        result += template.userPrefix + content + template.userSuffix;
        break;
      case 'assistant':
        result += template.assistantPrefix + content + template.assistantSuffix;
        break;
    }
  }

  if (template.wrapConversation && template.conversationSuffix) {
    result += template.conversationSuffix;
  }

  return result;
}
