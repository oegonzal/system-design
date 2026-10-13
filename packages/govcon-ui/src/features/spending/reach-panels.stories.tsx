import type { ReachCut } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { DELAY, REACH } from '../../testing/spending-fixtures';
import { ReachFunnel } from './reach-panels';

/** A link per cut, as the page builds one; a cut with nothing to show has none. */
const hrefOf = (cut: ReachCut): string | null =>
  cut.facets === null ? null : `/spending?tab=where&category=recipient&cut=${cut.id}`;

const meta: Meta<typeof ReachFunnel> = {
  title: 'Govcon/Spending/Reach',
  component: ReachFunnel,
  args: { reach: REACH, hrefOf },
};
export default meta;

type Story = StoryObj<typeof ReachFunnel>;

/** A year of new contracts cut down to what a small firm with three lanes won without a vehicle. */
export const Funnel: Story = {};

/** A scope of orders: nothing can be a stand-alone contract, so the last two cuts count nothing. */
export const RuledOut: Story = {
  args: {
    reach: {
      ...REACH,
      cuts: REACH.cuts.map((cut, index) =>
        index < 2 ? cut : { ...cut, facets: null, awards: 0, amount: 0 },
      ),
      bands: REACH.bands.map((band) => ({ ...band, awards: 0 })),
    },
  },
};

/** No lanes named, and a window that reaches past what a late agency has published. */
export const EveryLaneDelayed: Story = { args: { reach: { ...REACH, lanes: [], delay: DELAY } } };
