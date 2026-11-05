import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import {
  AUTHORED_CRITERIA_BY_KIND,
  AUTHORED_MARKDOWN,
  AUTHORED_PLATFORM_CRITERIA_IDS,
  AUTHORED_TITLE,
  authorPrompt,
  getPrompt,
} from '../support/backend';
import { graderRequests } from '../support/grader';
import { ORDER_HISTORY_DOCUMENT } from '../support/library-fixtures';
import { PromptsPage } from '../support/prompts.page';
import { uniqueName } from '../support/unique';

/**
 * The three ways a prompt comes to exist — drafted by the grader's prompt
 * pipeline, written by hand, copied from the grader's library — each shown
 * as rendered markdown with its rubric as chips grouped by kind. A written
 * or imported prompt's rubric is derived by the grader from the markdown; a
 * generated prompt's is its draft's own rows, never derived.
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
    await prompts.expectTitledOnce(prompt.title);
    // The draft was rendered to the house convention before it was stored,
    // and renders as a document: its sections are headings under the title.
    await expect(prompts.markdownHeading('Functional requirements')).toBeVisible();
    await expect(prompts.markdownHeading('Non-functional requirements')).toBeVisible();
    await expect(prompts.markdownPane).not.toContainText('## ');
    await prompts.expectCriteriaChips(prompt.criteria.map((criterion) => criterion.id));

    // The rubric is the draft's own rows: the grader was never asked to derive
    // one for this prompt, and the page offers no re-derive.
    expect(prompt.criteria.map((criterion) => criterion.kind)).toContain('functional');
    const { criteriaRequests } = await graderRequests(request);
    expect(criteriaRequests.some((call) => call.goal === prompt.markdown)).toBe(false);
    await expect(prompts.rederiveButton).toHaveCount(0);
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
    await prompts.expectTitledOnce(AUTHORED_TITLE);
    await expect(prompts.markdownHeading('Scale targets')).toBeVisible();
    await expect(prompts.markdownPane.getByRole('table').first()).toBeVisible();
    // The composer's default platform is the first declared one: the rubric
    // closes with the platform constraint, and the badge says which platform.
    await prompts.expectCriteriaChips(AUTHORED_PLATFORM_CRITERIA_IDS);
    await expect(page.getByTestId('prompt-platform')).toHaveText('AWS');

    const stored = await getPrompt(request, prompts.promptIdFromUrl());
    expect(stored.markdown).toBe(AUTHORED_MARKDOWN);
    expect(stored.platform).toBe('aws');
  });

  test('[GEN-3] a library document previews, imports as a prompt with its own rubric, and the browser filters by source', async ({
    page,
  }) => {
    const prompts = new PromptsPage(page);
    await prompts.open();
    await prompts.openComposer();
    await prompts.importFromLibrary(ORDER_HISTORY_DOCUMENT.id);

    await prompts.expectSource('library');
    await prompts.expectTitledOnce(ORDER_HISTORY_DOCUMENT.title);
    await expect(prompts.markdownHeading('Constraints')).toBeVisible();
    // Imported under the composer's default platform, as a written prompt is.
    await prompts.expectCriteriaChips(AUTHORED_PLATFORM_CRITERIA_IDS);

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

  test('[UX-13] a prompt opened at its own address names the tab after itself', async ({
    page,
    request,
  }) => {
    // A direct load, not a navigation from the list: the route's generic
    // title arrives with the page, and the prompt's own has to win over it.
    const prompt = await authorPrompt(request, { title: uniqueName('Titled prompt') });
    const prompts = new PromptsPage(page);
    await prompts.openDetail(prompt.id);

    await expect(page).toHaveTitle(`${prompt.title} · System Design Studio`);
  });

  test('[UX-13] Back on a composer with unsaved words asks first, stays when refused, and leaves when allowed', async ({
    page,
  }) => {
    const prompts = new PromptsPage(page);
    await prompts.open();
    await prompts.openComposer();
    await page.getByRole('tab', { name: 'Write' }).click();
    await page.getByTestId('compose-title').fill('Half a prompt');

    // The browser's own Back, driven from the page: the guard asks before the
    // address moves. The handler is registered first — a dialog nobody
    // answers freezes the page.
    let asked: string | null = null;
    page.once('dialog', (dialog) => {
      asked = dialog.message();
      void dialog.dismiss();
    });
    await page.evaluate(() => history.back());
    await expect.poll(() => asked).toContain('has not been saved');
    await expect(page).toHaveURL(/\/prompts\/new$/);
    await expect(page.getByTestId('compose-title')).toHaveValue('Half a prompt');

    // A refusal spends the page's right to hold the next Back; touching the
    // page earns it back, and this time the author lets it go.
    await page.getByTestId('compose-title').fill('Half a prompt, still');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.evaluate(() => history.back());
    await page.waitForURL(/\/prompts$/);
  });

  test('[UX-14] a written prompt’s criteria show as chips grouped by kind, and can be re-derived while nothing was graded against them', async ({
    page,
    request,
  }) => {
    const prompt = await authorPrompt(request);
    const prompts = new PromptsPage(page);
    await prompts.openDetail(prompt.id);

    await prompts.expectCriteriaGrouped(AUTHORED_CRITERIA_BY_KIND);
    await expect(prompts.criteriaGroup('non_functional')).toContainText('Non-functional');
    await expect(prompts.criterionChip('c3')).toContainText('order-history reads');

    await prompts.rederiveCriteria();
    await expect(page.getByTestId('criteria-error')).toHaveCount(0);
    await prompts.expectCriteriaGrouped(AUTHORED_CRITERIA_BY_KIND);
  });
});
