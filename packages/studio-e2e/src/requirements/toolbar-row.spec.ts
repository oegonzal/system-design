import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * The width a laptop gives the workspace: the palette and the dock take
 * theirs, and the canvas column has about 690 px for the toolbar. Its six
 * actions and the draft badge's slot must share that one row, whatever the
 * draft and the submission are doing — the session's own status sits beside
 * the title, not among the canvas's controls.
 */
test.use({ viewport: { width: 1401, height: 900 } });

/**
 * How many rows a toolbar's children lay out on, read from the layout: a
 * child shares a row with any child whose vertical extent overlaps its own
 * — a short badge centred beside tall buttons is on their row, not under it.
 */
const rowsOf = (toolbar: import('@playwright/test').Locator) =>
  toolbar.evaluate((bar) => {
    const rows: { top: number; bottom: number }[] = [];
    for (const child of bar.children) {
      const box = child.getBoundingClientRect();
      const row = rows.find(
        (candidate) => box.top < candidate.bottom && box.bottom > candidate.top,
      );
      if (row) {
        row.top = Math.min(row.top, box.top);
        row.bottom = Math.max(row.bottom, box.bottom);
      } else {
        rows.push({ top: box.top, bottom: box.bottom });
      }
    }
    return rows.length;
  });

test.describe('the canvas toolbar at a laptop width', () => {
  test('[UX-16] keeps its actions and the draft badge on one row through a submit and an edit, and names the submission beside the title', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);
    const toolbar = page.getByRole('toolbar', { name: 'Canvas actions' });
    expect(await rowsOf(toolbar)).toBe(1);

    await buildNaiveDesign(canvas);
    await canvas.expectDraftStatus('saved');
    expect(await rowsOf(toolbar)).toBe(1);

    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    await canvas.addFromPalette('cache');
    await canvas.expectDraftStatus('saved');
    expect(await rowsOf(toolbar)).toBe(1);

    // The submission badge is the session's: on the title's row, not the toolbar's.
    await expect(toolbar.getByTestId('submission-status')).toHaveCount(0);
    const title = await page.getByRole('heading', { level: 1 }).boundingBox();
    const badge = await canvas.submissionStatus(1).boundingBox();
    expect(title).not.toBeNull();
    expect(badge).not.toBeNull();
    const titleMiddle = (title?.y ?? NaN) + (title?.height ?? NaN) / 2;
    const badgeMiddle = (badge?.y ?? NaN) + (badge?.height ?? NaN) / 2;
    expect(Math.abs(badgeMiddle - titleMiddle)).toBeLessThan(title?.height ?? 0);
  });
});
