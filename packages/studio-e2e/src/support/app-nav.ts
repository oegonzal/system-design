import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The application chrome — the primary navigation and the main landmark.
 * Split out from the page objects because every page shares it.
 */
export class AppNav {
  constructor(protected readonly page: Page) {}

  get nav(): Locator {
    return this.page.getByRole('navigation', { name: 'Primary' });
  }

  navLink(label: string): Locator {
    return this.nav.getByRole('link', { name: label });
  }

  get main(): Locator {
    return this.page.getByRole('main');
  }

  async open(path = '/'): Promise<void> {
    await this.page.goto(path);
    await expect(this.main).toBeVisible();
  }

  async gotoPrompts(): Promise<void> {
    await this.navLink('Prompts').click();
    await this.page.waitForURL('**/prompts');
  }

  async gotoStories(): Promise<void> {
    await this.navLink('STAR stories').click();
    await this.page.waitForURL('**/stories');
  }

  async gotoAppearance(): Promise<void> {
    await this.navLink('Appearance').click();
    await this.page.waitForURL('**/settings');
  }

  async expectActiveNav(label: string): Promise<void> {
    await expect(this.navLink(label)).toHaveAttribute('aria-current', 'page');
  }
}
