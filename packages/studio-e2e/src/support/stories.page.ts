import { expect, type Locator, type Page } from '@playwright/test';

export interface StoryDraft {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags?: string;
}

/** The STAR stories list (`/stories`), the editor, and the detail page. */
export class StoriesPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/stories');
    await expect(this.searchField).toBeVisible();
  }

  get searchField(): Locator {
    return this.page.getByTestId('story-search');
  }

  get tagField(): Locator {
    return this.page.getByTestId('story-tag-filter');
  }

  get list(): Locator {
    return this.page.getByTestId('story-list');
  }

  storyCard(title: string): Locator {
    return this.list.locator('li').filter({ hasText: title });
  }

  get form(): Locator {
    return this.page.getByTestId('story-form');
  }

  async openNewStoryForm(): Promise<void> {
    await this.page.getByTestId('new-story').click();
    await this.page.waitForURL('**/stories/new');
    await expect(this.form).toBeVisible();
  }

  async fillStory(draft: StoryDraft): Promise<void> {
    await this.form.getByLabel('Title').fill(draft.title);
    await this.form.getByLabel('Situation').fill(draft.situation);
    await this.form.getByLabel('Task', { exact: true }).fill(draft.task);
    await this.form.getByLabel('Action').fill(draft.action);
    await this.form.getByLabel('Result').fill(draft.result);
    if (draft.tags !== undefined) {
      await this.form.getByLabel('Tags (comma separated)').fill(draft.tags);
    }
  }

  /** By role: a select wrapped in its label defeats exact label-text matching. */
  get linkedPromptSelect(): Locator {
    return this.form.getByRole('combobox', { name: 'Linked prompt (optional)' });
  }

  get linkedExperienceSelect(): Locator {
    return this.form.getByRole('combobox', { name: 'Linked experience (optional)' });
  }

  async save(): Promise<void> {
    await this.page.getByTestId('save-story').click();
  }

  /** Create lands on the story's detail route. */
  async saveNewStory(): Promise<void> {
    await this.save();
    await this.page.waitForURL(/\/stories\/[0-9a-f-]{36}$/);
  }

  async search(text: string): Promise<void> {
    await this.searchField.fill(text);
  }

  async filterByTag(tag: string): Promise<void> {
    await this.tagField.fill(tag);
  }

  async expectStoryListed(title: string): Promise<void> {
    await expect(this.storyCard(title)).toBeVisible();
  }

  async openStory(title: string): Promise<void> {
    await this.storyCard(title).getByRole('link').click();
    await this.page.waitForURL(/\/stories\/[0-9a-f-]{36}$/);
  }

  /** Deleting confirms through a native dialog; accept it before clicking. */
  async deleteFromDetail(): Promise<void> {
    this.page.once('dialog', (dialog) => void dialog.accept());
    await this.page.getByTestId('delete-story').click();
    await this.page.waitForURL(/\/stories$/);
  }
}
