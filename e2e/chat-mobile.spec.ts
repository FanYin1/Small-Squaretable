import { test, expect, type Page } from '@playwright/test';
import {
  clearSession,
  mockApiResponse,
  setupAuth,
  mockCommonEndpoints,
  gotoWithAuth,
  mockLLMStream,
} from './utils/helpers';

/**
 * E2E Tests: Chat on a 390px-wide phone (backlog P1-3)
 *
 * Flow: enter chat -> open drawer -> switch character -> send message -> see reply,
 * with no horizontal scroll at any step. All API responses are mocked.
 */

const PHONE = { width: 390, height: 844 };
const PAGINATION = { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false };

const makeChat = (n: 1 | 2, name: string) => ({
  id: `chat_${n}`, tenantId: 'tenant_1', userId: 'user_1', characterId: `char_${n}`,
  title: `${name} Chat`, characterName: `${name} Bot`, characterAvatar: null,
  lastMessage: `Hello from ${name}`, lastMessageAt: `2026-01-0${n}T00:00:00Z`,
  createdAt: `2026-01-0${n}T00:00:00Z`, updatedAt: `2026-01-0${n}T00:00:00Z`,
});

const CHATS_LIST = {
  success: true,
  data: { items: [makeChat(1, 'Alpha'), makeChat(2, 'Beta')], pagination: PAGINATION },
};

const makeCharacter = (n: 1 | 2, name: string) => ({
  id: `char_${n}`, name: `${name} Bot`, description: `A ${name} bot`,
  greeting: 'Hello!', avatarUrl: null, avatar: null, tags: [],
  isPublic: false, creatorId: 'user_1',
  createdAt: `2026-01-0${n}T00:00:00Z`, updatedAt: `2026-01-0${n}T00:00:00Z`,
});

const CHARACTERS = {
  success: true,
  data: { items: [makeCharacter(1, 'Alpha'), makeCharacter(2, 'Beta')], pagination: PAGINATION },
};

// A deliberately long unbroken token: the classic cause of horizontal scroll in chat bubbles.
const LONG_TOKEN = 'https://example.com/' + 'a'.repeat(120);

const messagesFor = (n: 1 | 2, name: string) => ({
  success: true,
  data: [
    {
      id: `msg_${n}_1`, chatId: `chat_${n}`, role: 'user', content: 'Hello there',
      sentAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: `msg_${n}_2`, chatId: `chat_${n}`, role: 'assistant',
      content: `Hi from ${name}! ${LONG_TOKEN}`,
      characterName: `${name} Bot`, sentAt: '2026-01-01T00:01:00Z', createdAt: '2026-01-01T00:01:00Z',
    },
  ],
});

async function setupMocks(page: Page) {
  // Catch-all first (Playwright matches the most recently registered route first).
  await page.route('**/api/v1/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
  });
  await mockApiResponse(page, '**/api/v1/chats', CHATS_LIST);
  await mockApiResponse(page, '**/api/v1/characters*', CHARACTERS);
  await mockApiResponse(page, '**/api/v1/chat-templates*', { success: true, data: [] });
  await mockCommonEndpoints(page);

  for (const [n, name] of [[1, 'Alpha'], [2, 'Beta']] as const) {
    await mockApiResponse(page, `**/api/v1/chats/chat_${n}/messages*`, messagesFor(n, name));
    await mockApiResponse(page, `**/api/v1/chats/chat_${n}/characters`, { success: true, data: [] });
    await mockApiResponse(page, `**/api/v1/characters/char_${n}/intelligence/emotion*`, {
      success: true, data: { current: { valence: 0.5, arousal: 0.3, label: 'content' }, history: [] },
    });
    await mockApiResponse(page, `**/api/v1/characters/char_${n}/intelligence/memories*`, {
      success: true, data: { memories: [], total: 0 },
    });
  }
}

/**
 * Lists elements in the chat layout that stick out past the right edge of the viewport.
 *
 * document.scrollWidth alone is NOT enough: .chat-main has overflow:hidden, so a too-wide
 * child is clipped and the document never reports overflow (verified with a 700px probe
 * element: scrollWidth stayed 390). Clipped content is still broken UX (cut-off text), so
 * this walks the elements themselves. Subtrees inside an intentional horizontal scroller
 * (overflow-x: auto/scroll, e.g. code blocks) are skipped, as is the off-canvas drawer.
 */
async function findElementsOverflowingRight(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = window.innerWidth + 1;
    const offenders: string[] = [];
    const root = document.querySelector('.chat-layout');
    if (!root) return ['.chat-layout missing'];

    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };

    for (const el of root.querySelectorAll('*')) {
      if (el.closest('#chat-sidebar-drawer') && !el.closest('.mobile-open')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > limit && !inScroller(el)) {
        const cls = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '';
        offenders.push(`${el.tagName.toLowerCase()}.${cls.split(/\s+/).filter(Boolean).join('.')} right=${Math.round(rect.right)}`);
      }
    }
    return offenders.slice(0, 10);
  });
}

