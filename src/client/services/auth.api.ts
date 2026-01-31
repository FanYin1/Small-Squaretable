/**
 * 认证 API
 *
 * 处理用户认证相关的 API 请求
 */

import { api } from './api';
import type { User } from '@client/types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface RegisterResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

export const authApi = {
  /**
   * 用户登录
   */
  login: (data: LoginRequest) =>
    api.post<LoginResponse>('/auth/login', data),

  /**
   * 用户注册
   */
  register: (data: RegisterRequest) =>
    api.post<RegisterResponse>('/auth/register', data),

  /**
   * 用户登出
   */
  logout: () =>
    api.post('/auth/logout'),

  /**
   * 刷新访问令牌
   */
  refreshToken: (data: RefreshTokenRequest) =>
    api.post<RefreshTokenResponse>('/auth/refresh', data),

  /**
   * 获取当前用户信息
   */
  getMe: () =>
    api.get<{ user: User }>('/auth/me'),
};
