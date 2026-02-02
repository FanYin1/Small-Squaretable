/**
 * API 客户端测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ApiError, apiRequest } from './api';
import '../test-setup';

describe('API Client', () => {
  beforeEach(() => {
    // 清除 localStorage
    localStorage.clear();
    // 重置 fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('apiRequest', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: '1', name: 'Test' };
      const mockResponse = {
        success: true,
        data: mockData,
        meta: { timestamp: new Date().toISOString() },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const result = await apiRequest('/test');

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should include Authorization header when token exists', async () => {
      const token = 'test-token';
      localStorage.setItem('token', token);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: {} }),
      });

      await apiRequest('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`,
          }),
        })
      );
    });

    it('should handle API error response', async () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => errorResponse,
      });

      await expect(apiRequest('/test')).rejects.toThrow(ApiError);
      await expect(apiRequest('/test')).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    });

    it('should handle network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(apiRequest('/test')).rejects.toThrow(ApiError);
      await expect(apiRequest('/test')).rejects.toMatchObject({
        status: 0,
        code: 'NETWORK_ERROR',
      });
    });

    it('should handle non-JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      const result = await apiRequest('/test');
      expect(result).toEqual({});
    });
  });

  describe('HTTP methods', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: {} }),
      });
    });

    it('should make GET request', async () => {
      await api.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should make POST request with data', async () => {
      const data = { name: 'Test' };
      await api.post('/test', data);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        })
      );
    });

    it('should make PATCH request with data', async () => {
      const data = { name: 'Updated' };
      await api.patch('/test', data);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(data),
        })
      );
    });

    it('should make PUT request with data', async () => {
      const data = { name: 'Updated' };
      await api.put('/test', data);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(data),
        })
      );
    });

    it('should make DELETE request', async () => {
      await api.delete('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Interceptors', () => {
    it('should apply request interceptor', async () => {
      const interceptor = vi.fn((config) => {
        return {
          ...config,
          headers: {
            ...config.headers,
            'X-Custom-Header': 'test',
          },
        };
      });

      api.addRequestInterceptor(interceptor);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: {} }),
      });

      await api.get('/test');

      expect(interceptor).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'test',
          }),
        })
      );
    });

    it('should apply error interceptor on 401', async () => {
      const errorInterceptor = vi.fn();
      api.addErrorInterceptor(errorInterceptor);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      });

      await expect(api.get('/test')).rejects.toThrow(ApiError);
      expect(errorInterceptor).toHaveBeenCalled();
    });
  });
});
