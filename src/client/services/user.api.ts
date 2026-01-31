/**
 * 用户 API
 *
 * 处理用户信息相关的 API 请求
 */

import { api } from './api';
import type { User } from '@client/types';

export interface UpdateUserRequest {
  name?: string;
  avatar?: string;
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
};
