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

// Backend user format
interface BackendUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

// Backend response format
interface BackendAuthResponse {
  user: BackendUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

// Transform backend user to frontend format
function transformUser(backendUser: BackendUser): User {
  return {
    id: backendUser.id,
    tenantId: backendUser.tenantId,
    email: backendUser.email,
    name: backendUser.displayName,
    avatar: backendUser.avatarUrl || undefined,
    createdAt: new Date().toISOString(),
  };
}

// Transform backend response to frontend format
function transformAuthResponse(response: BackendAuthResponse): LoginResponse | RegisterResponse {
  return {
    user: transformUser(response.user),
    token: response.tokens.accessToken,
    refreshToken: response.tokens.refreshToken,
  };
}

export const authApi = {
  /**
   * 用户登录
   */
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post<BackendAuthResponse>('/auth/login', data);
    return transformAuthResponse(response);
  },

  /**
   * 用户注册
   */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await api.post<BackendAuthResponse>('/auth/register', data);
    return transformAuthResponse(response);
  },

  /**
   * 用户登出
   */
  logout: () =>
    api.post('/auth/logout'),

  /**
   * 刷新访问令牌
   */
  refreshToken: async (data: RefreshTokenRequest): Promise<RefreshTokenResponse> => {
    const response = await api.post<{ tokens: { accessToken: string; refreshToken: string } }>('/auth/refresh', data);
    return {
      token: response.tokens.accessToken,
      refreshToken: response.tokens.refreshToken,
    };
  },

  /**
   * 获取当前用户信息
   */
  getMe: async (): Promise<{ user: User }> => {
    const response = await api.get<{ user: BackendUser }>('/auth/me');
    return { user: transformUser(response.user) };
  },
};
