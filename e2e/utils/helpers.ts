import { Page } from '@playwright/test';

/**
 * Test Utilities
 *
 * Helper functions for E2E tests
 */

/**
 * Wait for network idle
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Clear all cookies and local storage
 */
export async function clearSession(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
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
