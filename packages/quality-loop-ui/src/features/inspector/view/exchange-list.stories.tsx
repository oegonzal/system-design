import type { Meta, StoryObj } from '@storybook/react-vite';

import { makeRun } from '../../../testing/fixtures';
import { invocationsOf, invocationTotals } from '../model/exchange-invocations';
import { ExchangeList } from './exchange-list';

const meta: Meta<typeof ExchangeList> = {
  title: 'Quality Loop/Inspector/ExchangeList',
  component: ExchangeList,
};
export default meta;

type Story = StoryObj<typeof ExchangeList>;

const RUN_ID = makeRun().runId;

const withRetries = [
  ...makeRun().exchanges.map((exchange) => ({ ...exchange, attempt: 1, runId: RUN_ID })),
  {
    runId: RUN_ID,
    scope: 'critic.requirements.s1',
    ordinal: 5,
    outcome: 'schema-miss' as const,
    durationMs: 41_000,
    startedAt: '2026-09-06T00:04:00.000Z',
    attempt: 1,
    errorName: 'schema-miss',
  },
  {
    runId: RUN_ID,
    scope: 'critic.requirements.s1',
    ordinal: 6,
    outcome: 'ok' as const,
    durationMs: 52_000,
    startedAt: '2026-09-06T00:04:41.000Z',
    attempt: 2,
  },
];

/** One call per stage, each answered first time. */
export const EveryCallAnswered: Story = {
  args: (() => {
    const invocations = invocationsOf(
      makeRun().exchanges.map((exchange) => ({ ...exchange, runId: RUN_ID })),
    );
    return { invocations, totals: invocationTotals(invocations) };
  })(),
};

/** A schema miss asked again and answered: one call, two attempts. */
export const Retried: Story = {
  args: (() => {
    const invocations = invocationsOf(withRetries);
    return { invocations, totals: invocationTotals(invocations) };
  })(),
};
