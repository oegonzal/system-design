import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeCriteria, makeCriterionResult, makeEvaluation } from '../../testing/fixtures';
import { CriterionResultsList } from './criterion-results-list';

const meta: Meta<typeof CriterionResultsList> = {
  title: 'Studio/Evaluation/CriterionResultsList',
  component: CriterionResultsList,
  args: { criteria: makeCriteria() },
};
export default meta;

type Story = StoryObj<typeof CriterionResultsList>;

/** The fixture evaluation: a pass, two partials, a fail and a pass. */
export const Mixed: Story = { args: { results: makeEvaluation().criterionResults } };

/** Every result the ledger can settle on, including one no evaluator reached. */
export const EveryResult: Story = {
  args: {
    results: [
      makeCriterionResult({ criterionId: 'c1', result: 'pass' }),
      makeCriterionResult({ criterionId: 'c2', result: 'partial', confidence: 'medium' }),
      makeCriterionResult({ criterionId: 'c3', result: 'fail' }),
      makeCriterionResult({ criterionId: 'c4', result: 'not_applicable', confidence: 'low' }),
      makeCriterionResult({
        criterionId: 'c5',
        result: 'unassessed',
        confidence: null,
        rationale: null,
      }),
    ],
  },
};

/** A rationale that names positional ids reads with the labels of the places they are. */
export const GroundedRationale: Story = {
  args: {
    results: [
      makeCriterionResult({
        criterionId: 'c2',
        result: 'partial',
        confidence: 'medium',
        rationale: 'edge.5 shows the read-only API, and narration.4 describes a keyed read.',
        locations: [
          { ref: 'edge.5', label: 'e-5 · n-2 → n-3 (sync)', part: 'edge', key: 'e-5' },
          { ref: 'narration.4', label: 'c4 narration', part: 'narration', key: 'c4' },
        ],
      }),
    ],
  },
};

/** Nothing assessed. */
export const Empty: Story = { args: { results: [] } };
