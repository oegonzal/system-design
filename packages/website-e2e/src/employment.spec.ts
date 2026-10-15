import { expect, test } from '@playwright/test';

import { FOUNDER } from '../../website/src/data/founder';
import { formatMonths, formatYears } from '../../website/src/lib/dates';

const EMPLOYERS = FOUNDER.experience.map(({ employer }) => employer);

/** Every page that lists the founder's prior employment, and how its entries state their dates. */
const LISTS = [
  { path: '/about/', dates: formatMonths },
  { path: '/government/', dates: formatYears },
] as const;

for (const { path, dates } of LISTS) {
  test(`[SITE-8] ${path} lists each prior employer as its own entry with its dates, under the note that it is the founder's employment`, async ({
    page,
  }) => {
    await page.goto(path);
    const list = page.locator('[data-employment-list]');
    const entries = list.locator('[data-employment]');

    await expect(list.locator('[data-employment-note]')).toHaveText(FOUNDER.experienceNote);
    await expect(entries).toHaveCount(FOUNDER.experience.length);
    // In the declared order, each entry naming its own employer and no other, with its dates.
    for (const [index, { employer, period }] of FOUNDER.experience.entries()) {
      const entry = entries.nth(index);
      await expect(entry.locator('[data-employer]')).toHaveText([employer]);
      await expect(entry.locator('[data-employment-dates]')).toHaveText([dates(period)]);
      for (const other of EMPLOYERS.filter((name) => name !== employer)) {
        await expect(entry).not.toContainText(other);
      }
    }
  });
}
