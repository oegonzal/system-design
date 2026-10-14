import { expect, type Locator, type Page } from '@playwright/test';
import type { CriterionResult, Decision } from '@sysdesign/contracts';

/**
 * Submit → grade is normally under three seconds (the stub grader completes
 * a run in 400 ms and the UI polls every 1.2 s), but a cold Next.js dev
 * server or a busy parallel run deserves headroom.
 */
export const EVAL_TIMEOUT = 30_000;

/**
 * The toolbar's badge for the author's latest submission (`submitted #n ·
 * graded`): which revision, and where its grade stands. Addressed by the
 * revision it names, so a spec waits for *that* submission's badge — and by
 * its status as data, never by the words.
 */
export function submissionStatus(page: Page, revisionNumber: number): Locator {
  return page.locator(`[data-testid="submission-status"][data-revision="${revisionNumber}"]`);
}

/** The dock's Feedback tab: the grade of the revision it follows — score, decision, dimensions, criteria and findings — or why there is none. */
export class FeedbackPanel {
  constructor(private readonly page: Page) {}

  get tab(): Locator {
    return this.page.getByRole('tab', { name: 'Feedback' });
  }

  /**
   * Waits until the given revision is graded and its score summary is on
   * screen. The toolbar badge (`submitted #n · graded`) is the authoritative
   * signal that *this* revision finished — the score summary alone could
   * still be showing the previous one during a resubmit.
   */
  async expectComplete(revisionNumber: number): Promise<void> {
    await expect(submissionStatus(this.page, revisionNumber)).toHaveAttribute(
      'data-status',
      'complete',
      {
        timeout: EVAL_TIMEOUT,
      },
    );
    await this.tab.click();
    await expect(this.page.getByTestId('score-summary')).toBeVisible({ timeout: EVAL_TIMEOUT });
  }

  /**
   * The toolbar's badge for a run that failed, plus the feedback dock's
   * explanation — the author's sentence, with the run's own error folded
   * under it — and its grade-again control. The badge is the authoritative
   * signal that *this* revision failed.
   */
  async expectFailed(revisionNumber: number, message: string): Promise<void> {
    await expect(submissionStatus(this.page, revisionNumber)).toHaveAttribute(
      'data-status',
      'failed',
      {
        timeout: EVAL_TIMEOUT,
      },
    );
    await this.tab.click();
    await expect(this.page.getByTestId('evaluation-error')).toContainText(message, {
      timeout: EVAL_TIMEOUT,
    });
  }

  /**
   * The toolbar's badge for a grade that earned no score — "not assessed" —
   * and the feedback dock's word on it in place of a score: never a 0, never
   * a decision that would read as a verdict.
   */
  async expectUnscored(revisionNumber: number): Promise<void> {
    await expect(submissionStatus(this.page, revisionNumber)).toHaveAttribute(
      'data-status',
      'unscored',
      {
        timeout: EVAL_TIMEOUT,
      },
    );
    await this.tab.click();
    await expect(this.unscored).toBeVisible({ timeout: EVAL_TIMEOUT });
    await expect(this.page.getByTestId('overall-score')).toHaveCount(0);
    await expect(this.page.getByTestId('decision-badge')).toHaveCount(0);
  }

  /** The feedback dock's way back from a failed grade: the same revision, graded again in place. */
  async retry(): Promise<void> {
    await this.tab.click();
    await this.page.getByTestId('retry-evaluation').click();
  }

  /** Whose feedback the tab shows: the revision by number, badged when the coach wrote it. */
  get subject(): Locator {
    return this.page.getByTestId('feedback-subject');
  }

  /** The feedback tab's line for a canvas that has moved on to the draft; absent while it shows the revision. */
  get offCanvas(): Locator {
    return this.page.getByTestId('feedback-off-canvas');
  }

  async expectOverall(score: number): Promise<void> {
    await expect(this.page.getByTestId('overall-score')).toHaveText(String(score));
  }

  async expectDecision(decision: Decision): Promise<void> {
    await expect(this.page.getByTestId('decision-badge')).toHaveText(decision);
  }

  /** The meter for one of the pipeline's own dimensions, by its wire key. */
  dimensionMeter(dimension: string): Locator {
    return this.page.locator(`[data-dimension="${dimension}"]`).getByRole('meter');
  }

  /**
   * A dimension the loop actually assessed. `not-assessed-<dimension>` is
   * rendered in place of the meter when the score is null, so its absence
   * beside a visible meter is the assertion.
   */
  async expectDimensionScored(dimension: string): Promise<void> {
    await expect(this.dimensionMeter(dimension)).toBeVisible();
    await expect(this.page.getByTestId(`not-assessed-${dimension}`)).toHaveCount(0);
  }

  criterionResult(criterionId: string): Locator {
    return this.page.getByTestId(`criterion-result-${criterionId}`);
  }

  async expectCriterionResult(criterionId: string, result: CriterionResult): Promise<void> {
    await expect(this.criterionResult(criterionId)).toHaveAttribute('data-result', result);
  }

  /**
   * A grade that earned no score, said in place of the score: why, and the
   * way to grade the revision again.
   */
  get unscored(): Locator {
    return this.page.getByTestId('evaluation-unscored');
  }

  /** Why the decision was made, under the score, in the reader's words. */
  get decisionReason(): Locator {
    return this.page.getByTestId('decision-reason');
  }

  /** A finding by the loop's structural key — `unhandled_failure|node.3`. */
  finding(id: string): Locator {
    return this.page.getByTestId(`finding-${id}`);
  }

  /** The places a finding names, each labelled from the graded revision (`n-3 · database · Database`). */
  findingLocations(id: string): Locator {
    return this.finding(id).getByTestId('finding-location');
  }

  /** Clicking a finding's title highlights the elements it names on the canvas. */
  async clickFinding(id: string): Promise<void> {
    await this.tab.click();
    await this.page.getByTestId(`finding-select-${id}`).click();
  }
}
