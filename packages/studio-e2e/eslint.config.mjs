import playwright from 'eslint-plugin-playwright';

import workspace from '../../eslint.config.mjs';

/**
 * The e2e suite's lint config: the workspace rules, plus the Playwright
 * recommended set owned here.
 *
 * Flat config does not cascade — ESLint uses the nearest config file and
 * resolves its patterns against that file's directory — so the workspace
 * config's Playwright block, scoped by a workspace-relative pattern, is
 * restated here for `**\/*.ts`. Keeping the block beside the page objects is
 * the point: `expect-expect` matches called property names exactly, so the
 * assertion methods the page objects export are listed by name, and the
 * list changes in the same commit as the page object.
 */
const recommended = playwright.configs['flat/recommended'];

export default [
  ...workspace,
  {
    ...recommended,
    files: ['**/*.ts'],
    rules: {
      ...recommended.rules,
      'playwright/expect-expect': [
        'warn',
        {
          assertFunctionNames: [
            'expect',
            // canvas.page.ts
            'expectNodeCount',
            'expectNodeMeta',
            'expectEdgePill',
            'expectNodeHighlighted',
            'expectEdgeHighlighted',
            'expectConfigType',
            'expectBindingState',
            'expectFlowTraced',
            'expectEvaluationComplete',
            'expectOverall',
            'expectDecision',
            'expectDimensionScored',
            'expectCriterionResult',
            'expectCoachStopped',
            'expectAssistantRevisionInTimeline',
            'expectScoreTrendIncreasing',
            // prompts.page.ts
            'expectSource',
            'expectCriteriaChips',
            'expectCriteriaGrouped',
            // app-nav.ts
            'expectActiveNav',
            // stories.page.ts
            'expectStoryListed',
            // settings.page.ts
            'expectColorMode',
            'expectAccent',
          ],
        },
      ],
    },
  },
];
