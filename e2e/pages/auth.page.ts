import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Authentication Pages
 *
 * Encapsulates authentication-related page interactions
 */
export class AuthPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"], input[name="email"]');
    this.passwordInput = page.locator('input[type="password"], input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.error-message, .el-message--error');
    this.successMessage = page.locator('.success-message, .el-message--success');
  }

  async goto(path: 'login' | 'register') {
    await this.page.goto(`/auth/${path}`);
  }

  async fillCredentials(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit() {
    await this.submitButton.click();
  }

  async login(email: string, password: string) {
    await this.goto('login');
    await this.fillCredentials(email, password);
    await this.submit();
  }

  async register(email: string, password: string) {
    await this.goto('register');
    await this.fillCredentials(email, password);
    await this.submit();
  }

  async logout() {
    // Click user menu or logout button
    const logoutButton = this.page.locator('button:has-text("Logout"), button:has-text("登出")');
    await logoutButton.click();
  }

  async isLoggedIn(): Promise<boolean> {
    // Check if token exists in localStorage
    const token = await this.page.evaluate(() => localStorage.getItem('token'));
    return token !== null;
  }

  async getToken(): Promise<string | null> {
    return await this.page.evaluate(() => localStorage.getItem('token'));
  }
}
