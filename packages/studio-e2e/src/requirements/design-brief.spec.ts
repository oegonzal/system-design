import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * The design brief is the graded explanation: requirement bindings and traced
 * flows, each one a reference the engine checks against the canvas. The prose
 * walkthrough survives beside it, persisted and read by the LLM critic, and is
 * deliberately not scored — substring probes over it used to BE the grade.
 *
 * `EVAL_DETERMINISTIC=1` (set by the webServer config) pins grading to the
 * rule engine, so every verdict here is a pure function of graph + brief.
 */
test.describe('the design brief', () => {
  test('the walkthrough is submitted with the diagram and survives a reload', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    const walkthrough =
      'The Client calls the Service, which writes every order to the Database before acknowledging.';
    await canvas.fillNarrative(walkthrough);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    await page.reload();
    await canvas.ready();
    await canvas.narrativeTab.click();
    await expect(canvas.narrativeEditor).toHaveValue(walkthrough);
  });

  test('the walkthrough says plainly that it is not what earns the grade', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await canvas.narrativeTab.click();

    await expect(page.getByTestId('narrative-advisory')).toContainText(/not scored by the engine/i);
  });

  /**
   * Pending the brief editor. The engine side is covered by
   * `banks/brief.spec.ts` and `calibration.spec.ts`; this asserts the authoring
   * round trip, which needs the UI that lands in the next commit.
   */
  test.fixme('[UX-6] a design brief is authored beside the diagram and submitted with it', async ({
    page,
    request,
  }) => {
    await openPracticeSession(page, request);
  });
});
