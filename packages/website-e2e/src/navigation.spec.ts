import { expect, test } from '@playwright/test';

import { focusStops } from './support/focus';
import { builtPages, MISSING } from './support/site';

/** WCAG 2.2 non-text contrast: a focus indicator stands 3:1 apart from the surface it is drawn on. */
const FOCUS_CONTRAST = 3;
/** The outline width the site's focus style declares, and the least a visible focus may have. */
const FOCUS_WIDTH = 2;
/** A ratio of 1: the outline paints exactly what it is drawn over, so nothing shows. */
const UNSEEN = 1;

test('[SITE-3] the skip link moves keyboard focus to the main content', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('[SITE-3] every primary navigation link is at least a 24 px target', async ({ page }) => {
  await page.goto('/');
  const links = await page.getByRole('navigation', { name: 'Primary' }).getByRole('link').all();

  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const box = await link.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
  }
});

for (const path of [...builtPages(), MISSING]) {
  test(`[SITE-3] every keyboard stop on ${path} shows its focus, 3:1 against its surface`, async ({
    page,
  }) => {
    await page.goto(path);
    const stops = await focusStops(page);

    expect(stops.length).toBeGreaterThan(0);
    expect(
      stops.filter(
        ({ outlineStyle, outlineWidth, contrast }) =>
          outlineStyle === 'none' || outlineWidth < FOCUS_WIDTH || contrast < FOCUS_CONTRAST,
      ),
    ).toEqual([]);
  });

  test(`[SITE-3] every keyboard stop on ${path} keeps its outline in forced-colors mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(path);
    const stops = await focusStops(page);

    expect(stops.length).toBeGreaterThan(0);
    // Forced colours repaint the outline in a system colour of the user's choosing, so
    // no contrast is required of it — only that it shows, at the site's width.
    expect(
      stops.filter(
        ({ outlineStyle, outlineWidth, contrast }) =>
          outlineStyle === 'none' || outlineWidth < FOCUS_WIDTH || contrast <= UNSEEN,
      ),
    ).toEqual([]);
  });
}
