import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Authentication Pages
 *
 * Encapsulates authentication-related page interactions
 * Uses Element Plus component selectors
 */
export class AuthPage {
  readonly page: Page;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    // Error messages in Element Plus form validation or toast messages
    // Use .first() to avoid strict mode violations when multiple errors exist
    this.errorMessage = page.locator('.el-form-item__error, .el-message--error').first();
    // Success toast messages
    this.successMessage = page.locator('.el-message--success');
  }

  async goto(path: 'login' | 'register') {
    await this.page.goto(`/auth/${path}`);
    // Wait for the form to be visible
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Fill credentials for login page
   */
  async fillLoginCredentials(email: string, password: string) {
    // Fill email - login page has "邮箱地址" placeholder
    const emailInput = this.page.getByPlaceholder('邮箱地址');
    await emailInput.fill(email);

    // Fill password - login page has "密码" placeholder
    const passwordInput = this.page.getByPlaceholder('密码');
    await passwordInput.fill(password);
  }

  /**
   * Fill credentials for registration page
   */
  async fillRegisterCredentials(email: string, password: string, name?: string) {
    if (name) {
      // Fill name field
      const nameInput = this.page.getByPlaceholder('请输入您的姓名');
      await nameInput.fill(name);
    }

    // Fill email - register page has "请输入您的邮箱" placeholder
    const emailInput = this.page.getByPlaceholder('请输入您的邮箱');
    await emailInput.fill(email);

    // Fill password - register page has specific placeholder with validation hint
    const passwordInput = this.page.getByPlaceholder(/至少 8 个字符/);
    await passwordInput.fill(password);

    // Fill confirm password
    const confirmPasswordInput = this.page.getByPlaceholder('请再次输入密码');
    await confirmPasswordInput.fill(password);

    // Accept terms checkbox - Element Plus checkbox requires clicking the label text
    // The checkbox label contains the text "我已阅读并同意"
    const checkboxLabel = this.page.locator('label.el-checkbox, .el-checkbox').first();
    await checkboxLabel.scrollIntoViewIfNeeded();
    // Click on the checkbox inner element which is the visual checkbox
    await this.page.locator('.el-checkbox__inner').first().click();
  }

  /**
   * Generic fillCredentials - determines page context and fills accordingly
   */
  async fillCredentials(email: string, password: string, name?: string) {
    const url = this.page.url();
    const isRegisterPage = url.includes('/register');

    if (isRegisterPage) {
      await this.fillRegisterCredentials(email, password, name);
    } else {
      await this.fillLoginCredentials(email, password);
    }
  }

  /**
   * Click the submit button based on current page
   */
  async submit() {
    const url = this.page.url();
    const isRegisterPage = url.includes('/register');

    if (isRegisterPage) {
      const registerButton = this.page.getByRole('button', { name: '注册' });
      await registerButton.click();
      // Wait for navigation or error
      await this.page.waitForTimeout(1000);
    } else {
      const loginButton = this.page.getByRole('button', { name: '登录' });
      await loginButton.click();
      // Wait for navigation or error
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * Complete login flow
   */
  async login(email: string, password: string) {
    await this.goto('login');

    // Wait for form to be ready
    await this.page.waitForSelector('button:has-text("登录")', { state: 'visible' });

    await this.fillLoginCredentials(email, password);
    await this.submit();
  }

  /**
   * Complete registration flow
   */
  async register(email: string, password: string, name: string = 'Test User') {
    await this.goto('register');

    // Wait for form to be ready
    await this.page.waitForSelector('button:has-text("注册")', { state: 'visible' });

    await this.fillRegisterCredentials(email, password, name);
    await this.submit();
  }

  /**
   * Logout user
   */
  async logout() {
    // Navigate to a page with the user menu (dashboard has the layout with user menu)
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');

    // Click on user avatar to open dropdown menu
    const userAvatar = this.page.locator('.user-avatar-btn, .el-avatar').first();
    await userAvatar.waitFor({ state: 'visible', timeout: 5000 });
    await userAvatar.click();

    // Wait for dropdown menu to appear and click logout option
    const logoutOption = this.page.locator('.el-dropdown-menu__item').filter({ hasText: '退出登录' });
    await logoutOption.waitFor({ state: 'visible' });
    await logoutOption.click();
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      const token = await this.page.evaluate(() => {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem('token');
        }
        return null;
      });
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
      return await this.page.evaluate(() => {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem('token');
        }
        return null;
      });
    } catch {
      return null;
    }
  }
}
