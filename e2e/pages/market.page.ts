import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Character Market
 *
 * Selectors match the real Vue components:
 *   Market.vue          — .market-content, .character-grid
 *   CharacterCard.vue   — .character-card
 *   SearchCombo.vue     — .search-combo .search-input, .search-btn, .new-chat-btn
 *   FilterToolbar.vue   — filter controls
 */
export class MarketPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly characterCards: Locator;
  readonly characterGrid: Locator;
  readonly marketContent: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    this.page = page;
    // SearchCombo uses a native <input> with class .search-input
    this.searchInput = page.locator('.search-combo .search-input');
    // Search button in SearchCombo
    this.searchButton = page.locator('.search-combo .search-btn');
    // Character cards rendered by CharacterCard component
    this.characterCards = page.locator('.character-card');
    // Grid container
    this.characterGrid = page.locator('.character-grid');
    // Market content wrapper
    this.marketContent = page.locator('.market-content');
    // Pagination
    this.pagination = page.locator('.pagination-wrapper .el-pagination');
  }

  async goto() {
    await this.page.goto('/market');
  }

  async searchCharacter(query: string) {
    await this.searchInput.fill(query);
    await this.searchButton.click();
    // Wait for search results to update
    await this.page.waitForTimeout(500);
  }

  async filterByCategory(category: string) {
    const filterButton = this.page.locator(`button:has-text("${category}")`);
    await filterButton.click();
  }

  async getCharacterCount(): Promise<number> {
    return await this.characterCards.count();
  }

  async clickCharacter(index: number) {
    await this.characterCards.nth(index).click();
  }

  async clickCharacterByName(name: string) {
    const card = this.page.locator(`.character-card:has-text("${name}")`);
    await card.click();
  }

  async goToPage(pageNum: number) {
    await this.pagination.locator(`button:has-text("${pageNum}")`).click();
  }
}
