import { expect, type Locator, type Page } from '@playwright/test';
import type { PromptSource } from '@sysdesign/contracts';

import { TICKETING_COMPANY } from './backend';

/**
 * The prompts browser (`/prompts`), the composer under it (`/prompts/new`)
 * and the prompt detail page. Every selector is one of the UI's own test
 * ids; the criteria assertions read the chips the pane renders per kind.
 */
export class PromptsPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/prompts');
    await expect(this.experienceSelect).toBeVisible();
  }

  // --- the browser ---------------------------------------------------------

  get experienceSelect(): Locator {
    return this.page.getByTestId('experience-select');
  }

  get sourceSelect(): Locator {
    return this.page.getByTestId('source-select');
  }

  get generateButton(): Locator {
    return this.page.getByTestId('generate-prompt');
  }

  get generationProgress(): Locator {
    return this.page.getByTestId('prompt-generation-progress');
  }

  get promptList(): Locator {
    return this.page.getByTestId('prompt-list');
  }

  /** One card per prompt; a card shows its title and a source badge. */
  get promptCards(): Locator {
    return this.promptList.locator('> li');
  }

  /** Options load async; `selectOption` retries until the label appears. */
  async selectTicketingExperience(): Promise<void> {
    await this.experienceSelect.selectOption({
      label: `${TICKETING_COMPANY} — Re-architected ticketing services for flash on-sales`,
    });
  }

  async filterBySource(source: PromptSource | ''): Promise<void> {
    await this.sourceSelect.selectOption(source);
  }

  /**
   * Generate is a background run: the click shows progress at once, and the
   * browser lands on the new prompt's detail route once the draft is claimed.
   */
  async generate(): Promise<void> {
    await this.generateButton.click();
    await expect(this.generationProgress).toBeVisible();
    await this.page.waitForURL(/\/prompts\/[0-9a-f-]{36}$/);
  }

  promptIdFromUrl(): string {
    const match = /\/prompts\/([0-9a-f-]{36})$/.exec(this.page.url());
    if (!match) throw new Error(`not on a prompt detail page: ${this.page.url()}`);
    return match[1];
  }

  // --- the composer --------------------------------------------------------

  async openComposer(): Promise<void> {
    await this.page.getByTestId('compose-prompt').click();
    await this.page.waitForURL('**/prompts/new');
    await expect(this.page.getByTestId('compose-title')).toBeVisible();
  }

  /** Write the markdown by hand; saving lands on the new prompt's detail route. */
  async author(document: { title: string; markdown: string }): Promise<void> {
    await this.page.getByRole('tab', { name: 'Write' }).click();
    await this.page.getByTestId('compose-title').fill(document.title);
    await this.page.getByTestId('compose-markdown').fill(document.markdown);
    await this.page.getByTestId('compose-submit').click();
    await this.page.waitForURL(/\/prompts\/[0-9a-f-]{36}$/);
  }

  /** Pick a library document, wait for its preview, import it. */
  async importFromLibrary(libraryId: string): Promise<void> {
    await this.page.getByRole('tab', { name: 'Import from the library' }).click();
    await this.page.getByTestId(`library-entry-${libraryId}`).click();
    await expect(this.page.getByTestId('library-preview')).toBeVisible();
    await this.page.getByTestId('import-submit').click();
    await this.page.waitForURL(/\/prompts\/[0-9a-f-]{36}$/);
  }

  // --- the detail page -----------------------------------------------------

  get promptPane(): Locator {
    return this.page.getByTestId('prompt-pane');
  }

  get markdownPane(): Locator {
    return this.page.getByTestId('prompt-markdown');
  }

  /** A heading of the rendered markdown: the document's `#` is an h3 under the pane's title, its `##` an h4. */
  markdownHeading(name: string, level: 3 | 4 | 5 | 6 = 4): Locator {
    return this.markdownPane.getByRole('heading', { level, name, exact: true });
  }

  get rederiveButton(): Locator {
    return this.page.getByTestId('rederive-criteria');
  }

  async openDetail(promptId: string): Promise<void> {
    await this.page.goto(`/prompts/${promptId}`);
    await expect(this.promptPane).toBeVisible();
  }

  async expectSource(source: PromptSource): Promise<void> {
    await expect(this.page.getByTestId('prompt-source')).toHaveText(source);
  }

  criterionChip(criterionId: string): Locator {
    return this.page.getByTestId(`criterion-${criterionId}`);
  }

  criteriaGroup(kind: string): Locator {
    return this.page.getByTestId(`criteria-group-${kind}`);
  }

  /** Exactly these criteria, each rendered as a chip — no more, no fewer. */
  async expectCriteriaChips(criterionIds: readonly string[]): Promise<void> {
    for (const criterionId of criterionIds) {
      await expect(this.criterionChip(criterionId)).toBeVisible();
    }
    await expect(this.page.getByTestId('criterion-chip')).toHaveCount(criterionIds.length);
  }

  /** Every kind is its own group, and every chip sits in the group of its kind. */
  async expectCriteriaGrouped(byKind: Readonly<Record<string, readonly string[]>>): Promise<void> {
    for (const [kind, criterionIds] of Object.entries(byKind)) {
      const group = this.criteriaGroup(kind);
      await expect(group).toBeVisible();
      for (const criterionId of criterionIds) {
        await expect(group.getByTestId(`criterion-${criterionId}`)).toBeVisible();
      }
      await expect(group.getByTestId('criterion-chip')).toHaveCount(criterionIds.length);
    }
  }

  /** Ask the grader for the rubric again, and wait for it to answer. */
  async rederiveCriteria(): Promise<void> {
    const answered = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/prompts\/[^/]+\/criteria$/.test(response.url()),
    );
    await this.page.getByTestId('rederive-criteria').click();
    expect((await answered).status()).toBe(200);
    await expect(this.page.getByTestId('rederive-criteria')).toBeEnabled();
  }

  /** Start practice waits out the redirect into the workspace. */
  async startPractice(): Promise<void> {
    await this.page.getByTestId('start-practice').click();
    await this.page.waitForURL(/\/practice\/[0-9a-f-]{36}$/);
  }
}
