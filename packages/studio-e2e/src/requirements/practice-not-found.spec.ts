import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';

/**
 * A practice URL can outlive its session — a link bookmarked, shared, or
 * minted against a database that has since been reset. Opening one must be a
 * calm dead end with a way back, not a raw "Session <id> not found".
 */
test.describe('practice session not found', () => {
  test('[UX-12] a missing practice session shows a graceful not-found with a way back', async ({
    page,
  }) => {
    // A well-formed but non-existent session id → the API 404s, and the page
    // must render the graceful notice rather than the raw server message.
    const bogus = '11111111-1111-4111-8111-111111111111';
    await page.goto(`/practice/${bogus}`);

    await expect(page.getByRole('heading', { name: 'Practice session not found' })).toBeVisible();
    await expect(page.getByText(`Session ${bogus} not found`)).toHaveCount(0);
    // The tab names the dead end as the page does, never the route's generic "Practice".
    await expect(page).toHaveTitle('Practice session not found · System Design Studio');

    const back = page.getByTestId('notice-back');
    await expect(back).toBeVisible();
    await back.click();

    // Landed on the dashboard.
    await page.waitForURL(/\/$|\/\?/);
    await new AppNav(page).expectActiveNav('Dashboard');
  });
});
