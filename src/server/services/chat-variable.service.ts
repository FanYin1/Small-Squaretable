/**
 * Chat Variable Store
 *
 * SillyTavern 兼容的变量存储服务
 * per-chat 变量持久保存在数据库；global 变量沿用 Redis。
 *
 * 用于 tavern_helper 宏子集:
 *   {{getvar::name}}, {{setvar::name::value}}, {{addvar::name::value}}
 *   {{getglobalvar::name}}, {{setglobalvar::name::value}}, {{addglobalvar::name::value}}
 */

import { cacheService } from './cache.service';
import { getLegacyVariables, mutateLegacyVariables } from './legacy-variables.service';
const GLOBAL_VAR_PREFIX = 'globalvar';
const VAR_TTL = 60 * 60 * 24 * 30; // 30 days

function globalVarKey(userId: string): string {
  return `${GLOBAL_VAR_PREFIX}:${userId}`;
}

export class ChatVariableStore {
  /**
   * Load all chat-scoped variables for a chat session.
   */
  async getChatVars(chatId: string): Promise<Record<string, string>> {
    return getLegacyVariables(chatId);
  }

  /**
   * Set a single chat-scoped variable.
   */
  async setChatVar(chatId: string, name: string, value: string): Promise<void> {
    await mutateLegacyVariables(chatId, vars => {
      Object.defineProperty(vars, name, { value, enumerable: true, configurable: true, writable: true });
    });
  }

  /**
   * Add (numeric increment) a chat-scoped variable.
   */
  async addChatVar(chatId: string, name: string, value: string): Promise<string> {
    let result = '0';
    await mutateLegacyVariables(chatId, vars => {
      const current = parseFloat(Object.hasOwn(vars, name) ? vars[name] : '0');
      result = String(current + (parseFloat(value) || 0));
      Object.defineProperty(vars, name, { value: result, enumerable: true, configurable: true, writable: true });
    });
    return result;
  }

  /**
   * Delete a single chat-scoped variable.
   */
  async deleteChatVar(chatId: string, name: string): Promise<void> {
    await mutateLegacyVariables(chatId, vars => { delete vars[name]; });
  }

  /**
   * Load all global variables for a user.
   */
  async getGlobalVars(userId: string): Promise<Record<string, string>> {
    const data = await cacheService.get<Record<string, string>>(globalVarKey(userId));
    return data ?? {};
  }

  /**
   * Set a single global variable.
   */
  async setGlobalVar(userId: string, name: string, value: string): Promise<void> {
    const vars = await this.getGlobalVars(userId);
    vars[name] = value;
    await cacheService.set(globalVarKey(userId), vars, VAR_TTL);
  }

  /**
   * Add (numeric increment) a global variable.
   */
  async addGlobalVar(userId: string, name: string, value: string): Promise<string> {
    const vars = await this.getGlobalVars(userId);
    const current = parseFloat(vars[name] || '0');
    const add = parseFloat(value) || 0;
    const result = String(current + add);
    vars[name] = result;
    await cacheService.set(globalVarKey(userId), vars, VAR_TTL);
    return result;
  }

  /**
   * Load both chat and global variables into a flat lookup map.
   * Chat variables take precedence over global variables with the same name.
   */
  async loadAll(chatId: string, userId: string): Promise<{
    chatVars: Record<string, string>;
    globalVars: Record<string, string>;
  }> {
    const [chatVars, globalVars] = await Promise.all([
      this.getChatVars(chatId),
      this.getGlobalVars(userId),
    ]);
    return { chatVars, globalVars };
  }
}

export const chatVariableStore = new ChatVariableStore();
