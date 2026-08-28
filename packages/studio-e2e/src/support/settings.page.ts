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

    // The attribute alone once passed while the page rendered light-mode ink
    // on a dark background (stale SSR-streamed globals outliving a theme
    // switch), so also assert the *computed* body colors landed on the right
    // side of the brightness line: dark text on light, light text on dark.
    await expect
      .poll(async () => {
        const [textLuma, bgLuma] = (await this.page.evaluate(`(() => {
          const luma = (rgb) => {
            const [r, g, b] = rgb.match(/\\d+/g).map(Number);
            return (r * 299 + g * 587 + b * 114) / 1000;
          };
          const styles = getComputedStyle(document.body);
          return [luma(styles.color), luma(styles.backgroundColor)];
        })()`)) as [number, number];
        return mode === 'dark' ? textLuma > bgLuma : textLuma < bgLuma;
      })
      .toBe(true);
  }

  async expectAccent(accent: Accent): Promise<void> {
    await expect(this.page.locator('html')).toHaveAttribute('data-accent', accent);
  }
}
