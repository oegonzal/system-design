import { expect, test } from '@playwright/test';

import { buildNaiveDesign, openPracticeSessionWithPrompt } from '../support/canvas.page';

/**
 * The narrative is graded and required. A design accounted for by a brief but
 * never explained in words raises the "no walkthrough" finding and cannot reach
 * a top grade; authoring a substantive walkthrough clears it.
 *
 * `EVAL_DETERMINISTIC=1` (set by the webServer config) pins grading to the rule
 * engine, so the finding's presence and absence are a pure function of what was
 * submitted — no model in the loop.
 */
test.describe('the graded narrative', () => {
  test('[EVAL-15] a design with no walkthrough is told to explain itself, and authoring one clears it', async ({
    page,
    request,
  }) => {
    const { canvas, prompt } = await openPracticeSessionWithPrompt(page, request);
    await buildNaiveDesign(canvas); // client n-1 → service n-2 → database n-3
    await canvas.addFromPalette('monitoring'); // n-4

    // A brief, so the explanation dimension is assessed — but no narrative yet.
    const requirement = prompt.nonFunctionalRequirements[0];
    await canvas.bindMechanism(requirement.id, 'monitoring');
    await canvas.toggleBindingNode(requirement.id, 'n-4');
    await canvas.traceFlow(0, ['e-1', 'e-2']);

    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    // The design is drawn and accounted for, but never explained: the narrative
    // requirement is unmet, and says so.
    await expect(canvas.findingItem('The design is never explained in words')).toHaveCount(1);

    // Author a substantive walkthrough — the overview alone makes the narrative
    // present, which is what the requirement asks for.
    await canvas.setOverview(
      'Reads and writes both go through the Service, which owns the order lifecycle. ' +
        'Monitoring watches the Service so an outage is seen before a customer reports it.',
    );

    await canvas.submit();
    await canvas.expectEvaluationComplete(2);

    // The walkthrough exists now, so the "never explained" finding is gone.
    await expect(canvas.findingItem('The design is never explained in words')).toHaveCount(0);
    await canvas.expectDimensionScored('explanation');
  });
});
