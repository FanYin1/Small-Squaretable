import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Character Management
 *
 * Encapsulates character creation and management interactions
 */
export class CharacterPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly greetingInput: Locator;
  readonly personalityInput: Locator;
  readonly scenarioInput: Locator;
  readonly saveButton: Locator;
  readonly publishButton: Locator;
  readonly deleteButton: Locator;
  readonly characterList: Locator;
  readonly upgradePrompt: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.locator('input[name="name"], input[placeholder*="Name"]');
    this.descriptionInput = page.locator('textarea[name="description"], textarea[placeholder*="Description"]');
    this.greetingInput = page.locator('textarea[name="greeting"], textarea[placeholder*="Greeting"]');
    this.personalityInput = page.locator('textarea[name="personality"], textarea[placeholder*="Personality"]');
    this.scenarioInput = page.locator('textarea[name="scenario"], textarea[placeholder*="Scenario"]');
    this.saveButton = page.locator('button:has-text("Save"), button:has-text("保存")');
    this.publishButton = page.locator('button:has-text("Publish"), button:has-text("发布")');
    this.deleteButton = page.locator('button:has-text("Delete"), button:has-text("删除")');
    this.characterList = page.locator('.character-card, .character-item');
    this.upgradePrompt = page.locator('.upgrade-prompt, .feature-gate-prompt');
  }

  async goto() {
    await this.page.goto('/my-characters');
  }

  async createCharacter(character: {
    name: string;
    description: string;
    greeting: string;
    personality: string;
    scenario: string;
  }) {
    await this.nameInput.fill(character.name);
    await this.descriptionInput.fill(character.description);
    await this.greetingInput.fill(character.greeting);
    await this.personalityInput.fill(character.personality);
    await this.scenarioInput.fill(character.scenario);
  }

  async save() {
    await this.saveButton.click();
  }

  async publish() {
    await this.publishButton.click();
  }

  async delete() {
    await this.deleteButton.click();
    // Confirm deletion if dialog appears
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("确认")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
  }

  async getCharacterCount(): Promise<number> {
    return await this.characterList.count();
  }

  async editCharacter(index: number) {
    const editButton = this.characterList.nth(index).locator('button:has-text("Edit"), button:has-text("编辑")');
    await editButton.click();
  }

  async isUpgradePromptVisible(): Promise<boolean> {
    return await this.upgradePrompt.isVisible();
  }
}
