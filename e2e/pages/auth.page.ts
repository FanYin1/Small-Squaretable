import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Authentication Pages
 *
 * Encapsulates authentication-related page interactions.
 * All selectors target the real Vue components with en-US locale.
 */
export class AuthPage {
  readonly page: Page;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    // Error messages in Element Plus form validation or toast messages
    this.errorMessage = page.locator('.el-form-item__error, .el-message--error').first();
    // Success toast messages
    this.successMessage = page.locator('.el-message--success');
  }

  async goto(path: 'login' | 'register') {
    await this.page.goto(`/auth/${path}`);
    await this.page.waitForLoadState('networkidle');
  }

  // ---------------------------------------------------------------------------
  // Login page helpers
  // ---------------------------------------------------------------------------

  /**
   * Fill credentials for login page.
   * Login.vue uses t('auth.email') = "Email" and t('auth.password') = "Password" as placeholders.
   */
  async fillLoginCredentials(email: string, password: string) {
    const emailInput = this.page.getByPlaceholder('Email');
    await emailInput.fill(email);

    const passwordInput = this.page.getByPlaceholder('Password');
    await passwordInput.fill(password);
  }

  // ---------------------------------------------------------------------------
  // Register page helpers
  // ---------------------------------------------------------------------------

  /**
   * Fill credentials for registration page.
   * Register.vue placeholders (en-US):
   *   name     -> "Enter your name"
   *   email    -> "Enter your email"
   *   password -> "Enter password (at least 8 characters, letters and numbers)"
   *   confirm  -> "Re-enter your password"
   */
  async fillRegisterCredentials(email: string, password: string, name?: string) {
    if (name) {
      const nameInput = this.page.getByPlaceholder('Enter your name');
      await nameInput.fill(name);
    }

    const emailInput = this.page.getByPlaceholder('Enter your email');
    await emailInput.fill(email);

    // Placeholder contains "at least 8 characters"
    const passwordInput = this.page.getByPlaceholder(/at least 8 characters/);
    await passwordInput.fill(password);

    const confirmPasswordInput = this.page.getByPlaceholder('Re-enter your password');
    await confirmPasswordInput.fill(password);

    // Accept terms checkbox — click the inner visual checkbox element
    await this.page.locator('.el-checkbox__inner').first().click();
  }

  // ---------------------------------------------------------------------------
  // Generic helpers
  // ---------------------------------------------------------------------------

  /**
   * Generic fillCredentials — determines page context and fills accordingly
   */
  async fillCredentials(email: string, password: string, name?: string) {
    const url = this.page.url();
    if (url.includes('/register')) {
      await this.fillRegisterCredentials(email, password, name);
    } else {
      await this.fillLoginCredentials(email, password);
    }
  }

  /**
   * Click the submit button based on current page.
   * Login.vue: .login-button with text "Login"
   * Register.vue: .register-button with text "Register"
   */
  async submit() {
    const url = this.page.url();
    if (url.includes('/register')) {
      await this.page.locator('.register-button').click();
    } else {
      await this.page.locator('.login-button').click();
    }
    await this.page.waitForTimeout(1000);
  }

  /**
   * Complete login flow
   */
  async login(email: string, password: string) {
    await this.goto('login');
    await this.page.waitForSelector('.login-button', { state: 'visible' });
    await this.fillLoginCredentials(email, password);
    await this.submit();
  }

  /**
   * Complete registration flow
   */
  async register(email: string, password: string, name: string = 'Test User') {
    await this.goto('register');
    await this.page.waitForSelector('.register-button', { state: 'visible' });
    await this.fillRegisterCredentials(email, password, name);
    await this.submit();
  }

  /**
   * Logout user.
   * On the chat page, ChatSidebar has a user dropdown with "Logout" item.
   * On dashboard pages, UserMenu has a dropdown with "Logout" item.
   */
  async logout() {
    await this.page.goto('/chat');
    await this.page.waitForLoadState('networkidle');

    // ChatSidebar footer has a user dropdown; DashboardLayout has UserMenu
    const userBtn = this.page.locator('.user-avatar-btn, .footer-btn').last();
    await userBtn.waitFor({ state: 'visible', timeout: 5000 });
    await userBtn.click();

    // Wait for dropdown and click "Logout" (en-US text from nav.logout)
    const logoutOption = this.page.locator('.el-dropdown-menu__item').filter({ hasText: 'Logout' });
    await logoutOption.waitFor({ state: 'visible' });
    await logoutOption.click();
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      const token = await this.page.evaluate(() => localStorage.getItem('token'));
      return token !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get auth token from localStorage
   */
  async getToken(): Promise<string | null> {
    try {
      return await this.page.evaluate(() => localStorage.getItem('token'));
    } catch {
      return null;
    }
  }
}
