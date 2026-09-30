import { expect, test } from '@playwright/test';

import {
  buildNaiveDesign,
  NAIVE_DESIGN_PLUS_ONE_SCORE,
  NAIVE_DESIGN_SCORE,
  openPracticeSession,
} from '../support/canvas.page';

/**
 * The AI coach is a revise run of the grader: the draft is submitted as the
 * author's own revision first, then the loop revises it, and every iteration
 * that beat the ones before it lands in the timeline as an assistant
 * revision. Under the stub the coach's one idea is a read replica hung off
 * the last component — eight points better, then a repeat that is not.
 */
test.describe('the AI coach', () => {
  test('[UX-11] the coach revises the draft, its better iteration lands in the timeline as an AI revision, and loads back read-only', async ({
    page,
    request,
  }) => {
    const { canvas } = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    await canvas.startCoach(2);
    await expect(page.getByTestId('improvement-panel')).toBeVisible();

    // The trajectory: the author's draft, then the coach's revision.
    await canvas.expectCoachStopped();
    await expect(canvas.coachIteration(1)).toContainText(String(NAIVE_DESIGN_SCORE));
    await expect(canvas.coachIteration(1)).toContainText('your draft');
    await expect(canvas.coachIteration(2)).toContainText(String(NAIVE_DESIGN_PLUS_ONE_SCORE));
    await expect(canvas.coachIteration(2)).toContainText('imported');
    await expect(page.getByTestId('improvement-stopped')).toContainText('iteration budget');

    // The imported iteration is revision #2, badged as the coach's, and the
    // timeline's scores rise strictly.
    await canvas.expectAssistantRevisionInTimeline(2);
    await expect(canvas.revisionChip(1).getByText('AI', { exact: true })).toHaveCount(0);
    await canvas.expectScoreTrendIncreasing();

    // The improved design loads back onto the canvas, read-only, with the
    // coach's replica drawn under its own `ai-` id.
    await canvas.loadBestRevision();
    await expect(canvas.node('ai-replica')).toHaveAttribute('data-kind', 'replica');
    await canvas.expectNodeCount(4);
    await expect(page.getByTestId('readonly-banner')).toContainText('revision #2');
  });
});
