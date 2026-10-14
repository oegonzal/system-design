import type { Locator, Page } from '@playwright/test';

/** The dock's Prompt tab: the prompt the session practises, and its badge once archived. */
export class PromptPanel {
  constructor(private readonly page: Page) {}

  get tab(): Locator {
    return this.page.getByRole('tab', { name: 'Prompt' });
  }

  /** The prompt pane's badge for a prompt that was archived under the session. */
  get archivedBadge(): Locator {
    return this.page.getByTestId('prompt-archived');
  }
}
