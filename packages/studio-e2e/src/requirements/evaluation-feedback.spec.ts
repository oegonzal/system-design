import { expect, test } from '@playwright/test';
import { describeUnassessedBase } from '@sysdesign/contracts';

import { authorPrompt } from '../support/backend';
import {
  buildNaiveDesign,
  CanvasPage,
  NAIVE_DESIGN_SCORE,
  openPracticeSession,
} from '../support/canvas.page';
import { keyedPrompt, scenarioFor } from '../support/grader';
import { PromptsPage } from '../support/prompts.page';

/**
 * Submit → graded verdict, through the real API against the stub grader,
 * whose grade is a pure function of the graph: three nodes score 64 with a
 * `revise`, `c1` passes and the rest are partial, the database draws an
 * unhandled-failure finding and the first connection an unbacked claim.
 */
test.describe('the grading feedback', () => {
  test('[EVAL-1] a submitted revision shows the overall score, the decision, one meter per dimension and a result per criterion', async ({
    page,
    request,
  }) => {
    // Start practice the way a person does: from the prompt's detail page.
    const prompt = await authorPrompt(request);
    const prompts = new PromptsPage(page);
    await prompts.openDetail(prompt.id);
    await prompts.startPractice();

    const canvas = new CanvasPage(page);
    await canvas.ready();
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.feedback.expectComplete(1);

    await canvas.feedback.expectOverall(NAIVE_DESIGN_SCORE);
    await canvas.feedback.expectDecision('revise');
    // One judgement ends on its one iteration: that is a grade finishing,
    // not a stop worth telling, so nothing stands beside the decision.
    await expect(page.getByTestId('stop-reason')).toHaveCount(0);

    // One meter per dimension the pipeline declared, none "not assessed".
    for (const dimension of ['coverage', 'quality_attributes', 'compliance']) {
      await canvas.feedback.expectDimensionScored(dimension);
    }
    await expect(canvas.feedback.dimensionMeter('coverage')).toHaveAttribute(
      'aria-valuenow',
      String(NAIVE_DESIGN_SCORE),
    );
    await expect(canvas.feedback.dimensionMeter('compliance')).toHaveAttribute(
      'aria-valuenow',
      '100',
    );

    // A row per criterion of the prompt's rubric, reading as a statement.
    await canvas.feedback.expectCriterionResult('c1', 'pass');
    for (const criterionId of ['c2', 'c3', 'c4', 'c5']) {
      await canvas.feedback.expectCriterionResult(criterionId, 'partial');
    }
    await expect(canvas.feedback.criterionResult('c1')).toContainText('past orders newest first');
  });

  test('[EVAL-2] a finding names its places by label, carries its rationale, and highlights the node or edge it names when selected; the verdict carries its reason', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.feedback.expectComplete(1);

    // The controller's own sentence, under the score.
    await expect(canvas.feedback.decisionReason).toHaveText(
      `stub: 3 nodes → ${NAIVE_DESIGN_SCORE}`,
    );

    // Grouped by severity, in urgency order.
    await expect(page.getByTestId('findings-group-high')).toBeVisible();
    await expect(page.getByTestId('findings-group-medium')).toBeVisible();

    // Every place a finding names is labelled from the graded revision — the
    // author's id, the kind, the label — with the loop's own ref as its title.
    const failureLocations = canvas.feedback.findingLocations('unhandled_failure|node.3');
    await expect(failureLocations).toHaveText(['n-3 · database · Database']);
    await expect(failureLocations.first()).toHaveAttribute('title', 'node.3');
    await expect(canvas.feedback.findingLocations('unbacked_claim|edge.1')).toHaveText([
      'e-1 · n-1 → n-2 (sync)',
    ]);

    // The lens's own words, the criterion it cites, and every lens that
    // confirmed it — in words, the lens id kept as the chip's title; the type
    // is the finding's title, never a wire token.
    const failure = canvas.feedback.finding('unhandled_failure|node.3');
    await expect(failure).toBeVisible();
    await expect(failure).toContainText('a restart drops the target');
    await expect(failure.getByTestId('finding-criterion')).toHaveText('c2');
    await expect(failure.getByTestId('finding-lens')).toHaveText([
      'critic architecture',
      'critic scenarios',
    ]);
    await expect(failure.getByTestId('finding-lens').first()).toHaveAttribute(
      'title',
      'critic.architecture',
    );
    await expect(failure.getByTestId('finding-select-unhandled_failure|node.3')).toHaveText(
      'Unhandled failure',
    );
    await expect(failure).not.toContainText('unhandled_failure');

    // `node.3` resolved by position to the author's own id: the database.
    await canvas.feedback.clickFinding('unhandled_failure|node.3');
    await canvas.expectNodeHighlighted('n-3', 'high');
    await expect(canvas.node('n-2')).not.toHaveAttribute('data-severity', /.+/);

    // `edge.1` likewise: the client → service connection.
    await canvas.feedback.clickFinding('unbacked_claim|edge.1');
    await canvas.expectEdgeHighlighted('e-1', 'medium');
    await expect(
      canvas.feedback.finding('unbacked_claim|edge.1').getByTestId('finding-explanation'),
    ).toBeVisible();
  });

  test('[EVAL-1] [UX-17] a run that fails is reported with its error, and grading it again re-grades the same revision in place', async ({
    page,
    request,
  }) => {
    // The stub fails exactly this test's first run: the scenario is keyed by
    // the prompt's markdown, unique to the test through its title.
    const prompt = await keyedPrompt(request, 'grade fails');
    await scenarioFor(request, prompt.markdown, {
      outcome: 'fail',
      message: 'the model went away',
      once: true,
    });

    const { canvas } = await openPracticeSession(page, request, prompt);
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.feedback.expectFailed(1, 'the model went away');

    // The way back is the same revision, graded again where it stands: a
    // fresh run of the stored design, and no second copy of it in the timeline.
    await canvas.feedback.retry();
    await canvas.feedback.expectComplete(1);
    await canvas.feedback.expectOverall(NAIVE_DESIGN_SCORE);

    await canvas.revisions.tab.click();
    await expect(canvas.revisions.chip(1).getByTestId('revision-score')).toHaveText(
      String(NAIVE_DESIGN_SCORE),
    );
    await expect(canvas.revisions.chip(1)).not.toContainText('failed');
    await expect(canvas.revisions.chip(2)).toHaveCount(0);
  });

  test('[UX-18] a grade the lenses could not settle is no verdict — no score, no escalation — the coach refuses it, and grading it again in place gives one', async ({
    page,
    request,
  }) => {
    // The loop's evidence gate escalates with nothing assessed, as during a
    // provider outage: the controller still prices the empty ledger at 0.
    const prompt = await keyedPrompt(request, 'grade unassessed');
    await scenarioFor(request, prompt.markdown, {
      outcome: 'complete',
      once: true,
      iterations: [
        {
          overall: 0,
          decision: 'escalate',
          evidenceSufficient: false,
          reason: 'only 0% of criteria assessed; unassessed: c1, c2, c3, c4, c5',
          criteria: ['c1', 'c2', 'c3', 'c4', 'c5'].map((criterionId) => ({
            criterionId,
            kind: 'functional',
            result: 'unassessed',
            hits: 0,
            confidence: null,
            locationRefs: [],
          })),
        },
      ],
    });

    const { canvas } = await openPracticeSession(page, request, prompt);
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.feedback.expectUnscored(1);
    await expect(canvas.feedback.unscored).toContainText('This revision couldn’t be graded');
    await expect(canvas.feedback.unscored).toContainText('The lenses assessed 0 of 5 criteria');
    await expect(canvas.feedback.criterionResult('c1')).toHaveAttribute(
      'data-result',
      'unassessed',
    );

    await canvas.revisions.tab.click();
    await expect(canvas.revisions.chip(1)).toContainText('not assessed');
    await expect(canvas.revisions.chip(1)).not.toContainText('escalate');
    await expect(canvas.revisions.chip(1).getByTestId('revision-score')).toHaveCount(0);

    // No grade for the coach to measure its revisions against.
    await canvas.coach.tab.click();
    await expect(page.getByTestId('improve-run')).toBeDisabled();
    await expect(canvas.coach.unavailable).toHaveText(describeUnassessedBase(1));

    // The way back is the same one a failed grade has: the revision, graded again in place.
    await canvas.feedback.retry();
    await canvas.feedback.expectComplete(1);
    await canvas.feedback.expectOverall(NAIVE_DESIGN_SCORE);
    await canvas.revisions.tab.click();
    await expect(canvas.revisions.chip(1).getByTestId('revision-score')).toHaveText(
      String(NAIVE_DESIGN_SCORE),
    );
    await expect(canvas.revisions.chip(2)).toHaveCount(0);
  });
});
