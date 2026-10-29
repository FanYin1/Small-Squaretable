/**
 * Prompt 布局开关（P3-3）
 *
 * PROMPT_LAYOUT=legacy        （默认）记忆 / 情绪 / 触发的世界书拼在 system prompt 里，位于历史之前
 * PROMPT_LAYOUT=cache_friendly 稳定内容在前，每轮变化的内容作为靠近末尾的注入块，让历史能命中前缀缓存
 *
 * 每次调用时读取环境变量（不缓存），测试与灰度切换都不需要重载模块。
 * 未设置或取值非法一律回落到 legacy：错拼一个字母不应该悄悄改变所有角色的行为。
 */

export type PromptLayout = 'legacy' | 'cache_friendly';

export function getPromptLayout(): PromptLayout {
  return process.env.PROMPT_LAYOUT === 'cache_friendly' ? 'cache_friendly' : 'legacy';
}

/**
 * cache_friendly 下，变动内容块的注入深度（depth N = 距离消息末尾 N 条）。
 *
 * 选 1（紧贴最后一条消息之前）而不是 0（最后一条之后）：
 * - 最后一条仍是用户的真实输入，部分 provider/兼容层对「以 system 结尾」的消息序列处理不一致
 * - 比 Author's Note（depth 0）离生成点远一步，降低模型对刚检索到的事实「太在意」的倾向
 * - 代价：相邻两轮的公共前缀少一条用户消息，可忽略
 */
export const DYNAMIC_BLOCK_DEPTH = 1;
