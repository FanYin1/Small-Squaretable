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

export interface MfaRequiredResponse {
  requiresMfa: true;
  mfaToken: string;
}

export interface MfaSetupResponse {
  qrDataUrl: string;
  secret: string;
}

export interface MfaVerifySetupResponse {
  backupCodes: string[];
}

export interface MfaBackupCodesResponse {
  backupCodes: string[];
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

// Backend MFA challenge response
interface BackendMfaRequiredResponse {
  requiresMfa: true;
  mfaToken: string;
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
   * 用户登录 - may return MFA challenge
   */
  login: async (data: LoginRequest): Promise<LoginResponse | MfaRequiredResponse> => {
    const response = await api.post<BackendAuthResponse | BackendMfaRequiredResponse>('/auth/login', data);
    if ('requiresMfa' in response && response.requiresMfa) {
      return { requiresMfa: true, mfaToken: response.mfaToken };
    }
    return transformAuthResponse(response as BackendAuthResponse);
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

  /**
   * 忘记密码 - 发送重置邮件
   */
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  /**
   * 重置密码
   */
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),

  /**
   * 验证邮箱
   */
  verifyEmail: (token: string) =>
    api.get(`/auth/verify-email?token=${token}`),

  /**
   * 重新发送验证邮件
   */
  resendVerification: () =>
    api.post('/auth/resend-verification'),

  /**
   * OAuth 授权码交换
   */
  oauthExchange: async (code: string): Promise<LoginResponse> => {
    const response = await api.post<BackendAuthResponse>('/auth/oauth/exchange', { code });
    return transformAuthResponse(response);
  },

  /**
   * MFA: Start setup (get QR code + secret)
   */
  mfaSetup: () =>
    api.post<MfaSetupResponse>('/auth/mfa/setup'),

  /**
   * MFA: Verify setup with TOTP code
   */
  mfaVerifySetup: (code: string) =>
    api.post<MfaVerifySetupResponse>('/auth/mfa/verify-setup', { code }),

  /**
   * MFA: Disable 2FA with TOTP code
   */
  mfaDisable: (code: string) =>
    api.post('/auth/mfa/disable', { code }),

  /**
   * MFA: Complete login challenge with TOTP/backup code
   */
  mfaChallenge: async (mfaToken: string, code: string): Promise<LoginResponse> => {
    const response = await api.post<BackendAuthResponse>('/auth/mfa/challenge', { mfaToken, code });
    return transformAuthResponse(response);
  },

  /**
   * MFA: Regenerate backup codes
   */
  mfaRegenerateBackupCodes: () =>
    api.post<MfaBackupCodesResponse>('/auth/mfa/backup-codes'),
};
