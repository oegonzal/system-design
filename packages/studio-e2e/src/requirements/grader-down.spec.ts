import { expect, test } from '@playwright/test';

import { API_URL, createPracticeSession, listRevisions } from '../support/backend';
import { buildNaiveDesign, CanvasPage } from '../support/canvas.page';
import { setGraderUnreachable } from '../support/grader';

/**
 * The grader is a service the studio reaches over one port, and it can be
 * down. The studio must say so before a person draws for nothing: the coach
 * explains why it is disabled, a submit reports the outage instead of
 * pretending, and nothing is written that a person would then see as a
 * revision waiting on a grade that will never come.
 *
 * Runs only in the `grader-down` Playwright project: the health switch is
 * global to the stub, and this project runs alone after every browser
 * project has finished (see playwright.config.ts).
 */
test.describe.configure({ mode: 'serial' });

test.describe('the grader, unreachable', () => {
  test.afterEach(async ({ request }) => {
    await setGraderUnreachable(request, false);
  });

  test('[DEL-6] with the grader unreachable the coach is disabled with the reason, a submit reports the outage and writes no revision, and both recover when it returns', async ({
    page,
    request,
  }) => {
    // Arrange while the grader is still up: authoring a prompt derives its rubric there.
    const { session } = await createPracticeSession(request);
    await setGraderUnreachable(request, true);
    expect((await request.get(`${API_URL}/grading/availability`)).status()).toBe(503);

    await page.goto(`/practice/${session.id}`);
    const canvas = new CanvasPage(page);
    await canvas.ready();
    await canvas.expectCoachDisabled(/cannot reach/);

    await buildNaiveDesign(canvas);
    await canvas.submit();
    await expect(canvas.submitError).toContainText('unreachable');
    await expect(page.getByText('rev #1')).toHaveCount(0);
    expect(await listRevisions(request, session.id)).toEqual([]);

    // Back up: the same page, reloaded, offers the coach and grades the sketch.
    await setGraderUnreachable(request, false);
    await page.reload();
    await canvas.ready();
    await canvas.coachTab.click();
    await expect(page.getByTestId('improve-run')).toBeEnabled();
    await expect(canvas.coachUnavailable).toHaveCount(0);

    await buildNaiveDesign(canvas);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    expect(await listRevisions(request, session.id)).toHaveLength(1);
  });
});
