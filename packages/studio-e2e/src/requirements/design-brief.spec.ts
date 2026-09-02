import { expect, test } from '@playwright/test';

import {
  buildNaiveDesign,
  openPracticeSession,
  openPracticeSessionWithPrompt,
} from '../support/canvas.page';

/**
 * The design brief is the graded explanation: requirement bindings and traced
 * flows, each one a reference the engine checks against the canvas. The prose
 * walkthrough is graded beside it — authored as reference-anchored slots and
 * scored by reference, not by substring, which is what let the narrative be
 * graded again after the substring regime was deleted.
 *
 * `EVAL_DETERMINISTIC=1` (set by the webServer config) pins grading to the
 * rule engine, so every verdict here is a pure function of graph + brief +
 * narrative.
 */
test.describe('the design brief', () => {
  test('the walkthrough overview is submitted with the diagram and survives a reload', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    const overview =
      'The Client calls the Service, which writes every order to the Database before acknowledging. ' +
      'Reads are served from the same Service so the account page stays consistent with what was written.';
    await canvas.setOverview(overview);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    await page.reload();
    await canvas.ready();
    await canvas.narrativeTab.click();
    await expect(canvas.narrativeOverview()).toHaveValue(overview);
  });

  /**
   * The authoring round trip, end to end through the browser.
   *
   * The monitoring block is the deliberate choice: `monitoring` is corroborated
   * by a component's KIND alone, so the claim is provable without driving the
   * properties panel to set a config knob — which keeps this test about
   * authoring a brief rather than about editing node config.
   */
  test('[UX-6] a design brief is authored beside the diagram and submitted with it', async ({
    page,
    request,
  }) => {
    const { canvas, prompt } = await openPracticeSessionWithPrompt(page, request);
    await buildNaiveDesign(canvas); // client n-1 → service n-2 → database n-3
    // Left where it lands: nothing here touches it on the canvas, and a fourth
    // staggered add drifts under the pannable minimap, which eats the pointer a
    // move would need.
    await canvas.addFromPalette('monitoring'); // n-4

    // The prompt is generated per test, so the requirement is read off it.
    const requirement = prompt.nonFunctionalRequirements[0];
    await canvas.bindMechanism(requirement.id, 'monitoring');
    await canvas.toggleBindingNode(requirement.id, 'n-4');
    // The engine's verdict, shown live while authoring — the same
    // `judgeMechanism` that will grade it.
    await canvas.expectBindingVerdict(requirement.id, 'corroborated');

    await canvas.traceFlow(0, ['e-1', 'e-2']);
    await canvas.expectFlowComplete(0);

    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    // Before the editor existed, every submission scored this dimension 0
    // against a finding saying so. Both halves of that are now false.
    await canvas.expectDimensionScored('explanation');
    await expect(canvas.findingItem('The design explains nothing')).toHaveCount(0);
  });

  test('[UX-6] a submitted brief comes back when the revision is reloaded', async ({
    page,
    request,
  }) => {
    const { canvas, prompt } = await openPracticeSessionWithPrompt(page, request);
    await buildNaiveDesign(canvas);
    await canvas.addFromPalette('monitoring'); // n-4

    const requirement = prompt.nonFunctionalRequirements[0];
    await canvas.bindMechanism(requirement.id, 'monitoring');
    await canvas.toggleBindingNode(requirement.id, 'n-4');
    await canvas.traceFlow(0, ['e-1', 'e-2']);
    await canvas.submit();
    await canvas.expectEvaluationComplete(1);

    await page.reload();
    await canvas.ready();
    await canvas.briefTab.click();

    // The claim, the components and the traced walk all survive the round trip.
    await expect(page.getByTestId(`binding-mechanism-${requirement.id}`)).toHaveValue('monitoring');
    await expect(page.getByTestId(`binding-node-${requirement.id}-n-4`)).toBeChecked();
    await canvas.expectFlowComplete(0);
  });

  /**
   * Suggestions are opt-in and, with no model configured, say so rather than
   * failing. This is the path CI and every headless run take, so it is the one
   * that must never be a spinner or an error.
   */
  test('[UX-9] suggestions are asked for explicitly, and answer honestly with no model', async ({
    page,
    request,
  }) => {
    const canvas = await openPracticeSession(page, request);
    await buildNaiveDesign(canvas);

    await canvas.askForSuggestions();
    await canvas.expectNoSuggestionsOffered();

    // Nothing was proposed, so nothing can have been accepted into the brief.
    await expect(page.locator('[data-testid^="binding-proposal-"]')).toHaveCount(0);
  });
});
