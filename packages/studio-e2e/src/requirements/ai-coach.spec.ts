import { expect, test } from '@playwright/test';
import { BINDING_CLAIM_BOUND } from '@sysdesign/contracts';
import { FAKE_RECALLED_LESSONS } from '@sysdesign/studio-testing';

import { coachingRuns, getSession, listRevisions } from '../support/backend';
import {
  buildNaiveDesign,
  NAIVE_DESIGN_PLUS_ONE_SCORE,
  NAIVE_DESIGN_SCORE,
  openPracticeSession,
} from '../support/canvas.page';
import { goalOf, graderRequests, keyedPrompt, scenarioFor } from '../support/grader';

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

    await canvas.coach.start(2);
    await expect(page.getByTestId('improvement-panel')).toBeVisible();

    // The trajectory: the author's draft as the starting point, then the
    // coach's revision — each with the controller's reason.
    await canvas.coach.expectStopped();
    await canvas.coach.expectOutcome(1, 'base');
    await expect(canvas.coach.iteration(1)).toContainText(String(NAIVE_DESIGN_SCORE));
    await expect(canvas.coach.iteration(1)).toContainText('starting point');
    await expect(canvas.coach.iterationReason(1)).toContainText('3 nodes');
    await canvas.coach.expectOutcome(2, 'imported');
    await expect(canvas.coach.iteration(2)).toContainText(String(NAIVE_DESIGN_PLUS_ONE_SCORE));
    await expect(page.getByTestId('improvement-stopped')).toContainText('iteration budget');

    // The run is recorded on the session: a reload finds it and shows the same rows.
    expect(await coachingRuns(request, sessionId)).toHaveLength(1);
    await page.reload();
    await canvas.ready();
    await canvas.coach.tab.click();
    await canvas.coach.expectOutcome(2, 'imported');
    await expect(page.getByTestId('improvement-stopped')).toBeVisible();

    // The imported iteration is revision #2, badged as the coach's, and the
    // timeline's scores rise strictly.
    await canvas.revisions.expectAssistantRevision(2);
    await expect(canvas.revisions.chip(1).getByText('AI', { exact: true })).toHaveCount(0);
    await canvas.revisions.expectScoreTrendIncreasing();

    // The improved design loads back onto the canvas read-only — Submit and
    // the editors locked — with the coach's replica drawn under its own `ai-` id.
    await canvas.coach.loadBestRevision();
    await expect(canvas.node('ai-replica')).toHaveAttribute('data-kind', 'replica');
    await canvas.expectNodeCount(4);
    await expect(canvas.readOnlyBanner).toContainText('revision #2');
    await canvas.expectSubmitDisabled();
    // Three places, each naming its subject: the canvas and the feedback are
    // on the coach's revision, the toolbar still reports the author's own.
    await expect(canvas.feedback.subject).toContainText('revision #2');
    await expect(canvas.feedback.offCanvas).toHaveCount(0);
    await expect(canvas.submissionStatus(1)).toHaveAttribute('data-status', 'complete');
    await canvas.revisions.tab.click();
    await expect(canvas.revisions.chip(2)).toHaveAttribute('aria-current', 'true');
    await expect(canvas.revisions.chip(1)).not.toHaveAttribute('aria-current');
    await canvas.narrative.tab.click();
    await expect(canvas.narrative.overview).toBeDisabled();
    await canvas.brief.tab.click();
    await expect(canvas.brief.claim('c1')).toBeDisabled();

    // Restored as a draft, the same design is the author's to edit and submit
    // again — and the canvas no longer shows a revision: no chip is current,
    // and the feedback says it is about #2, not about what is drawn now.
    await canvas.restoreAsDraft();
    await expect(page.getByTestId('submit-revision')).toBeEnabled();
    await canvas.narrative.tab.click();
    await expect(canvas.narrative.overview).toBeEnabled();
    await canvas.revisions.tab.click();
    await expect(canvas.revisions.chip(2)).not.toHaveAttribute('aria-current');
    await expect(canvas.revisions.chip(2)).toContainText('feedback shown');
    await canvas.feedback.tab.click();
    await expect(canvas.feedback.offCanvas).toBeVisible();
  });

  test('[DEL-3] coaching a graded revision adopts its grade as the starting point: no second grade, no duplicate revision, one new AI revision', async ({
    page,
    request,
  }) => {
    const { canvas, sessionId } = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);
    await canvas.coach.start(2);
    await canvas.coach.expectStopped();
    await canvas.coach.expectOutcome(2, 'imported');
    const [firstRun] = await coachingRuns(request, sessionId);

    // The coach's revision on screen, unedited and graded: the coach starts from it as it is.
    await canvas.coach.loadBestRevision();
    await canvas.coach.start(2);
    // The first run's stopped line stays on screen until the second run is
    // recorded, so wait for the session to list it before reading either.
    await expect.poll(async () => (await coachingRuns(request, sessionId)).length).toBe(2);
    await canvas.coach.expectStopped();

    // The stub records every run of every test; this session's newest is the one to read.
    const [secondRun] = await coachingRuns(request, sessionId);
    const { startRequests } = await graderRequests(request);
    const adopting = startRequests.find((started) => started.runId === secondRun.runId);
    expect(adopting?.adopt).toEqual({ runId: firstRun.runId, iteration: 2 });

    await canvas.coach.expectOutcome(1, 'base');
    await expect(canvas.coach.iteration(1)).toContainText(String(NAIVE_DESIGN_PLUS_ONE_SCORE));
    await expect(canvas.coach.iteration(1).getByTestId('improve-iteration-adopted')).toHaveText(
      'grade reused',
    );
    await canvas.coach.expectOutcome(2, 'imported');
    await expect(canvas.coach.iteration(2)).toContainText(String(ACCEPTED_SCORE));
    await expect(page.getByTestId('improvement-stopped')).toContainText('accepts');

    // Two runs on the session, the newer based on revision #2; three
    // revisions in all — the adopted one was not stored again.
    await canvas.revisions.expectAssistantRevision(3);
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

  test('[QL-32] the coach is handed lessons from earlier runs and the panel lists them; a submit never asks for any', async ({
    page,
    request,
  }) => {
    const { canvas, sessionId } = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.feedback.expectComplete(1);

    await canvas.coach.start(2);
    await canvas.coach.expectStopped();
    await expect(canvas.coach.recallSummary).toHaveText(
      `Recalled ${FAKE_RECALLED_LESSONS.length} lessons from earlier runs for the coach`,
    );
    await expect(canvas.coach.recalledLessons.first()).toBeHidden();
    await canvas.coach.showRecalledLessons();
    await expect(canvas.coach.recalledLessons).toHaveCount(FAKE_RECALLED_LESSONS.length);
    for (const [index, lesson] of FAKE_RECALLED_LESSONS.entries()) {
      await expect(canvas.coach.recalledLessons.nth(index)).toContainText(lesson.insight);
      await expect(canvas.coach.recalledLessons.nth(index)).toContainText(lesson.serves);
    }

    // What the studio asked the grader: the coach run recalls, the author's grade does not.
    const [coachRun] = await coachingRuns(request, sessionId);
    const graded = (await listRevisions(request, sessionId)).find(
      (revision) => revision.revisionNumber === 1,
    );
    const { startRequests } = await graderRequests(request);
    const asked = (runId: string | null | undefined) =>
      startRequests.find((started) => started.runId === runId)?.recall;
    expect(asked(coachRun.runId)).toBe(true);
    expect(asked(graded?.evaluation?.runId)).toBe(false);
  });

  test('[UX-20] [UX-22] a coach revision that wrote past what was asked imports whole, says how far over on each field, and re-saves as the draft as written', async ({
    page,
    request,
  }) => {
    // A claim 58 characters past `BINDING_CLAIM_BOUND.target` — the measured
    // overrun's margin — and one past its ceiling, what a submit accepts,
    // short of the three targets past which the loop would cut it: the
    // coach's words, scripted for this test's run.
    const { target, ceiling } = BINDING_CLAIM_BOUND;
    const prose = (length: number) =>
      'the replica absorbs every repeat read of the order history '.repeat(20).slice(0, length);
    const overAsk = prose(target + 58);
    const pastCeiling = 45;
    const overCeiling = prose(ceiling + pastCeiling);
    const prompt = await keyedPrompt(request, 'coach writes long');
    await scenarioFor(request, goalOf(prompt), {
      outcome: 'complete',
      coach: { claims: { c1: overAsk, c2: overCeiling } },
      once: true,
    });
    const { canvas, sessionId } = await openPracticeSession(page, request, prompt);
    await buildNaiveDesign(canvas);

    await canvas.coach.start(2);
    await canvas.coach.expectStopped();
    await canvas.coach.expectOutcome(2, 'imported');

    // On the coach's revision every word is there, and each field says where it stands.
    await canvas.coach.loadBestRevision();
    await canvas.brief.tab.click();
    await expect(canvas.brief.claim('c1')).toHaveValue(overAsk);
    await expect(canvas.brief.row('c1')).toContainText(
      `58 over the ${target} asked — ${ceiling} at most`,
    );
    await expect(canvas.brief.claim('c2')).toHaveValue(overCeiling);
    await expect(canvas.brief.row('c2')).toContainText(
      `${pastCeiling} characters past the ${ceiling} accepted — shorten it to submit.`,
    );

    // Restored as the draft, it saves as written and comes back whole after a reload.
    await canvas.restoreAsDraft();
    await canvas.expectDraftStatus('saved');
    const claims = async () =>
      (await getSession(request, sessionId)).draft?.brief?.bindings.map((binding) => binding.claim);
    expect(await claims()).toEqual([overAsk, overCeiling]);
    await page.reload();
    await canvas.ready();
    await canvas.brief.tab.click();
    await expect(canvas.brief.claim('c1')).toHaveValue(overAsk);
    await expect(canvas.brief.claim('c2')).toHaveValue(overCeiling);
  });

  test('[UX-11] a coaching run that fails is reported failed, imports nothing, and its base revision shows failed', async ({
    page,
    request,
  }) => {
    // The stub fails exactly this test's run: the scenario is keyed by the
    // prompt's goal as the studio composes it, unique to the test through its title.
    const prompt = await keyedPrompt(request, 'coach fails');
    await scenarioFor(request, goalOf(prompt), {
      outcome: 'fail',
      message: 'the model went away',
      once: true,
    });
    const { canvas, sessionId } = await openPracticeSession(page, request, prompt);
    await buildNaiveDesign(canvas);

    await canvas.coach.start(2);
    await expect(canvas.coach.error).toContainText('the model went away', { timeout: 30_000 });
    await expect(canvas.coach.iteration(1)).toHaveCount(0);

    await expect
      .poll(async () => (await listRevisions(request, sessionId)).map((r) => r.evaluation?.status))
      .toEqual(['failed']);
    expect(await coachingRuns(request, sessionId)).toHaveLength(1);
    await canvas.revisions.tab.click();
    await expect(canvas.revisions.chip(1)).toContainText('failed');
  });
});
