import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Character Market
 *
 * Encapsulates character market page interactions
 */
export class MarketPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly filterButtons: Locator;
  readonly sortDropdown: Locator;
  readonly characterCards: Locator;
  readonly loadMoreButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="搜索"]');
    this.filterButtons = page.locator('.filter-button, .el-button-group button');
    this.sortDropdown = page.locator('.sort-dropdown, select[name="sort"]');
    this.characterCards = page.locator('.character-card, .el-card');
    this.loadMoreButton = page.locator('button:has-text("Load More"), button:has-text("加载更多")');
  }

  async goto() {
    await this.page.goto('/market');
  }

  async searchCharacter(query: string) {
    await this.searchInput.fill(query);
    // Wait for search results to update
    await this.page.waitForTimeout(500);
  }

  async filterByCategory(category: string) {
    const filterButton = this.page.locator(`button:has-text("${category}")`);
    await filterButton.click();
  }

  async sortBy(option: string) {
    await this.sortDropdown.selectOption(option);
  }

  async getCharacterCount(): Promise<number> {
    return await this.characterCards.count();
  }

  async clickCharacter(index: number) {
    await this.characterCards.nth(index).click();
  }

  async clickCharacterByName(name: string) {
    const card = this.page.locator(`.character-card:has-text("${name}"), .el-card:has-text("${name}")`);
    await card.click();
  }

  async loadMore() {
    await this.loadMoreButton.click();
  }
}
