/**
 * 用户 API
 *
 * 处理用户信息相关的 API 请求
 */

import { api } from './api';
import type { User, UserProfile, Character } from '@client/types';

export interface UpdateUserRequest {
  name?: string;
  avatar?: string;
}

export interface NsfwPreferenceState {
  /** 平台开关；false 时不展示偏好卡片 */
  nsfwEnabled: boolean;
  /** 用户存下来的偏好 */
  showNsfw: boolean;
  /** 是否已确认年龄；false 时无法打开偏好 */
  ageConfirmed: boolean;
}

export const userApi = {
  /**
   * 获取用户信息
   */
  getUser: (id: string) =>
    api.get<{ user: User }>(`/users/${id}`),

  /**
   * 更新用户信息
   */
  updateUser: (id: string, data: UpdateUserRequest) =>
    api.patch<{ user: User }>(`/users/${id}`, data),

  /**
   * Get public user profile
   */
  getPublicProfile: (userId: string) =>
    api.get<UserProfile>(`/social/users/${userId}/profile`),

  /**
   * Get user's public characters
   */
  getUserCharacters: (userId: string) =>
    api.get<Character[]>(`/social/users/${userId}/characters`),

  /**
   * Update current user's profile
   */
  updateProfile: (data: { displayName?: string; bio?: string; avatarUrl?: string }) =>
    api.patch<Record<string, unknown>>('/users/me', data),

  /**
   * NSFW 偏好（含平台开关与年龄确认状态）。可见性由服务端判断，这里只读写偏好本身。
   */
  getPreferences: () => api.get<NsfwPreferenceState>('/users/me/preferences'),

  /**
   * 修改 NSFW 偏好。打开时服务端可能返回 403：
   * AGE_CONFIRMATION_REQUIRED（未确认年龄）或 NSFW_DISABLED（平台关闭）。
   */
  updatePreferences: (data: { showNsfw: boolean }) =>
    api.patch<NsfwPreferenceState>('/users/me/preferences', data),

  /**
   * 补确认年满 18 岁（存量用户注册时没有收集）。幂等，返回与 getPreferences 同形的最新状态。
   */
  confirmAge: () => api.post<NsfwPreferenceState>('/users/me/age-confirmation'),
};
