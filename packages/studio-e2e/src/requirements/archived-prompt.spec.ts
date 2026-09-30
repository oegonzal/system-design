import { expect, test } from '@playwright/test';

import { archivePrompt, listRevisions, reactivatePrompt } from '../support/backend';
import { buildNaiveDesign, openPracticeSession } from '../support/canvas.page';

/**
 * A prompt can be archived under a session. The session still opens — the
 * work is the author's — but the studio refuses new grading on it (422),
 * and the workspace says so before the click: Submit and the coach are off
 * with the reason, and the prompt tab badges the prompt. Reactivating the
 * prompt brings both back.
 */
test.describe('an archived prompt', () => {
  test('[UX-14] the session still opens, Submit and the coach are off with the reason, and reactivating brings them back', async ({
    page,
    request,
  }) => {
    const { canvas, prompt, sessionId } = await openPracticeSession(page, request);
    await archivePrompt(request, prompt.id);
    await page.reload();
    await canvas.ready();

    await canvas.promptTab.click();
    await expect(canvas.promptArchivedBadge).toHaveText('archived');
    await buildNaiveDesign(canvas);
    await canvas.expectSubmitDisabled();
    await canvas.expectCoachDisabled(/archived/);
    expect(await listRevisions(request, sessionId)).toEqual([]);
    // Editing stays free: the sketch is saved as the session's draft meanwhile.
    await canvas.expectDraftStatus('saved');

    await reactivatePrompt(request, prompt.id);
    await page.reload();
    await canvas.ready();
    await expect(canvas.promptArchivedBadge).toHaveCount(0);
    // The sketch came back as the session's draft; it grades like any other.
    await canvas.expectNodeCount(3);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);
    await canvas.coachTab.click();
    await expect(page.getByTestId('improve-run')).toBeEnabled();
  });
});
