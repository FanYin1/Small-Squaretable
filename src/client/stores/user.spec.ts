/**
 * User Store 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUserStore } from './user';
import { authApi, ApiError } from '@client/services';


vi.mock('@client/services', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    getMe: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
  csrfTokenManager: {
    clearToken: vi.fn(),
    getToken: vi.fn(),
    setToken: vi.fn(),
  },
}));

describe('User Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockResponse = {
        user: { id: '1', email: 'test@example.com', name: 'Test User', tenantId: 'tenant-1', createdAt: '2024-01-01' },
        token: 'test-token',
        refreshToken: 'test-refresh-token',
      };

      vi.mocked(authApi.login).mockResolvedValue(mockResponse);

      const store = useUserStore();
      await store.login('test@example.com', 'password');

      expect(store.user).toEqual(mockResponse.user);
      expect(store.token).toBe(mockResponse.token);
      expect(store.refreshToken).toBe(mockResponse.refreshToken);
      expect(store.isAuthenticated).toBe(true);
      expect(localStorage.getItem('token')).toBe(mockResponse.token);
      expect(localStorage.getItem('refreshToken')).toBe(mockResponse.refreshToken);
    });

    it('should handle login error', async () => {
      const error = new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
      vi.mocked(authApi.login).mockRejectedValue(error);

      const store = useUserStore();
      await expect(store.login('test@example.com', 'wrong')).rejects.toThrow();

      expect(store.error).toBe('Invalid credentials');
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      const mockResponse = {
        user: { id: '1', email: 'new@example.com', name: 'New User', tenantId: 'tenant-1', createdAt: '2024-01-01' },
        token: 'new-token',
        refreshToken: 'new-refresh-token',
      };

      vi.mocked(authApi.register).mockResolvedValue(mockResponse);

      const store = useUserStore();
      await store.register('new@example.com', 'password', 'New User', true);

      expect(store.user).toEqual(mockResponse.user);
      expect(store.token).toBe(mockResponse.token);
      expect(store.isAuthenticated).toBe(true);
    });

    it('成年声明要透传到接口 —— 漏了这个字段后端会直接 400', async () => {
      vi.mocked(authApi.register).mockResolvedValue({
        user: { id: '1', email: 'new@example.com', name: 'New User', tenantId: 'tenant-1', createdAt: '2024-01-01' },
        token: 'new-token',
        refreshToken: 'new-refresh-token',
      } as never);

      const store = useUserStore();
      await store.register('new@example.com', 'password', 'New User', true);

      expect(authApi.register).toHaveBeenCalledWith(
        expect.objectContaining({ ageConfirmed: true })
      );
    });

    it('邀请码要透传到接口 —— 漏了这个字段后端会直接 400', async () => {
      vi.mocked(authApi.register).mockResolvedValue({
        user: { id: '1', email: 'new@example.com', name: 'New User', tenantId: 'tenant-1', createdAt: '2024-01-01' },
        token: 'new-token',
        refreshToken: 'new-refresh-token',
      } as never);

      const store = useUserStore();
      await store.register('new@example.com', 'password', 'New User', true, 'ABCD-1234-EFGH');

      expect(authApi.register).toHaveBeenCalledWith(
        expect.objectContaining({ inviteCode: 'ABCD-1234-EFGH' })
      );
    });

    it('should handle registration error', async () => {
      const error = new ApiError(400, 'EMAIL_EXISTS', 'Email already exists');
      vi.mocked(authApi.register).mockRejectedValue(error);

      const store = useUserStore();
      await expect(
        store.register('existing@example.com', 'password', 'User', true)
      ).rejects.toThrow();

      expect(store.error).toBe('Email already exists');
      expect(store.user).toBeNull();
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const store = useUserStore();
      store.user = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01' };
      store.token = 'test-token';
      localStorage.setItem('token', 'test-token');

      vi.mocked(authApi.logout).mockResolvedValue(undefined);

      await store.logout();

      expect(store.user).toBeNull();
      expect(store.token).toBeNull();
      expect(store.refreshToken).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });

    it('should clear state even if API call fails', async () => {
      const store = useUserStore();
      store.user = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01' };
      store.token = 'test-token';

      vi.mocked(authApi.logout).mockRejectedValue(new Error('Network error'));

      await store.logout();

      expect(store.user).toBeNull();
      expect(store.token).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token successfully', async () => {
      const mockResponse = {
        token: 'new-token',
        refreshToken: 'new-refresh-token',
      };

      vi.mocked(authApi.refreshToken).mockResolvedValue(mockResponse);

      const store = useUserStore();
      store.refreshToken = 'old-refresh-token';

      await store.refreshAccessToken();

      expect(store.token).toBe(mockResponse.token);
      expect(store.refreshToken).toBe(mockResponse.refreshToken);
      expect(localStorage.getItem('token')).toBe(mockResponse.token);
    });

    it('should logout on refresh failure', async () => {
      vi.mocked(authApi.refreshToken).mockRejectedValue(new Error('Invalid token'));

      const store = useUserStore();
      store.refreshToken = 'invalid-token';
      store.user = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01' };

      await expect(store.refreshAccessToken()).rejects.toThrow();

      expect(store.user).toBeNull();
      expect(store.token).toBeNull();
    });

    it('should throw error if no refresh token', async () => {
      const store = useUserStore();

      await expect(store.refreshAccessToken()).rejects.toThrow('No refresh token available');
    });
  });

  describe('fetchProfile', () => {
    it('should fetch profile successfully', async () => {
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test User', createdAt: '2024-01-01' };
      vi.mocked(authApi.getMe).mockResolvedValue({ user: mockUser });

      const store = useUserStore();
      await store.fetchProfile();

      expect(store.user).toEqual(mockUser);
      expect(store.error).toBeNull();
    });

    it('should handle fetch profile error', async () => {
      const error = new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');
      vi.mocked(authApi.getMe).mockRejectedValue(error);

      const store = useUserStore();
      await expect(store.fetchProfile()).rejects.toThrow();

      expect(store.error).toBe('Unauthorized');
    });
  });

  describe('initialize', () => {
    it('should fetch profile if token exists', async () => {
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01' };
      vi.mocked(authApi.getMe).mockResolvedValue({ user: mockUser });

      localStorage.setItem('token', 'test-token');

      const store = useUserStore();
      await store.initialize();

      expect(store.user).toEqual(mockUser);
    });

    it('should clear auth when the server rejects authentication', async () => {
      vi.mocked(authApi.getMe).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Invalid token'));

      localStorage.setItem('token', 'invalid-token');

      const store = useUserStore();
      await store.initialize();

      expect(store.user).toBeNull();
      expect(store.token).toBeNull();
    });

    it.each([
      new ApiError(429, 'RATE_LIMITED', 'Try again later'),
      new ApiError(503, 'UNAVAILABLE', 'Service unavailable'),
      new Error('Network unavailable'),
    ])('preserves credentials after temporary profile failure: %s', async (failure) => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('refreshToken', 'refresh-token');
      localStorage.setItem('tenantId', 'tenant-id');
      vi.mocked(authApi.getMe).mockRejectedValueOnce(failure);
      const store = useUserStore();

      await store.initialize();

      expect(store.token).toBe('valid-token');
      expect(store.refreshToken).toBe('refresh-token');
      expect(localStorage.getItem('tenantId')).toBe('tenant-id');
      expect(localStorage.getItem('token')).toBe('valid-token');
      expect(store.error).toBe(failure.message);
      const mockUser = { id: '1', email: 'test@example.com', name: 'Test', createdAt: '2024-01-01' };
      vi.mocked(authApi.getMe).mockResolvedValueOnce({ user: mockUser });
      await store.initialize();
      expect(store.user).toEqual(mockUser);
      expect(store.error).toBeNull();
    });

    it('should not fetch if no token', async () => {
      const store = useUserStore();
      await store.initialize();

      expect(authApi.getMe).not.toHaveBeenCalled();
    });
  });
});
