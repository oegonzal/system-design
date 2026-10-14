import { expect, test } from '@playwright/test';

test('[SITE-3] the skip link moves keyboard focus to the main content', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('[SITE-3] keyboard focus stays visible in forced-colors mode', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');

  // Past the skip link, onto the first link in the page header.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
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
