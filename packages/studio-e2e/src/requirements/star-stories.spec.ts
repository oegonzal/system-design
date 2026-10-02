import { expect, test } from '@playwright/test';

import { authorPrompt, createStory, ticketingExperience } from '../support/backend';
import { StoriesPage } from '../support/stories.page';
import { uniqueName } from '../support/unique';

/** A complete STAR body; titles and tags stay per-test unique. */
const STORY_BODY = {
  situation: 'Flash on-sale traffic was toppling the checkout path every launch morning.',
  task: 'I owned the order-write path and had to keep it alive through the spike.',
  action: 'Queued writes behind the gateway, added a read replica, load-tested to 3x peak.',
  result: 'The next on-sale absorbed 40k concurrent buyers with zero dropped orders.',
};

test.describe('STAR story repository', () => {
  test('[STAR-1] creates, edits and deletes a story', async ({ page }) => {
    const stories = new StoriesPage(page);
    const title = uniqueName('Checkout meltdown');
    const renamed = uniqueName('Checkout comeback');

    await stories.open();
    await stories.openNewStoryForm();
    await stories.fillStory({ title, ...STORY_BODY, tags: 'incident, caching' });
    await stories.saveNewStory();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    // Edit in place; the reload proves persistence rather than local state.
    await stories.form.getByLabel('Title').fill(renamed);
    await stories.save();
    await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
    await page.reload();
    await expect(stories.form.getByLabel('Title')).toHaveValue(renamed);

    await stories.deleteFromDetail();
    await stories.search(renamed);
    await expect(stories.storyCard(renamed)).toHaveCount(0);
  });

  test('[STAR-2] stories are searchable and filterable by tag', async ({ page, request }) => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
    const alphaTitle = uniqueName('Alpha outage story');
    const betaTitle = uniqueName('Beta migration story');
    const alphaTag = `alpha-${stamp}`;
    const betaTag = `beta-${stamp}`;
    await createStory(request, { title: alphaTitle, ...STORY_BODY, tags: [alphaTag] });
    await createStory(request, { title: betaTitle, ...STORY_BODY, tags: [betaTag] });

    const stories = new StoriesPage(page);
    await stories.open();

    await stories.search(alphaTitle);
    await stories.expectStoryListed(alphaTitle);
    await expect(stories.storyCard(betaTitle)).toHaveCount(0);

    await stories.search('');
    await stories.filterByTag(betaTag);
    await stories.expectStoryListed(betaTitle);
    await expect(stories.storyCard(alphaTitle)).toHaveCount(0);
  });

  test('[UX-13] a story opened at its own address names the tab after itself', async ({
    page,
    request,
  }) => {
    const title = uniqueName('Titled story');
    const story = await createStory(request, { title, ...STORY_BODY, tags: [] });

    await page.goto(`/stories/${story.id}`);

    await expect(page).toHaveTitle(`${title} · System Design Studio`);
  });

  test('[STAR-1] a save from the keyboard keeps the author’s place: the focus stays on Save', async ({
    page,
    request,
  }) => {
    const title = uniqueName('Keyboard-saved story');
    const story = await createStory(request, { title, ...STORY_BODY, tags: [] });
    const stories = new StoriesPage(page);
    await page.goto(`/stories/${story.id}`);

    await stories.form.getByLabel('Result').fill(`${STORY_BODY.result} Twice over.`);
    const save = page.getByTestId('save-story');
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('story-saved')).toBeVisible();
    // The browser moves the focus off a control that is disabled or removed;
    // a busy Save is neither, so the next Tab goes on from where the author was.
    await expect(save).toBeFocused();
  });

  test('[STAR-3] a story links to a prompt and an experience', async ({ page, request }) => {
    const prompt = await authorPrompt(request, { title: uniqueName('Linked prompt') });
    const experience = await ticketingExperience(request);
    const title = uniqueName('Linked story');

    const stories = new StoriesPage(page);
    await stories.open();
    await stories.openNewStoryForm();
    await stories.fillStory({ title, ...STORY_BODY });

    // The link options are offered by human-readable name, not opaque id.
    await expect(stories.linkedPromptSelect.locator(`option[value="${prompt.id}"]`)).toHaveText(
      prompt.title,
    );

    await stories.linkedPromptSelect.selectOption(prompt.id);
    await stories.linkedExperienceSelect.selectOption(experience.id);
    await stories.saveNewStory();

    // Reload: the links came back from the database, not component state.
    await page.reload();
    await expect(stories.linkedPromptSelect).toHaveValue(prompt.id);
    await expect(stories.linkedExperienceSelect).toHaveValue(experience.id);
  });
});
