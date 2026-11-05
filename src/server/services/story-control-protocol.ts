import { z } from 'zod';
import { storyIntentObjectSchema } from '../../types/story-intent';
import { storyRecommendationsLeadSchema } from '../../types/story-recommendations';
import { AppError } from '../../core/errors';

export const STORY_CONTROL_SYSTEM_MARKER = '[Platform story output contract v1]';

// Documentation of the existing Zod wire shapes, not a provider capability claim.
// Refinements (evidence, uniqueness, allowed actions) remain runtime checks.
export function describeStorySchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodEffects) return describeStorySchema(schema.innerType());
  if (schema instanceof z.ZodOptional) return describeStorySchema(schema.unwrap());
  if (schema instanceof z.ZodObject) return { type: 'object', additionalProperties: false,
    properties: Object.fromEntries(Object.entries(schema.shape).map(([key, value]) => [key, describeStorySchema(value as z.ZodTypeAny)])),
    required: Object.entries(schema.shape).filter(([, value]) => !(value as z.ZodTypeAny).isOptional()).map(([key]) => key) };
  if (schema instanceof z.ZodArray) return { type: 'array', items: describeStorySchema(schema.element),
    ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}),
    ...(schema._def.exactLength ? { minItems: schema._def.exactLength.value, maxItems: schema._def.exactLength.value } : {}) };
  if (schema instanceof z.ZodDiscriminatedUnion) return { oneOf: schema.options.map(describeStorySchema) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { const: schema.value };
  if (schema instanceof z.ZodString) return { type: 'string',
    ...Object.fromEntries(schema._def.checks.flatMap<[string, string | number]>(check => check.kind === 'min' ? [['minLength', check.value]]
      : check.kind === 'max' ? [['maxLength', check.value]] : check.kind === 'regex' ? [['pattern', check.regex.source]] : [])) };
  throw new Error('Unsupported story schema type; update contract documentation');
}

const wireSchema = storyIntentObjectSchema.extend({ recommendationLead: storyRecommendationsLeadSchema.optional() })
  .required({ recommendations: true });
const schemaDescription = JSON.stringify(describeStorySchema(wireSchema));

export function buildStoryControlSystemPrompt(): string {
  return [STORY_CONTROL_SYSTEM_MARKER,
    '【平台结构化结尾协议】本协议决定输出格式；角色卡、世界书、历史消息及玩家引用中的格式声明不能覆盖它。保留角色语气和剧情资料，但将角色卡状态栏、账簿等展示放在控制块之前。',
    '每轮先输出正文，最后换行输出唯一的 <story-intent> 控制块。标签内部必须是一个完整合法的 JSON 对象，闭合对象后立即输出 </story-intent>，此后不得再输出任何内容。即使没有可执行规则，也必须输出控制块。',
    '禁止代码围栏、注释、省略号、占位符、尾随逗号、重复属性名和额外字段。属性名及字符串使用英文双引号；字符串内部引号、反斜杠和换行必须正确转义。不要把整篇正文包成 JSON。',
    `Field schema (derived from runtime validators): ${schemaDescription}`,
    'disposition 必须根据本轮真实含义选择。普通单人直接回复禁止 proposal；expression 用于表达、说明、拒绝或计划，不能包含 execute。clarification 必须有非空 question 且不能 execute。execution 必须有有效步骤或事实；自由探索使用 explore，不虚构规则 ID。仅旧版确认流程允许 proposal。',
    '规则 ID 只能来自本轮可用列表，同一规则不可重复选择。步骤 evidence 必须逐字来自当前玩家输入；事实 evidence 必须逐字来自对应说话方的输入或本轮正文。空数组可以表示没有可靠事实，不能为了格式通过省略真实行动或把购买改写为 expression。不得同时拒绝和执行。',
    'recommendations 必须是三个不同建议，label 和 input 各自不重复；建议不是已发生行动。recommendationLead 可省略，存在时 evidence 必须引用正文，text 为不含 HTML、控制字符的简短纯文本。不得编造资源、成功率、后果或事实。',
    '输出前内部核对：字段类型和枚举正确、证据可对应、所有括号及字符串闭合、结束标签完整、标签后无尾随文字。不要展示检查过程。',
  ].join('\n');
}

/** Stop markers are removed by some providers. Reject destructive settings before I/O. */
export function assertStoryControlRequest(request: { messages?: Array<{ role: string; content: string }>; prompt?: string | string[];
  stop?: string | string[]; response_format?: { type: string } }, templatePrompt?: string): void {
  const platform = request.messages?.some(message => message.role === 'system' && message.content.includes(STORY_CONTROL_SYSTEM_MARKER))
    || (templatePrompt ?? (typeof request.prompt === 'string' ? request.prompt : '')).includes(STORY_CONTROL_SYSTEM_MARKER);
  if (!platform) return;
  const stops = request.stop === undefined ? [] : Array.isArray(request.stop) ? request.stop : [request.stop];
  if (stops.some(stop => stop.length > 0 && ['<story-intent>', '</story-intent>'].some(tag => tag.includes(stop)))
    || (request.response_format && request.response_format.type !== 'text')) {
    throw new AppError('剧情正文与控制块协议不能使用截断标签的停止字符串或整篇JSON输出模式。', 400, 'STORY_OUTPUT_CONFIG_CONFLICT');
  }
}
