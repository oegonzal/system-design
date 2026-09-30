import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeCriteria, makeCriterionResult, makeEvaluation } from '../../testing/fixtures';
import { CriterionResultsTable } from './criterion-results-table';

const meta: Meta<typeof CriterionResultsTable> = {
  title: 'Studio/Evaluation/CriterionResultsTable',
  component: CriterionResultsTable,
  args: { criteria: makeCriteria() },
};
export default meta;

type Story = StoryObj<typeof CriterionResultsTable>;

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

/** Nothing assessed. */
export const Empty: Story = { args: { results: [] } };
