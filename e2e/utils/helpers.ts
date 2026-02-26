import { Page } from '@playwright/test';

/**
 * Test Utilities
 *
 * Helper functions for E2E tests
 */

// ---------------------------------------------------------------------------
// Common mock data (correct formats matching API client unwrapping)
// ---------------------------------------------------------------------------

const EMPTY_PAGINATED = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } };

/**
 * Mock common endpoints that most authenticated pages need.
 * Call this after setupAuth() and before page.goto().
 */
export async function mockCommonEndpoints(page: Page) {
  await mockApiResponse(page, '**/api/v1/notifications/unread-count', { success: true, data: { count: 0 } });
  await mockApiResponse(page, '**/api/v1/notifications*', { success: true, data: [] });
  await mockApiResponse(page, '**/api/v1/auth/ws-ticket', { success: true, data: { ticket: 'fake' } });
  await mockApiResponse(page, '**/api/v1/subscriptions/status', { success: true, data: { subscription: { plan: 'free', status: 'active' } } });
  await mockApiResponse(page, '**/api/v1/subscriptions/config', { success: true, data: { publishableKey: 'pk_test', prices: { proMonthly: 'price_1', proYearly: 'price_2', teamMonthly: 'price_3' } } });
  await mockApiResponse(page, '**/api/v1/csrf-token', { csrfToken: 'fake-csrf-token' });
}

/**
 * Mock chat page endpoints (chats list, characters, templates).
 */
export async function mockChatEndpoints(page: Page) {
  await mockApiResponse(page, '**/api/v1/chats', { success: true, data: EMPTY_PAGINATED });
  await mockApiResponse(page, '**/api/v1/characters*', { success: true, data: EMPTY_PAGINATED });
  await mockApiResponse(page, '**/api/v1/chat-templates*', { success: true, data: [] });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Create a fake JWT that passes isTokenValid() check.
 * The Vue router guard decodes payload and checks exp > Date.now()/1000.
 */
export function createFakeJwt(payload: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({
    sub: 'user_1',
    email: 'test@e2e.com',
    tenantId: 'tenant_1',
    role: 'user',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  }));
  const sig = btoa('fake-signature');
  return `${header}.${body}.${sig}`;
}

interface MockUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string;
  plan: string;
}

/**
 * Set up authenticated state for E2E tests.
 * Uses page.addInitScript to inject auth state BEFORE the page loads,
 * ensuring the Vue router guard sees the token immediately.
 */
export async function setupAuth(page: Page, userOverrides: Partial<MockUser> = {}) {
  const user: MockUser = {
    id: 'user_1',
    email: 'test@e2e.com',
    displayName: 'E2E User',
    role: 'user',
    tenantId: 'tenant_1',
    plan: 'free',
    ...userOverrides,
  };
  const token = createFakeJwt({ sub: user.id, email: user.email, tenantId: user.tenantId, role: user.role });

  // Inject localStorage BEFORE page loads - this is critical for SPA auth
  await page.addInitScript(({ token, tenantId }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', token);
    localStorage.setItem('tenantId', tenantId);
    localStorage.setItem('locale', 'en-US');
  }, { token, tenantId: user.tenantId });

  // Mock /auth/me so userStore.initialize() succeeds
  await page.route('**/api/v1/auth/me', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { user } }),
    });
  });

  // Mock /auth/refresh
  await page.route('**/api/v1/auth/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token, refreshToken: token } }),
    });
  });
}

export async function setupAdminAuth(page: Page) {
  return setupAuth(page, {
    id: 'admin_1',
    email: 'admin@e2e.com',
    displayName: 'Admin User',
    role: 'admin',
    plan: 'team',
  });
}

export async function setupLocale(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('locale', 'en-US');
  });
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Clear all cookies and local storage.
 * Navigates to the app origin to access localStorage, then clears it.
 */
