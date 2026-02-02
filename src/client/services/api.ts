/**
 * 基础 API 客户端
 *
 * 提供统一的 HTTP 请求封装和错误处理
 */

/**
 * API 响应类型（后端标准格式）
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
  };
}

/**
 * API 错误类
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 请求拦截器类型
 */
type RequestInterceptor = (config: RequestInit, url: string) => RequestInit | Promise<RequestInit>;

/**
 * 响应拦截器类型
 */
type ResponseInterceptor = (response: Response) => Response | Promise<Response>;

/**
 * 错误拦截器类型
 */
type ErrorInterceptor = (error: ApiError) => void | Promise<void>;

/**
 * 拦截器管理
 */
class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  async applyRequestInterceptors(config: RequestInit, url: string): Promise<RequestInit> {
    let modifiedConfig = config;
    for (const interceptor of this.requestInterceptors) {
      modifiedConfig = await interceptor(modifiedConfig, url);
    }
    return modifiedConfig;
  }

  async applyResponseInterceptors(response: Response): Promise<Response> {
    let modifiedResponse = response;
    for (const interceptor of this.responseInterceptors) {
      modifiedResponse = await interceptor(modifiedResponse);
    }
    return modifiedResponse;
  }

  async applyErrorInterceptors(error: ApiError): Promise<void> {
    for (const interceptor of this.errorInterceptors) {
      await interceptor(error);
    }
  }
}

/**
 * 基础配置
 */
const API_BASE_URL = '/api/v1'; // Vite 会代理到 http://localhost:3000/api/v1

/**
 * 拦截器实例
 */
const interceptors = new InterceptorManager();

/**
 * 创建 fetch 包装器
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // 获取 token 和 tenantId
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenantId');

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

  // 添加 X-Tenant-ID header
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }

  // 应用请求拦截器
  let requestConfig: RequestInit = {
    ...options,
    headers,
  };
  requestConfig = await interceptors.applyRequestInterceptors(requestConfig, url);

  try {
    let response = await fetch(url, requestConfig);

    // 应用响应拦截器
    response = await interceptors.applyResponseInterceptors(response);

    // 处理非 JSON 响应
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!response.ok) {
      // 尝试解析错误响应
      let errorData: ApiResponse = { success: false };
      if (isJson) {
        errorData = await response.json();
      }

      const error = new ApiError(
        response.status,
        errorData.error?.code || 'UNKNOWN_ERROR',
        errorData.error?.message || response.statusText,
        errorData.error?.details
      );

      // 应用错误拦截器
      await interceptors.applyErrorInterceptors(error);

      throw error;
    }

    // 解析成功响应
    if (isJson) {
      const apiResponse: ApiResponse<T> = await response.json();
      // 返回 data 字段，保持向后兼容
      return apiResponse.data as T;
    }

    return {} as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // 网络错误
    const networkError = new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network request failed'
    );
    await interceptors.applyErrorInterceptors(networkError);
    throw networkError;
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

  put: <T = unknown>(endpoint: string, data?: unknown, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),

  /**
   * 添加请求拦截器
   */
  addRequestInterceptor: (interceptor: RequestInterceptor) => {
    interceptors.addRequestInterceptor(interceptor);
  },

  /**
   * 添加响应拦截器
   */
  addResponseInterceptor: (interceptor: ResponseInterceptor) => {
    interceptors.addResponseInterceptor(interceptor);
  },

  /**
   * 添加错误拦截器
   */
  addErrorInterceptor: (interceptor: ErrorInterceptor) => {
    interceptors.addErrorInterceptor(interceptor);
  },
};

/**
 * 默认错误拦截器：处理 401 未授权错误
 */
api.addErrorInterceptor(async (error: ApiError) => {
  if (error.status === 401) {
    // 清除本地存储的认证信息
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');

    // 可以在这里触发全局事件或重定向到登录页
    console.warn('Unauthorized access, please login again');
  }
});
