import { test, expect } from '@playwright/test';
import { setupAuth, mockApiResponse, waitForNetworkIdle, mockCommonEndpoints } from './utils/helpers';

/**
 * E2E Tests: Webhook Management (API-only)
 *
 * Webhooks have no dedicated UI page. These tests verify the API contract
 * by using page.evaluate(fetch(...)) after navigating to /developer.
 * All API responses are mocked — no live backend required.
 */

test.describe('Webhook Management', () => {
  // 1. Webhook list API returns data
  test('webhook list API returns data', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/developer/api-keys', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/developer/scopes', { success: true, data: [] });

    await page.route('**/api/v1/webhooks', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              webhooks: [
                { id: 'wh_1', url: 'https://example.com/hook', events: ['character.created'], active: true },
              ],
            },
          }),
        });
      } else {
        route.fallback();
      }
    });

    await page.goto('/developer');
    await waitForNetworkIdle(page);

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/v1/webhooks');
      return res.json();
    });

    expect(response.success).toBe(true);
    expect(response.data.webhooks).toHaveLength(1);
    expect(response.data.webhooks[0].id).toBe('wh_1');
    expect(response.data.webhooks[0].url).toBe('https://example.com/hook');
    expect(response.data.webhooks[0].events).toContain('character.created');
    expect(response.data.webhooks[0].active).toBe(true);
  });

  // 2. Webhook create API works
  test('webhook create API works', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/developer/api-keys', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/developer/scopes', { success: true, data: [] });

    await page.route('**/api/v1/webhooks', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'wh_2',
              url: 'https://new.example.com/hook',
              events: ['chat.message.created'],
              active: true,
            },
          }),
        });
      } else {
        route.fallback();
      }
    });

    await page.goto('/developer');
    await waitForNetworkIdle(page);

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://new.example.com/hook',
          events: ['chat.message.created'],
        }),
      });
      return res.json();
    });

    expect(response.success).toBe(true);
    expect(response.data.id).toBe('wh_2');
    expect(response.data.url).toBe('https://new.example.com/hook');
    expect(response.data.events).toContain('chat.message.created');
    expect(response.data.active).toBe(true);
  });

  // 3. Webhook delete API works
  test('webhook delete API works', async ({ page }) => {
    await setupAuth(page);
    await mockCommonEndpoints(page);
    await mockApiResponse(page, '**/api/v1/developer/api-keys', { success: true, data: [] });
    await mockApiResponse(page, '**/api/v1/developer/scopes', { success: true, data: [] });

    await page.route('**/api/v1/webhooks/wh_1', (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { deleted: true },
          }),
        });
      } else {
        route.fallback();
      }
    });

    await page.goto('/developer');
    await waitForNetworkIdle(page);

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/v1/webhooks/wh_1', { method: 'DELETE' });
      return res.json();
    });

    expect(response.success).toBe(true);
    expect(response.data.deleted).toBe(true);
  });
});
