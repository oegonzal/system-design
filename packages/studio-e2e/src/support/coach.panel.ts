import { expect, type Locator, type Page } from '@playwright/test';
import type { ImproveIterationOutcome } from '@sysdesign/contracts';

import { EVAL_TIMEOUT } from './feedback.panel';

/** The dock's Coach tab: starting a run, its iterations as they land, the lessons it was handed, and how it stopped. */
export class CoachPanel {
  constructor(private readonly page: Page) {}

  get tab(): Locator {
    return this.page.getByRole('tab', { name: 'Coach' });
  }

  /**
   * Hand the draft to the coach for up to `iterations` revise rounds. The
   * workspace confirms through a native dialog, accepted here; the control
   * is enabled only once the grader has reported itself available.
   */
  async start(iterations: number): Promise<void> {
    await this.tab.click();
    const run = this.page.getByTestId('improve-run');
    await expect(run).toBeEnabled();
    await this.page.getByTestId('improve-iterations').selectOption(String(iterations));
    this.page.once('dialog', (dialog) => void dialog.accept());
    await run.click();
  }

  iteration(iteration: number): Locator {
    return this.page.getByTestId(`improve-iteration-${iteration}`);
  }

  /** What became of the iteration in the studio — the row's outcome attribute. */
  async expectOutcome(iteration: number, outcome: ImproveIterationOutcome): Promise<void> {
    await expect(this.iteration(iteration)).toHaveAttribute('data-outcome', outcome, {
      timeout: EVAL_TIMEOUT,
    });
  }

  iterationReason(iteration: number): Locator {
    return this.iteration(iteration).getByTestId('improve-iteration-reason');
  }

  /** How many lessons from earlier runs the coach was handed, as the panel says it. */
  get recallSummary(): Locator {
    return this.page.getByTestId('coach-recall-summary');
  }

  /** The recalled lessons, one per row — hidden until `showRecalledLessons`. */
  get recalledLessons(): Locator {
    return this.page.getByTestId('coach-recall-lesson');
  }

  async showRecalledLessons(): Promise<void> {
    const toggle = this.page.getByTestId('coach-recall-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  /** The coach panel's report of a run that failed. */
  get error(): Locator {
    return this.page.getByTestId('improvement-error');
  }

  /** The coach panel's reason for a disabled control. */
  get unavailable(): Locator {
    return this.page.getByTestId('improver-unavailable');
  }

  async expectDisabled(reason: RegExp): Promise<void> {
    await this.tab.click();
    await expect(this.page.getByTestId('improve-run')).toBeDisabled();
    await expect(this.unavailable).toHaveText(reason);
  }

  async expectStopped(): Promise<void> {
    await expect(this.page.getByTestId('improvement-stopped')).toBeVisible({
      timeout: EVAL_TIMEOUT,
    });
  }

  /** Load the best imported iteration from the coach tab; the canvas turns read-only. */
  async loadBestRevision(): Promise<void> {
    await this.tab.click();
    await this.page.getByTestId('load-best-revision').click();
    await expect(this.page.getByTestId('readonly-banner')).toBeVisible();
  }
}