export async function clearSession(page: Page) {
  await page.context().clearCookies();
  try {
    await page.goto('/auth/login', { waitUntil: 'commit' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {
    // Ignore — page may not support storage
  }
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a page and wait for /auth/me to complete.
 * Prevents flaky redirects caused by userStore.initialize() race condition.
 * Use after setupAuth() and mock registration.
 */
export async function gotoWithAuth(page: Page, path: string) {
  const authMePromise = page.waitForResponse(
    resp => resp.url().includes('/auth/me'),
    { timeout: 15000 },
  ).catch(() => null);
  await page.goto(path);
  await authMePromise;
  await waitForNetworkIdle(page);

  // If the router guard redirected us away (race condition), retry via client-side navigation
  if (!page.url().includes(path)) {
    await page.evaluate((p) => {
      const appEl = document.getElementById('app');
      if (appEl && (appEl as any).__vue_app__) {
        const router = (appEl as any).__vue_app__.config.globalProperties.$router;
        if (router) router.push(p);
      }
    }, path);
    try {
      await page.waitForURL(`**${path}*`, { timeout: 5000 });
    } catch { /* best effort */ }
    await waitForNetworkIdle(page);
  }
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

/**
 * Wait for network idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 15000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // Network may never fully idle (WebSocket, polling, etc.) — continue anyway
  }
}

/**
 * Set authentication token in localStorage
 */
export async function setAuthToken(page: Page, token: string) {
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
  }, token);
}

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  url: string | RegExp,
  response: any,
  status = 200
) {
  await page.route(url, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Mock LLM API streaming response
 */
export async function mockLLMStream(page: Page, messages: string[]) {
  await page.route('**/api/v1/llm/chat', async (route) => {
    const chunks = messages.map((msg) => `data: ${JSON.stringify({ content: msg })}\n\n`);
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: chunks.join('') + 'data: [DONE]\n\n',
    });
  });
}

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

/**
 * Wait for element to be visible with retry
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout = 10000
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Take screenshot with timestamp
 */
export async function takeScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `playwright-report/screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}

// ---------------------------------------------------------------------------
// Network simulation
// ---------------------------------------------------------------------------

/**
 * Simulate slow network
 */
export async function simulateSlowNetwork(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (500 * 1024) / 8, // 500kb/s
    uploadThroughput: (500 * 1024) / 8,
    latency: 400, // 400ms
  });
}

/**
 * Simulate offline mode
 */
export async function simulateOffline(page: Page) {
  await page.context().setOffline(true);
}

/**
 * Restore online mode
 */
export async function restoreOnline(page: Page) {
  await page.context().setOffline(false);
}

// ---------------------------------------------------------------------------
// Console / Accessibility
// ---------------------------------------------------------------------------

/**
 * Get console errors
 */
export async function getConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  return errors;
}

/**
 * Create a character via the API so chat-dependent tests have data.
 * Extracts the auth token from localStorage and calls the backend directly.
 * Returns the character ID on success, or null if the call fails.
 */
export async function createCharacterViaApi(page: Page): Promise<string | null> {
  const API_URL = process.env.API_URL || 'http://localhost:3000';

  const token = await page.evaluate(() => localStorage.getItem('token'));
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/v1/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: `E2E Char ${Date.now()}`,
        description: 'Auto-created for E2E test',
        greeting: 'Hello from E2E!',
        personality: 'Helpful test character',
        scenario: 'E2E testing',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.data?.id ?? null;
    }
  } catch {
    // Server may not be reachable — fall through
  }
  return null;
}

/**
 * Check for accessibility violations (basic check)
 */
export async function checkAccessibility(page: Page): Promise<boolean> {
  // Check for basic accessibility attributes
  const hasAltText = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.every((img) => img.alt !== undefined);
  });

  const hasAriaLabels = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.every((btn) => btn.textContent || btn.getAttribute('aria-label'));
  });

  return hasAltText && hasAriaLabels;
}
