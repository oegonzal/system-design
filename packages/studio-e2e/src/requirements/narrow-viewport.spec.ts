import { expect, test, type Locator, type Page } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * Under the dock's breakpoint the workspace is one column: palette, canvas
 * and dock stack, and nothing forces the page to scroll sideways. Runs only
 * in the `narrow` project (700 × 900).
 */
const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth;
  });

/** Where an element was laid out, or a failure that says it never was. */
const laidOut = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('the workspace did not lay out');
  return box;
};

test.describe('the workspace at a narrow width', () => {
  test('[UX-15] stacks into one column, and the feedback — criterion rows, findings, the prompt — fits the width', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);
    const dock = page.getByRole('complementary', { name: 'Session details' });
    const toolbar = page.getByTestId('submit-revision');
    const [toolbarBox, dockBox] = await Promise.all([laidOut(toolbar), laidOut(dock)]);
    expect(dockBox.y).toBeGreaterThan(toolbarBox.y);
    expect(dockBox.width).toBeLessThanOrEqual(700);
    expect(await noSidewaysScroll(page)).toBe(true);

    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.feedback.expectComplete(1);

    const results = page.getByTestId('criterion-results');
    await expect(results).toBeVisible();
    for (const criterionId of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      const box = await canvas.feedback.criterionResult(criterionId).boundingBox();
      expect(box?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(dockBox.width);
    }
    await expect(page.getByTestId('findings-list')).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);

    await canvas.prompt.tab.click();
    await expect(page.getByTestId('prompt-markdown')).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});
