/**
 * Webhook 类型定义
 *
 * 事件类型、端点配置、投递记录的类型和验证 Schema
 */

import { z } from 'zod';

/**
 * Webhook 事件类型
 */
export const WebhookEvent = {
  // 角色事件
  CHARACTER_CREATED: 'character.created',
  CHARACTER_UPDATED: 'character.updated',
  CHARACTER_PUBLISHED: 'character.published',
  CHARACTER_DELETED: 'character.deleted',

  // 聊天事件
  CHAT_CREATED: 'chat.created',
  CHAT_MESSAGE_SENT: 'chat.message.sent',
  CHAT_MESSAGE_RECEIVED: 'chat.message.received',

  // 社交事件
  USER_FOLLOWED: 'user.followed',
  CHARACTER_FAVORITED: 'character.favorited',
  CHARACTER_COMMENTED: 'character.commented',

  // 订阅事件
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_UPDATED: 'subscription.updated',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',

  // 插件事件
  PLUGIN_INSTALLED: 'plugin.installed',
  PLUGIN_UNINSTALLED: 'plugin.uninstalled',
} as const;

export type WebhookEventType = typeof WebhookEvent[keyof typeof WebhookEvent];

export const webhookEventValues = Object.values(WebhookEvent);

/**
 * 创建 Webhook 端点
 */
export const createWebhookSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(z.enum(webhookEventValues as [string, ...string[]])).min(1).max(50),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * 更新 Webhook 端点
 */
export const updateWebhookSchema = z.object({
  url: z.string().url().max(2000).optional(),
  events: z.array(z.enum(webhookEventValues as [string, ...string[]])).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

/**
 * Webhook 投递状态
 */
export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

/**
 * Webhook 投递 payload 格式
 */
export interface WebhookPayload {
  id: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}