/** Neither the document nor any element of the chat layout may extend past the viewport. */
async function expectNoHorizontalScroll(page: Page) {
  const doc = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(doc.scroll, JSON.stringify(doc)).toBeLessThanOrEqual(doc.client);
  expect(await findElementsOverflowingRight(page)).toEqual([]);
}

test.describe('Chat at 390px', () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    await page.setViewportSize(PHONE);
    await setupAuth(page);
    await page.addInitScript(() => { localStorage.setItem('lastChatId', 'chat_1'); });
    await setupMocks(page);
  });

  test('no horizontal scroll, main area fills the screen, drawer is closed', async ({ page }) => {
    await gotoWithAuth(page, '/chat');

    await expect(page.locator('.message-input textarea')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.chat-sidebar-wrapper.mobile-closed')).toBeAttached();
    await expect(page.locator('#chat-sidebar-drawer')).toHaveAttribute('inert', '');

    const main = await page.locator('.chat-main').boundingBox();
    expect(main?.width).toBeGreaterThan(PHONE.width - 10);
    await expectNoHorizontalScroll(page);
  });

  test('drawer toggle is keyboard operable and labelled', async ({ page }) => {
    await gotoWithAuth(page, '/chat');

    const toggle = page.locator('.mobile-hamburger');
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toHaveAttribute('aria-label', /.+/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.chat-sidebar-wrapper.mobile-open')).toBeAttached();
    await expect(page.locator('#chat-sidebar-drawer')).not.toHaveAttribute('inert', /.*/);

    // The drawer must not push the main area aside: it floats over it.
    const main = await page.locator('.chat-main').boundingBox();
    expect(main?.width).toBeGreaterThan(PHONE.width - 10);
    await expectNoHorizontalScroll(page);

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('enter chat -> switch character -> send message -> see reply, without sideways scroll', async ({ page }) => {
    await mockLLMStream(page, ['Sure', ', I can help!']);
    await page.route('**/api/v1/chats/chat_2/messages', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'msg_new', chatId: 'chat_2', role: 'user', content: 'Ping from phone',
              sentAt: new Date().toISOString(), createdAt: new Date().toISOString(),
            },
          }),
        });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(messagesFor(2, 'Beta')) });
      }
    });

    await gotoWithAuth(page, '/chat');
    await expect(page.getByText('Hi from Alpha!')).toBeVisible({ timeout: 10000 });
    await expectNoHorizontalScroll(page);

    // Switch character through the drawer
    await page.locator('.mobile-hamburger').click();
    await expect(page.locator('.chat-sidebar-wrapper.mobile-open')).toBeAttached();
    await page.locator('.chat-item', { hasText: 'Beta' }).first().click();

    // Drawer closes by itself and the other character's conversation shows up
    await expect(page.locator('.chat-sidebar-wrapper.mobile-closed')).toBeAttached();
    await expect(page.getByText('Hi from Beta!')).toBeVisible({ timeout: 10000 });
    await expectNoHorizontalScroll(page);

    // Send a message: the input stays inside the viewport and the text lands in the thread
    const textarea = page.locator('.message-input textarea');
    await textarea.fill('Ping from phone');
    await textarea.press('Enter');
    await expect(textarea).toHaveValue('', { timeout: 5000 });
    await expect(page.getByText('Ping from phone')).toBeVisible({ timeout: 10000 });

    const box = await page.locator('.message-input').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);
    await expectNoHorizontalScroll(page);
  });

  test('overflow detector self-check: flags an element wider than the viewport', async ({ page }) => {
    await gotoWithAuth(page, '/chat');
    await expect(page.locator('.chat-main')).toBeVisible({ timeout: 10000 });
    expect(await findElementsOverflowingRight(page)).toEqual([]);

    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'overflow-probe';
      probe.style.cssText = 'width:700px;height:20px;flex:none';
      document.querySelector('.chat-main')!.appendChild(probe);
    });
    const offenders = await findElementsOverflowingRight(page);
    expect(offenders.join('\n')).toContain('overflow-probe');
  });

  test('page is sized with dvh and not taller than the viewport', async ({ page }) => {
    await gotoWithAuth(page, '/chat');
    await expect(page.locator('.chat-layout')).toBeVisible({ timeout: 10000 });

    const layout = await page.locator('.chat-layout').boundingBox();
    expect(layout?.height).toBeLessThanOrEqual(PHONE.height);
    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    );
    expect(scrollable).toBe(false);
  });
});
