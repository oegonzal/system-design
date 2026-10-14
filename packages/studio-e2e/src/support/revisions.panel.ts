import { expect, type Locator, type Page } from '@playwright/test';

import { EVAL_TIMEOUT } from './feedback.panel';

/** The dock's Revisions tab: the timeline of submissions, the coach's marked as its own. */
export class RevisionsPanel {
  constructor(private readonly page: Page) {}

  get tab(): Locator {
    return this.page.getByRole('tab', { name: 'Revisions' });
  }

  chip(revisionNumber: number): Locator {
    return this.page.getByTestId(`revision-chip-${revisionNumber}`);
  }

  /** A revision the coach wrote carries an explicit AI badge in the timeline. */
  async expectAssistantRevision(revisionNumber: number): Promise<void> {
    await this.tab.click();
    await expect(this.chip(revisionNumber).getByText('AI', { exact: true })).toBeVisible({
      timeout: EVAL_TIMEOUT,
    });
  }

  /**
   * Reads every revision chip in the timeline and demands strictly rising
   * overall scores in submission order. Polls, because the timeline refreshes
   * its grades asynchronously after an evaluation completes.
   */
  async expectScoreTrendIncreasing(): Promise<void> {
    await this.tab.click();
    await expect
      .poll(
        async () => {
          const chips = await this.page.locator('[data-testid^="revision-chip-"]').all();
          if (chips.length < 2) return `only ${chips.length} revision(s) in the timeline`;

          const scored: Array<{ revision: number; score: number }> = [];
          for (const chip of chips) {
            const testId = (await chip.getAttribute('data-testid')) ?? '';
            const revision = Number(testId.replace('revision-chip-', ''));
            // The score carries its own testid — the chip may also hold an AI
            // origin badge, so "the only span" is not safe to assume.
            const scoreSpan = chip.locator('[data-testid="revision-score"]');
            if ((await scoreSpan.count()) === 0) return `revision #${revision} is not graded yet`;
            scored.push({ revision, score: Number(await scoreSpan.first().textContent()) });
          }

          scored.sort((a, b) => a.revision - b.revision);
          const rising = scored.every(
            (entry, index) => index === 0 || entry.score > scored[index - 1].score,
          );
          const trail = scored.map((entry) => `#${entry.revision}:${entry.score}`).join(' → ');
          return rising ? 'strictly increasing' : `not increasing: ${trail}`;
        },
        { timeout: EVAL_TIMEOUT },
      )
      .toBe('strictly increasing');
  }
}
