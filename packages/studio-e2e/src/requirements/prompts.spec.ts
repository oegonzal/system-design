import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import {
  AUTHORED_CRITERIA_BY_KIND,
  AUTHORED_CRITERIA_IDS,
  AUTHORED_MARKDOWN,
  AUTHORED_TITLE,
  authorPrompt,
  getPrompt,
} from '../support/backend';
import { ORDER_HISTORY_DOCUMENT } from '../support/library-fixtures';
import { PromptsPage } from '../support/prompts.page';

/**
 * The three ways a prompt comes to exist — drafted by the grader's prompt
 * pipeline, written by hand, copied from the grader's library — and the one
 * thing every source shares: a rubric the grader derives from the markdown,
 * shown as chips grouped by kind.
 *
 * The grader is the suite's stub, so a generated draft is titled after the
 * experience it was drawn from, and the authored fixture always derives
 * `c1…c5`.
 */
test.describe('prompts', () => {
  test('[GEN-1] generates a prompt from an experience: progress shows, then the detail page marks it generated', async ({
    page,
    request,
  }) => {
    const nav = new AppNav(page);
    await nav.open('/');
    await nav.expectActiveNav('Dashboard');
    await nav.gotoPrompts();
    await nav.expectActiveNav('Prompts');

    const prompts = new PromptsPage(page);
    await prompts.selectTicketingExperience();
    // Asserts the progress indicator on the way to the detail route.
    await prompts.generate();

    const prompt = await getPrompt(request, prompts.promptIdFromUrl());
    expect(prompt.source).toBe('generated');
    await prompts.expectSource('generated');
    await expect(
      prompts.promptPane.getByRole('heading', { level: 2, name: prompt.title }),
    ).toBeVisible();
    // The draft was rendered to the house convention before it was stored.
    await expect(prompts.markdownPane).toContainText('## Functional requirements');
    await expect(prompts.markdownPane).toContainText('## Non-functional requirements');
    await prompts.expectCriteriaChips(prompt.criteria.map((criterion) => criterion.id));
  });

  test('[GEN-2] a prompt written in the composer is stored verbatim with the rubric derived from it', async ({
    page,
    request,
  }) => {
    const prompts = new PromptsPage(page);
    await prompts.open();
    await prompts.openComposer();
    await prompts.author({ title: AUTHORED_TITLE, markdown: AUTHORED_MARKDOWN });

    await prompts.expectSource('authored');
    await expect(
      prompts.promptPane.getByRole('heading', { level: 2, name: AUTHORED_TITLE }),
    ).toBeVisible();
    await expect(prompts.markdownPane).toContainText('## Scale targets');
    await prompts.expectCriteriaChips(AUTHORED_CRITERIA_IDS);

    const stored = await getPrompt(request, prompts.promptIdFromUrl());
    expect(stored.markdown).toBe(AUTHORED_MARKDOWN);
  });

  test('[GEN-3] a library document previews, imports as a prompt with its own rubric, and the browser filters by source', async ({
    page,
  }) => {
    const prompts = new PromptsPage(page);
    await prompts.open();
    await prompts.openComposer();
    await prompts.importFromLibrary(ORDER_HISTORY_DOCUMENT.id);

    await prompts.expectSource('library');
    await expect(
      prompts.promptPane.getByRole('heading', { level: 2, name: ORDER_HISTORY_DOCUMENT.title }),
    ).toBeVisible();
    await expect(prompts.markdownPane).toContainText('## Constraints');
    await prompts.expectCriteriaChips(AUTHORED_CRITERIA_IDS);

    // The source filter narrows the browser to imports alone. Other workers
    // may be importing the same document, so the list is asserted by
    // membership and by the absence of any other source, never by position.
    await prompts.open();
    await prompts.filterBySource('library');
    await expect(
      prompts.promptCards.filter({ hasText: ORDER_HISTORY_DOCUMENT.title }).first(),
    ).toBeVisible();
    await expect(prompts.promptCards.filter({ hasText: 'authored' })).toHaveCount(0);
    await expect(prompts.promptCards.filter({ hasText: 'generated' })).toHaveCount(0);
  });

  test('[UX-14] the criteria show as chips grouped by kind, and can be re-derived while nothing was graded against them', async ({
    page,
    request,
  }) => {
    const prompt = await authorPrompt(request);
    const prompts = new PromptsPage(page);
    await prompts.openDetail(prompt.id);

    await prompts.expectCriteriaGrouped(AUTHORED_CRITERIA_BY_KIND);
    await expect(prompts.criteriaGroup('non_functional')).toContainText('Non functional');
    await expect(prompts.criterionChip('c3')).toContainText('order-history reads');

    await prompts.rederiveCriteria();
    await expect(page.getByTestId('criteria-error')).toHaveCount(0);
    await prompts.expectCriteriaGrouped(AUTHORED_CRITERIA_BY_KIND);
  });
});
