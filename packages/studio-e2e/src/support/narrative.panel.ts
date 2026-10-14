import type { Locator, Page } from '@playwright/test';

/** The dock's Narrative tab: the overview, a rationale per component, a narration per criterion. */
export class NarrativePanel {
  constructor(private readonly page: Page) {}

  get tab(): Locator {
    return this.page.getByRole('tab', { name: 'Narrative' });
  }

  get overview(): Locator {
    return this.page.getByTestId('narrative-overview');
  }

  rationale(nodeId: string): Locator {
    return this.page.getByTestId(`narrative-rationale-${nodeId}`);
  }

  narration(criterionId: string): Locator {
    return this.page.getByTestId(`narrative-narration-${criterionId}`);
  }

  /** The big-picture overview slot. No submit — the narrative rides the next revision. */
  async setOverview(text: string): Promise<void> {
    await this.tab.click();
    await this.overview.fill(text);
  }

  /** One component's rationale, keyed to its node id. */
  async explainComponent(nodeId: string, prose: string): Promise<void> {
    await this.tab.click();
    await this.rationale(nodeId).fill(prose);
  }

  /** One criterion's narration, keyed to its id. */
  async narrateCriterion(criterionId: string, prose: string): Promise<void> {
    await this.tab.click();
    await this.narration(criterionId).fill(prose);
  }
}
