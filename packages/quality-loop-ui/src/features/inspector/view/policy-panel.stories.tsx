import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeEscalatedRun, makePipeline, makeRun } from '../../../testing/fixtures';
import { dimensionRows, gateRows, policyNumbers, validatorRows } from '../model/policy-view';
import { PolicyPanel } from './policy-panel';

const meta: Meta<typeof PolicyPanel> = {
  title: 'Quality Loop/Inspector/PolicyPanel',
  component: PolicyPanel,
};
export default meta;

type Story = StoryObj<typeof PolicyPanel>;

const pipeline = makePipeline();

const argsFor = (run = makeRun()) => {
  const trace = run.trace;
  if (trace === null) throw new Error('fixture has no trace');
  const iteration = trace.iterations[0];
  return {
    numbers: policyNumbers(pipeline.policy),
    gates: gateRows(pipeline.controller, iteration.decision.trace),
    dimensions: dimensionRows(pipeline.policy, iteration.decision.trace),
    validators: validatorRows(pipeline, iteration.validation),
    overall: iteration.decision.scores.overall,
  };
};

/** The whole ladder, with the gate that decided and the arithmetic behind each dimension. */
export const Decided: Story = { args: argsFor() };

/** No artifact: the first gate decides and everything after it is skipped. */
export const DecidedAtTheFirstGate: Story = { args: argsFor(makeEscalatedRun()) };
