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
 * CSRF Token 管理器
 */
class CsrfTokenManager {
  private token: string | null = null;
  private authToken: string | null = null;
  private fetchPromise: Promise<string> | null = null;
  private generation = 0;

  async getToken(authToken = localStorage.getItem('token')): Promise<string | null> {
    if (!authToken) {
      this.clearToken();
      return null;
    }
    if (this.authToken !== authToken) {
      this.clearToken();
      this.authToken = authToken;
    }
    if (this.token) return this.token;
    if (this.fetchPromise) return this.fetchPromise;
    const generation = this.generation;
    const pending = this.fetchToken(authToken).then(token => {
      if (generation !== this.generation || localStorage.getItem('token') !== authToken) {
        throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
      }
      this.token = token;
      return token;
    }).catch(async error => {
      if (error instanceof ApiError && error.status === 401 && generation === this.generation && localStorage.getItem('token') === authToken) {
        await interceptors.applyErrorInterceptors(error);
      }
      throw error;
    }).finally(() => {
      if (generation === this.generation) this.fetchPromise = null;
    });
    this.fetchPromise = pending;
    return pending;
  }

  private async fetchToken(authToken: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/csrf-token`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) throw new ApiError(response.status, 'CSRF_TOKEN_UNAVAILABLE', 'Unable to obtain request protection token');
    const data = await response.json();
    if (typeof data.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(data.csrfToken)) {
      throw new ApiError(502, 'CSRF_TOKEN_UNAVAILABLE', 'Invalid request protection token response');
    }
    return data.csrfToken;
  }

  async refreshToken(): Promise<string | null> {
    this.clearToken();
    return this.getToken();
  }

  clearToken(): void {
    this.generation++;
    this.token = null;
    this.authToken = null;
    this.fetchPromise = null;
  }
}
/**
 * CSRF Token 管理器实例
 */
const csrfTokenManager = new CsrfTokenManager();

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
  const token = localStorage.getItem('token');
  const tenant = localStorage.getItem('tenantId');
  try {
    return await performApiRequest<T>(endpoint, options);
  } catch (error) {
    // Authentication rejects the request before the business handler runs.
    // Never replay login, refresh, upstream LLM errors or uncertain network failures.
    if (!(error instanceof ApiError) || error.status !== 401 || !token
      || endpoint.startsWith('/auth')
      || !['UNAUTHORIZED', 'CSRF_TOKEN_UNAVAILABLE'].includes(error.code)) throw error;
    if (localStorage.getItem('token') !== token || localStorage.getItem('tenantId') !== tenant) {
      throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
    }
    const tokens = await refreshSessionTokens();
    if (!tokens) {
      clearExpiredSession(token);
      throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录后再试');
    }
    options.signal?.throwIfAborted();
    if (localStorage.getItem('token') !== tokens.accessToken || localStorage.getItem('tenantId') !== tenant) {
      throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
    }
    try {
      // Rebuild Authorization and CSRF headers, retrying at most once.
      return await performApiRequest<T>(endpoint, options, tokens.accessToken);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401
        && ['UNAUTHORIZED', 'CSRF_TOKEN_UNAVAILABLE'].includes(retryError.code)) {
        clearExpiredSession(tokens.accessToken);
        throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录后再试');
      }
      throw retryError;
    }
  }
}

async function performApiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  expectedToken?: string
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // 获取 token 和 tenantId
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenantId');
  if (expectedToken !== undefined && expectedToken !== token) {
    throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
  }

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

  // 添加 CSRF Token for state-changing methods (POST, PUT, PATCH, DELETE)
  // Skip for auth endpoints (login, register) and public endpoints
  const method = (options.method || 'GET').toUpperCase();
  const isAuthEndpoint = endpoint.startsWith('/auth');
  const isCsrfExcluded = isAuthEndpoint || !token;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isCsrfExcluded) {
    const csrfToken = await csrfTokenManager.getToken(token);
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  // 应用请求拦截器
  let requestConfig: RequestInit = {
    ...options,
    headers,
  };
  requestConfig = await interceptors.applyRequestInterceptors(requestConfig, url);

  if (localStorage.getItem('token') !== token || localStorage.getItem('tenantId') !== tenantId) {
    throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
  }

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
   * GET 请求返回 Blob（用于文件下载）
   */
  getBlob: async (endpoint: string): Promise<Blob> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenantId');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['X-Tenant-ID'] = tenantId;

    let config: RequestInit = { method: 'GET', headers };
    config = await interceptors.applyRequestInterceptors(config, url);

    const response = await fetch(url, config);
    if (!response.ok) {
      throw new ApiError(response.status, 'DOWNLOAD_ERROR', 'Download failed');
    }
    return response.blob();
  },

  /**
   * POST 请求返回 Blob（用于批量导出等）
   */
  postBlob: async (endpoint: string, body: unknown): Promise<Blob> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenantId');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['X-Tenant-ID'] = tenantId;

    // Add CSRF token for POST
    const csrfToken = await csrfTokenManager.getToken(token);
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    let config: RequestInit = { method: 'POST', headers, body: JSON.stringify(body) };
    config = await interceptors.applyRequestInterceptors(config, url);

    const response = await fetch(url, config);
    if (!response.ok) {
      throw new ApiError(response.status, 'DOWNLOAD_ERROR', 'Download failed');
    }
    return response.blob();
  },

  /**
   * POST FormData 请求（用于文件上传）
   */
  postFormData: async <T = unknown>(endpoint: string, formData: FormData): Promise<T> => {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenantId');
    const headers: Record<string, string> = {};
    // Don't set Content-Type — browser sets it with multipart boundary
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['X-Tenant-ID'] = tenantId;

    // Add CSRF token for POST
    const csrfToken = await csrfTokenManager.getToken(token);
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    let config: RequestInit = { method: 'POST', headers, body: formData };
    config = await interceptors.applyRequestInterceptors(config, url);

    const response = await fetch(url, config);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        data?.error?.code || 'UPLOAD_ERROR',
        data?.error?.message || 'Upload failed'
      );
    }
    const data = await response.json();
    return data.data ?? data;
  },

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

interface SessionTokens { accessToken: string; refreshToken: string }
let refreshOperation: { token: string | null; refreshToken: string; tenant: string | null; promise: Promise<SessionTokens> } | null = null;

function notifySessionChanged(): void {
  window.dispatchEvent(new Event('auth-session-changed'));
}

function clearExpiredSession(expectedToken: string | null): void {
  if (localStorage.getItem('token') !== expectedToken) return;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('tenantId');
  csrfTokenManager.clearToken();
  // Keep the page and unsaved form available for copying before re-login.
  notifySessionChanged();
}

/** Shared by HTTP recovery and WebSocket/store recovery: rotate only once. */
export async function refreshSessionTokens(refreshToken = localStorage.getItem('refreshToken')): Promise<SessionTokens | null> {
  if (!refreshToken) return null;
  const token = localStorage.getItem('token');
  const tenant = localStorage.getItem('tenantId');
  const matchesSession = () => localStorage.getItem('token') === token
    && localStorage.getItem('refreshToken') === refreshToken && localStorage.getItem('tenantId') === tenant;
  if (!matchesSession()) throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
  if (refreshOperation?.token === token && refreshOperation.refreshToken === refreshToken && refreshOperation.tenant === tenant) {
    return refreshOperation.promise;
  }
  const operation = { token, refreshToken, tenant, promise: null! as Promise<SessionTokens> };
  operation.promise = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }), signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', '登录续期暂时失败，请稍后重试');
    }
    if (!matchesSession()) throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
    if (!response.ok) {
      if (response.status === 401) {
        clearExpiredSession(token);
        throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录后再试');
      }
      throw new ApiError(response.status, 'SESSION_REFRESH_FAILED', '登录续期暂时失败，请稍后重试');
    }
    const body = await response.json().catch(() => null);
    const tokens = body?.data;
    if (!body?.success || typeof tokens?.accessToken !== 'string' || !tokens.accessToken
      || typeof tokens?.refreshToken !== 'string' || !tokens.refreshToken) {
      throw new ApiError(502, 'SESSION_REFRESH_FAILED', '登录续期响应无效，请重新登录');
    }
    if (!matchesSession()) throw new ApiError(409, 'AUTH_SESSION_CHANGED', 'Login session changed; retry from the current account');
    localStorage.setItem('token', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    csrfTokenManager.clearToken();
    notifySessionChanged();
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  })().finally(() => { if (refreshOperation === operation) refreshOperation = null; });
  refreshOperation = operation;
  return operation.promise;
}

api.addErrorInterceptor(async (error: ApiError) => {

  if (error.status === 403) {
    // CSRF token invalid, try to refresh
    await csrfTokenManager.refreshToken();
    console.warn('CSRF token refreshed, please retry the request');
  }
});

/**
 * 导出 CSRF Token 管理器用于手动控制
 */
export { csrfTokenManager };
