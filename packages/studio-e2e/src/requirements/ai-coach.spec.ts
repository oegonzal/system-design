import { expect, test } from '@playwright/test';

import { coachingRuns, listRevisions } from '../support/backend';
import {
  buildNaiveDesign,
  NAIVE_DESIGN_PLUS_ONE_SCORE,
  NAIVE_DESIGN_SCORE,
  openPracticeSession,
} from '../support/canvas.page';
import { graderRequests, keyedPrompt, scenarioFor } from '../support/grader';

/** Five boxes: the stub accepts. */
const ACCEPTED_SCORE = 80;

/**
 * The AI coach is a revise run of the grader. From the draft, the draft is
 * submitted as the author's own revision first; from a graded revision, the
 * loop adopts that grade as its starting point and nothing is graded twice.
 * Every iteration that beat the ones before it lands in the timeline as an
 * assistant revision; each row says what became of it and why the loop
 * decided so. Under the stub the coach's one idea is a read replica hung off
 * the last component — eight points better, then a repeat that is not.
 */
test.describe('the AI coach', () => {
  test('[UX-11] the coach revises the draft, its better iteration lands in the timeline as an AI revision, the run survives a reload, and the revision loads back read-only', async ({
    page,
    request,
  }) => {
    const { canvas, sessionId } = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    await canvas.startCoach(2);
    await expect(page.getByTestId('improvement-panel')).toBeVisible();

    // The trajectory: the author's draft as the starting point, then the
    // coach's revision — each with the controller's reason.
    await canvas.expectCoachStopped();
    await canvas.expectCoachOutcome(1, 'base');
    await expect(canvas.coachIteration(1)).toContainText(String(NAIVE_DESIGN_SCORE));
    await expect(canvas.coachIteration(1)).toContainText('starting point');
    await expect(canvas.coachIterationReason(1)).toContainText('3 nodes');
    await canvas.expectCoachOutcome(2, 'imported');
    await expect(canvas.coachIteration(2)).toContainText(String(NAIVE_DESIGN_PLUS_ONE_SCORE));
    await expect(page.getByTestId('improvement-stopped')).toContainText('iteration budget');

    // The run is recorded on the session: a reload finds it and shows the same rows.
    expect(await coachingRuns(request, sessionId)).toHaveLength(1);
    await page.reload();
    await canvas.ready();
    await canvas.coachTab.click();
    await canvas.expectCoachOutcome(2, 'imported');
    await expect(page.getByTestId('improvement-stopped')).toBeVisible();

    // The imported iteration is revision #2, badged as the coach's, and the
    // timeline's scores rise strictly.
    await canvas.expectAssistantRevisionInTimeline(2);
    await expect(canvas.revisionChip(1).getByText('AI', { exact: true })).toHaveCount(0);
    await canvas.expectScoreTrendIncreasing();

    // The improved design loads back onto the canvas read-only — Submit and
    // the editors locked — with the coach's replica drawn under its own `ai-` id.
    await canvas.loadBestRevision();
    await expect(canvas.node('ai-replica')).toHaveAttribute('data-kind', 'replica');
    await canvas.expectNodeCount(4);
    await expect(canvas.readOnlyBanner).toContainText('revision #2');
    await canvas.expectSubmitDisabled();
    await canvas.narrativeTab.click();
    await expect(canvas.narrativeOverview).toBeDisabled();
    await canvas.briefTab.click();
    await expect(canvas.bindingClaim('c1')).toBeDisabled();

    // Restored as a draft, the same design is the author's to edit and submit again.
    await canvas.restoreAsDraft();
    await expect(page.getByTestId('submit-revision')).toBeEnabled();
    await expect(canvas.narrativeOverview).toBeEnabled();
  });

  test('[DEL-3] coaching a graded revision adopts its grade as the starting point: no second grade, no duplicate revision, one new AI revision', async ({
    page,
    request,
  }) => {
    const { canvas, sessionId } = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);
    await canvas.startCoach(2);
    await canvas.expectCoachStopped();
    await canvas.expectCoachOutcome(2, 'imported');
    const [firstRun] = await coachingRuns(request, sessionId);

    // The coach's revision on screen, unedited and graded: the coach starts from it as it is.
    await canvas.loadBestRevision();
    await canvas.startCoach(2);
    await canvas.expectCoachStopped();

    // The stub records every run of every test; this session's newest is the one to read.
    const [secondRun] = await coachingRuns(request, sessionId);
    const { startRequests } = await graderRequests(request);
    const adopting = startRequests.find((started) => started.runId === secondRun.runId);
    expect(adopting?.adopt).toEqual({ runId: firstRun.runId, iteration: 2 });

    await canvas.expectCoachOutcome(1, 'base');
    await expect(canvas.coachIteration(1)).toContainText(String(NAIVE_DESIGN_PLUS_ONE_SCORE));
    await expect(canvas.coachIteration(1).getByTestId('improve-iteration-adopted')).toHaveText(
      'grade reused',
    );
    await canvas.expectCoachOutcome(2, 'imported');
    await expect(canvas.coachIteration(2)).toContainText(String(ACCEPTED_SCORE));
    await expect(page.getByTestId('improvement-stopped')).toContainText('accepts');

    // Two runs on the session, the newer based on revision #2; three
    // revisions in all — the adopted one was not stored again.
    await canvas.expectAssistantRevisionInTimeline(3);
    const revisions = await listRevisions(request, sessionId);
    expect(revisions.map((revision) => [revision.revisionNumber, revision.origin])).toEqual([
      [3, 'assistant'],
      [2, 'assistant'],
      [1, 'user'],
    ]);
    const runs = await coachingRuns(request, sessionId);
    expect(runs.map((run) => run.runId)).toEqual([secondRun.runId, firstRun.runId]);
    expect(secondRun.baseRevisionId).toBe(
      revisions.find((revision) => revision.revisionNumber === 2)?.id,
    );
  });

  test('[UX-11] a coaching run that fails is reported failed, imports nothing, and its base revision shows failed', async ({
    page,
    request,
  }) => {
    // The stub fails exactly this test's run: the scenario is keyed by the
    // prompt's markdown, unique to the test through its title.
    const prompt = await keyedPrompt(request, 'coach fails');
    await scenarioFor(request, prompt.markdown, {
      outcome: 'fail',
      message: 'the model went away',
      once: true,
    });
    const { canvas, sessionId } = await openPracticeSession(page, request, prompt);
    await buildNaiveDesign(canvas);

    await canvas.startCoach(2);
    await expect(canvas.coachError).toContainText('the model went away', { timeout: 30_000 });
    await expect(canvas.coachIteration(1)).toHaveCount(0);

    await expect
      .poll(async () => (await listRevisions(request, sessionId)).map((r) => r.evaluation?.status))
      .toEqual(['failed']);
    expect(await coachingRuns(request, sessionId)).toHaveLength(1);
    await canvas.revisionsTab.click();
    await expect(canvas.revisionChip(1)).toContainText('failed');
  });
});
