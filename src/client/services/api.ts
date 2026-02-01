/**
 * 基础 API 客户端
 *
 * 提供统一的 HTTP 请求封装和错误处理
 */

/**
 * API 响应类型
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

/**
 * API 错误类
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 基础配置
 */
const API_BASE_URL = '/api'; // Vite 会代理到 http://localhost:3000/api

/**
 * 创建 fetch 包装器
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // 获取 token
  const token = localStorage.getItem('token');

  // 默认 headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 合并自定义 headers
  if (options.headers) {
    const customHeaders = new Headers(options.headers);
    customHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  }

  // 添加 Authorization header
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 添加 X-Tenant-ID header (如果需要)
  // TODO: 从 user store 获取 tenantId
  // headers['X-Tenant-ID'] = tenantId;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 处理非 JSON 响应
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!response.ok) {
      // 尝试解析错误响应
      let errorData: Record<string, unknown> = {};
      if (isJson) {
        errorData = await response.json();
      }

      throw new ApiError(
        response.status,
        errorData.code || 'UNKNOWN_ERROR',
        errorData.message || errorData.error || response.statusText
      );
    }

    // 解析成功响应
    if (isJson) {
      const data = await response.json();
      return data;
    }

    return {} as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // 网络错误
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network request failed'
    );
  }
}

/**
 * HTTP 方法快捷方式
 */
export const api = {
  get: <T = unknown>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, data?: unknown, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T = unknown>(endpoint: string, data?: unknown, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};
