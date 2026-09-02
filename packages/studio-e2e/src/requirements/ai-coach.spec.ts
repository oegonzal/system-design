import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * The AI coach. The suite runs deterministic (EVAL_DETERMINISTIC=1, no
 * IMPROVER_DETERMINISTIC override), so the coach is disabled by design here —
 * the deterministic half of [UX-11] pins the honest-refusal UX, which is the
 * part that must hold in every environment. The full improvement journey is
 * the `@live` half below: it runs only where a developer has enabled the live
 * coach (ANTHROPIC_API_KEY + IMPROVER_DETERMINISTIC=0) and self-skips
 * everywhere else. The loop's substance — monotonic acceptance, assistant
 * revisions, trajectory/evaluation parity — is pinned keylessly by the worker
 * integration spec [EVAL-14].
 */
test.describe('the AI coach', () => {
  test('[UX-11] explains itself when no live model is available, and streams a live run when one is', async ({
    page,
    request,
  }) => {
    const availability = await (
      await request.get('http://localhost:3000/api/improvement-runs/availability')
    ).json();

    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    const improveButton = page.getByTestId('improve-run');
    await expect(improveButton).toBeVisible();

    if (!availability.data.enabled) {
      // Deterministic environments (CI, the default e2e stack): the control is
      // disabled with a reason, and the coach tab says why — never a dead click.
      await expect(improveButton).toBeDisabled();
      await page.getByRole('tab', { name: 'Coach' }).click();
      await expect(page.getByTestId('improver-unavailable')).toBeVisible();
      return;
    }

    // @live half — a real model is configured; drive the full journey.
    test.setTimeout(15 * 60_000);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    page.on('dialog', (dialog) => void dialog.accept());
    await improveButton.click();

    // The coach tab streams the trajectory: the baseline appears first, and
    // the run ends with a stop reason.
    await expect(page.getByTestId('improvement-panel')).toBeVisible();
    await expect(page.getByTestId('improve-iteration-0')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('improvement-stopped')).toBeVisible({ timeout: 12 * 60_000 });

    // At least one accepted improvement became an AI-badged revision, and the
    // timeline's scores rise strictly.
    await page.getByRole('tab', { name: 'Revisions' }).click();
    await expect(page.getByTestId('revision-timeline').getByText('AI').first()).toBeVisible();
    await canvas.expectScoreTrendIncreasing();

    // The improved design loads back onto the canvas.
    await page.getByRole('tab', { name: 'Coach' }).click();
    await page.getByTestId('load-best-revision').click();
    await expect(page.getByTestId('readonly-banner')).toBeVisible();
  });
});
