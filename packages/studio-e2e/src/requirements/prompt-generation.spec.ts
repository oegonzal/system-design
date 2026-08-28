import { expect, test } from '@playwright/test';

import { AppNav } from '../support/app-nav';
import { generatePrompt, getPrompt } from '../support/backend';
import { PromptsPage } from '../support/prompts.page';

test.describe('prompt generation', () => {
  test('[GEN-1] generates a design prompt from a seeded experience', async ({ page, request }) => {
    const nav = new AppNav(page);
    await nav.open('/');
    await nav.expectActiveNav('Dashboard');
    await nav.gotoPrompts();
    await nav.expectActiveNav('Prompts');

    const prompts = new PromptsPage(page);
    await prompts.selectTicketingExperience();
    await prompts.generate();

    // The detail page shows the freshly stored prompt, verified against the API.
    const prompt = await getPrompt(request, prompts.promptIdFromUrl());
    await expect(
      prompts.promptPane.getByRole('heading', { level: 2, name: prompt.title }),
    ).toBeVisible();
    await expect(prompts.promptPane.getByText(prompt.archetype).first()).toBeVisible();
  });

  test('[GEN-3] a prompt presents scenario, FRs, NFRs and scale targets', async ({
    page,
    request,
  }) => {
    const prompt = await generatePrompt(request);
    const prompts = new PromptsPage(page);
    await prompts.openDetail(prompt.id);
    const pane = prompts.promptPane;

    // The scenario paragraph, checked against what the API actually stored.
    await expect(pane.getByText(prompt.scenario.slice(0, 60)).first()).toBeVisible();

    // Every functional requirement, verbatim.
    expect(prompt.functionalRequirements.length).toBeGreaterThan(0);
    for (const requirement of prompt.functionalRequirements) {
      await expect(pane.getByText(requirement, { exact: true })).toBeVisible();
    }

    // Every NFR statement.
    expect(prompt.nonFunctionalRequirements.length).toBeGreaterThan(0);
    for (const nfr of prompt.nonFunctionalRequirements) {
      await expect(pane.getByText(nfr.statement).first()).toBeVisible();
    }

    // The scale targets the eval engine grades against. (`first()`: the term
    // may also appear inside an NFR statement — text matching is substring
    // and case-insensitive.)
    await expect(pane.getByText('Scale targets').first()).toBeVisible();
    await expect(pane.getByText('Concurrent users').first()).toBeVisible();
    await expect(
      pane.getByText(prompt.scaleTargets.concurrentUsers.toLocaleString('en-US')).first(),
    ).toBeVisible();
    await expect(pane.getByText(`${prompt.scaleTargets.p99LatencyMs} ms`).first()).toBeVisible();
    await expect(pane.getByText(`${prompt.scaleTargets.availabilityPct}%`).first()).toBeVisible();
  });
});
