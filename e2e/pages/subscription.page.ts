import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Subscription Management
 *
 * Encapsulates subscription page interactions
 */
export class SubscriptionPage {
  readonly page: Page;
  readonly currentPlanCard: Locator;
  readonly planCards: Locator;
  readonly upgradeButtons: Locator;
  readonly billingCycleToggle: Locator;
  readonly usageStats: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.currentPlanCard = page.locator('.current-plan, .active-plan');
    this.planCards = page.locator('.plan-card, .subscription-card');
    this.upgradeButtons = page.locator('button:has-text("Upgrade"), button:has-text("升级")');
    this.billingCycleToggle = page.locator('.billing-toggle, input[type="checkbox"][name="billing"]');
    this.usageStats = page.locator('.usage-stats, .usage-card');
    this.cancelButton = page.locator('button:has-text("Cancel"), button:has-text("取消订阅")');
  }

  async goto() {
    await this.page.goto('/subscription');
  }

  async getCurrentPlan(): Promise<string> {
    const planText = await this.currentPlanCard.textContent();
    return planText || '';
  }

  async toggleBillingCycle() {
    await this.billingCycleToggle.click();
  }

  async upgradeToPlan(planName: string) {
    const planCard = this.page.locator(`.plan-card:has-text("${planName}"), .subscription-card:has-text("${planName}")`);
    const upgradeButton = planCard.locator('button:has-text("Upgrade"), button:has-text("升级")');
    await upgradeButton.click();
  }

  async getUsageStats(): Promise<{ messages: number; characters: number }> {
    const statsText = await this.usageStats.textContent();
    // Parse usage stats from text
    const messagesMatch = statsText?.match(/(\d+)\s*messages?/i);
    const charactersMatch = statsText?.match(/(\d+)\s*characters?/i);

    return {
      messages: messagesMatch ? parseInt(messagesMatch[1]) : 0,
      characters: charactersMatch ? parseInt(charactersMatch[1]) : 0,
    };
  }

  async cancelSubscription() {
    await this.cancelButton.click();
    // Confirm cancellation if dialog appears
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("确认")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
  }

  async isPlanActive(planName: string): Promise<boolean> {
    const currentPlan = await this.getCurrentPlan();
    return currentPlan.toLowerCase().includes(planName.toLowerCase());
  }
}
