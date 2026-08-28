import { expect, type Page } from '@playwright/test';
import type { Accent, ColorMode } from '@sysdesign/contracts';

/**
 * The appearance page (`/settings`). Assertions read the `data-color-mode` /
 * `data-accent` attributes stamped on `<html>` — the stable contract between
 * the appearance provider and the theme — never Emotion class names, which
 * change on any style edit.
 */
export class SettingsPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/settings');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Appearance' })).toBeVisible();
  }

  async setColorMode(mode: ColorMode): Promise<void> {
    await this.page.getByTestId(`color-mode-${mode}`).click();
  }

  async setAccent(accent: Accent): Promise<void> {
    await this.page.getByTestId(`accent-${accent}`).click();
  }

  async expectColorMode(mode: ColorMode): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('data-color-mode', mode);
  }

  async expectAccent(accent: Accent): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('data-accent', accent);
  }
}
