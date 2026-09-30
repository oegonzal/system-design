import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * The walkthrough is authored as reference-anchored slots — an overview, a
 * rationale per component, a narration per criterion — so the grader reads
 * "this component is explained" and "this requirement is walked" as
 * references rather than guessing which paragraph was about what.
 */
test.describe('the design narrative', () => {
  test('[UX-8] the overview, a component rationale and a criterion narration are submitted with the diagram and come back on reload', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request); // rubric c1…c5
    await buildNaiveDesign(canvas); // client n-1 → service n-2 → database n-3

    const overview =
      'Reads and writes both go through the Service, which owns the order lifecycle; ' +
      'the Database is the single source of truth.';
    const rationale = 'The Database is the system of record for every order and its line items.';
    const narration = 'Client → Service → Database, newest first, with line items joined in.';

    await canvas.setOverview(overview);
    await canvas.explainComponent('n-3', rationale);
    await canvas.narrateCriterion('c1', narration);

    // The editor says which components are still unexplained — the two
    // without a rationale — before the grader would.
    await expect(page.getByTestId('narrative-unexplained')).toContainText('Client');
    await expect(page.getByTestId('narrative-unexplained')).toContainText('Service');
    await expect(page.getByTestId('narrative-unexplained')).not.toContainText('Database');

    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    await page.reload();
    await canvas.ready();
    await canvas.narrativeTab.click();

    await expect(canvas.narrativeOverview).toHaveValue(overview);
    await expect(canvas.componentRationale('n-3')).toHaveValue(rationale);
    await expect(canvas.criterionNarration('c1')).toHaveValue(narration);
    await expect(canvas.componentRationale('n-2')).toHaveValue('');
  });
});
