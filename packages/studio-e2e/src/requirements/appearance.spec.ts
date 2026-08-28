import { test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import { SettingsPage } from '../support/settings.page';

/**
 * Untagged, deliberately: appearance is not one of the completion criteria,
 * and the criteria coverage check rejects ids outside the registry.
 *
 * Settings live in the browser's localStorage, so every test context starts
 * from the defaults and nothing here can bleed into parallel files.
 */
test.describe('appearance', () => {
  test('applies color mode and accent to <html> and both survive a reload', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.open();

    await settings.expectColorMode('light');
    await settings.expectAccent('blueprint');

    await settings.setColorMode('dark');
    await settings.setAccent('teal');
    await settings.expectColorMode('dark');
    await settings.expectAccent('teal');

    await page.reload();
    await settings.expectColorMode('dark');
    await settings.expectAccent('teal');
  });

  test('the theme follows onto other pages, and the nav marks the current one', async ({
    page,
  }) => {
    const settings = new SettingsPage(page);
    const nav = new AppNav(page);

    await settings.open();
    await nav.expectActiveNav('Appearance');

    await settings.setColorMode('dark');
    await nav.gotoStories();
    await nav.expectActiveNav('STAR stories');
    await settings.expectColorMode('dark');
  });
});
