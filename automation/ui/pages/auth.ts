import { expect, type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';

/** /register — AuthCard "Create your account". Labels are not htmlFor-associated → use placeholders/roles. */
export class RegisterPage extends BasePage {
  readonly email = this.page.getByPlaceholder('you@example.com');
  readonly password = this.page.getByPlaceholder('8+ characters');
  readonly submit = this.page.getByRole('button', { name: /create account/i });
  readonly error = this.page.getByRole('alert');

  async open(): Promise<void> {
    await this.goto('/register');
    await this.email.waitFor();
    await this.waitHydrated();
  }

  roleButton(role: 'Trader' | 'Subscriber'): Locator {
    return this.page.getByRole('button', { name: role, exact: true });
  }

  // Trader-only, appears after selecting Trader. autocomplete=organization is the stable hook (no label assoc).
  readonly businessName = this.page.locator('input[autocomplete="organization"]');

  async register(u: {
    email: string;
    password: string;
    role: 'trader' | 'subscriber';
    business_name?: string;
  }): Promise<void> {
    // Fill email+password as one unit and re-fill if hydration wipes them, so both hold at submit time.
    await expect(async () => {
      await this.email.fill(u.email);
      await this.password.fill(u.password);
      await expect(this.email).toHaveValue(u.email, { timeout: 250 });
      await expect(this.password).toHaveValue(u.password, { timeout: 250 });
    }).toPass({ timeout: 8000 });
    await this.roleButton(u.role === 'trader' ? 'Trader' : 'Subscriber').click();
    if (u.role === 'trader') await this.fillStable(this.businessName, u.business_name || 'QA Trading Co');
    await this.submit.click();
  }
}

/** /login — AuthCard "Welcome back". */
export class LoginPage extends BasePage {
  readonly emailInput = this.page.getByPlaceholder('you@example.com');
  readonly password = this.page.getByPlaceholder('••••••••');
  readonly submit = this.page.getByRole('button', { name: 'Sign in', exact: true });
  readonly error = this.page.getByRole('alert');
  readonly forgot = this.page.getByRole('link', { name: /forgot password/i });

  async open(): Promise<void> {
    await this.goto('/login');
    await this.emailInput.waitFor();
    await this.waitHydrated();
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillStable(this.emailInput, email);
    await this.fillStable(this.password, password);
    await this.submit.click();
  }
}

/** /forgot-password — "Reset password". */
export class ForgotPasswordPage extends BasePage {
  readonly email = this.page.getByPlaceholder('you@example.com');
  readonly submit = this.page.getByRole('button', { name: /send reset link/i });

  async open(): Promise<void> {
    await this.goto('/forgot-password');
    await this.email.waitFor();
    await this.waitHydrated();
  }

  async request(email: string): Promise<void> {
    await this.fillStable(this.email, email);
    await this.submit.click();
  }
}

/** /reset-password?token= — "Set a new password". */
export class ResetPasswordPage extends BasePage {
  readonly newPassword = this.page.getByPlaceholder('••••••••').first();
  readonly confirm = this.page.getByPlaceholder('••••••••').nth(1);
  readonly submit = this.page.getByRole('button', { name: /reset password/i });
  readonly error = this.page.getByRole('alert');

  async open(token: string): Promise<void> {
    await this.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await this.newPassword.waitFor();
    await this.waitHydrated();
  }

  async reset(newPassword: string): Promise<void> {
    await this.fillStable(this.newPassword, newPassword);
    await this.fillStable(this.confirm, newPassword);
    await this.submit.click();
  }
}

/** /verify-email?token= — confirmation page. */
export class VerifyEmailPage extends BasePage {
  async open(token: string): Promise<void> {
    await this.goto(`/verify-email?token=${encodeURIComponent(token)}`);
  }

  // Success/failure both render text; the spec asserts on the visible outcome.
  success(): Locator {
    return this.page.getByText(/verified|confirmed|success/i);
  }
  failure(): Locator {
    return this.page.getByText(/invalid|expired|could not/i);
  }
}
