import type { Page } from '@playwright/test';
import { mockApiResponse, mockCommonEndpoints, mockModules, mockUnhandledApi, setupAuth } from './helpers';

export const redesignStory = {
  id: 'redesign-story', name: '雾港来信', description: '末班渡轮离港之前，一封没有署名的信被塞进你的掌心。你会留下，还是追上那个消失在雾里的人？',
  avatarUrl: null, tags: ['悬疑', '慢叙事', '探索'], isPublic: true, creatorId: 'user_1',
  createdAt: '2026-10-22T10:00:00Z', updatedAt: '2026-10-22T10:00:00Z',
  cardData: { name: '守灯人', creator: '内测作者', scenario: '暮色里的港口。你是一位刚到这里的旅人。', first_mes: '“你也在等那艘船吗？”\n\n守灯人收起伞，望向雾里的灯火。信封在你手中留下淡淡的墨香。\n\n“有些信，不一定要交给收信人。”', alternate_greetings: [] },
};
const pagination = { page: 1, limit: 20, total: 3, totalPages: 1, hasNext: false, hasPrev: false };
const chat = { id: 'redesign-chat', tenantId: 'tenant_1', userId: 'user_1', characterId: redesignStory.id, title: '雾港来信', characterName: '守灯人', createdAt: redesignStory.createdAt, updatedAt: redesignStory.updatedAt, summary: '码头的灯，一盏接一盏亮了。' };

export async function setupRedesign(page: Page, role = 'user') {
  await setupAuth(page, { role, displayName: '林间旅人' });
  await mockUnhandledApi(page);
  await mockModules(page, []);
  await mockCommonEndpoints(page);
  await page.routeWebSocket(/\/ws(?:\?|$)/, () => {});
  const respond = (pattern: string, data: unknown) => mockApiResponse(page, `**/api/v1/${pattern}`, { success: true, data });
  await respond('characters*', { items: [{ ...redesignStory, isPublic: false }], pagination: { ...pagination, total: 1 } });
  await respond('characters/search?**', { items: [redesignStory, { ...redesignStory, id: 'story-2', name: '山间的旧书店' }, { ...redesignStory, id: 'story-3', name: '最后一站，月亮' }], pagination });
  await respond('characters/redesign-story', redesignStory);
  await respond('characters/redesign-story/ratings', { overall: '4.5', count: 12 });
  await respond('characters/redesign-story/intelligence/emotion*', { current: { valence: 0.2, arousal: 0.2, label: 'calm' }, history: [] });
  await respond('characters/redesign-story/intelligence/memories*', { memories: [], total: 0 });
  await respond('chats', { items: [chat], pagination: { ...pagination, total: 1 } });
  await respond('chats/redesign-chat', chat);
  await respond('chats/redesign-chat/messages*', []);
  await respond('chats/redesign-chat/characters', []);
  await respond('chat-templates*', []);
  await respond('character-collections*', []);
  await respond('personas', [{ id: 'persona-1', name: '林间旅人', description: '循着线索来到雾港的写作者。', metadata: {}, isDefault: false }, { id: 'persona-2', name: '远行者', description: '一位归乡的旅人。', metadata: {}, isDefault: false }]);
  await respond('llm/models', [{ id: 'controlled-preview', provider: 'custom', contextWindow: 8192, maxOutputTokens: 1024, defaultTemperature: 0.7 }]);
  await respond('credits/balance', { billingMode: 'credits', tokensPerPoint: 10000, balanceTokens: 62000, heldTokens: 5000, availableTokens: 57000, balancePoints: 6.2, availablePoints: 5.7 });
  await respond('credits/ledger*', { items: [{ id: 'ledger-1', kind: 'charge', tokens: -6200, points: -0.62, chatId: chat.id, messageId: 1, createdAt: redesignStory.createdAt }], pagination: { ...pagination, total: 1 } });
  await respond('social/favorites*', { isFavorited: false, favoriteCount: 0 });
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'zh-CN');
    localStorage.setItem('lastChatId', 'redesign-chat');
    localStorage.setItem('story-onboarding:v1:["tenant_1","user_1"]', 'done');
  });
}
