import { expect, type Locator, type Page } from '@playwright/test';

import { TICKETING_COMPANY } from './backend';

/** The prompts browser (`/prompts`) and the prompt detail page under it. */
export class PromptsPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/prompts');
    await expect(this.experienceSelect).toBeVisible();
  }

  get experienceSelect(): Locator {
    return this.page.getByTestId('experience-select');
  }

  get generateButton(): Locator {
    return this.page.getByTestId('generate-prompt');
  }

  get promptPane(): Locator {
    return this.page.getByTestId('prompt-pane');
  }

  /** Options load async; `selectOption` retries until the label appears. */
  async selectTicketingExperience(): Promise<void> {
    await this.experienceSelect.selectOption({
      label: `${TICKETING_COMPANY} — Re-architected ticketing services for flash on-sales`,
    });
  }

  /** Generate lands on the new prompt's detail route. */
  async generate(): Promise<void> {
    await this.generateButton.click();
    await this.page.waitForURL(/\/prompts\/[0-9a-f-]{36}$/);
  }

  promptIdFromUrl(): string {
    const match = /\/prompts\/([0-9a-f-]{36})$/.exec(this.page.url());
    if (!match) throw new Error(`not on a prompt detail page: ${this.page.url()}`);
    return match[1];
  }

  async openDetail(promptId: string): Promise<void> {
    await this.page.goto(`/prompts/${promptId}`);
    await expect(this.promptPane).toBeVisible();
  }

  /** Start practice waits out the redirect into the workspace. */
  async startPractice(): Promise<void> {
    await this.page.getByTestId('start-practice').click();
    await this.page.waitForURL(/\/practice\/[0-9a-f-]{36}$/);
  }
}
