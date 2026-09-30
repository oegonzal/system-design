import { awardsSummaryOf, emptyAwardsSummary } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AWARDS, ENTITY } from '../../testing/fixtures';
import { AwardsPanel } from './awards-panel';

const meta: Meta<typeof AwardsPanel> = {
  title: 'Govcon/Notice/AwardsPanel',
  component: AwardsPanel,
  args: {
    awards: { bySolicitation: AWARDS.slice(0, 2), related: awardsSummaryOf() },
    entities: {},
    onLookup: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof AwardsPanel>;

/** Two awards on this solicitation, one awardee not looked up yet, the NAICS summary. */
export const Default: Story = {};

/** The first awardee was looked up: its card follows the table. */
export const LookedUp: Story = {
  args: { entities: { [ENTITY.uei]: ENTITY } },
};

/** A lookup in flight. */
export const LookingUp: Story = { args: { lookingUp: ENTITY.uei } };

/** Nothing stored yet. */
export const Empty: Story = {
  args: { awards: { bySolicitation: [], related: emptyAwardsSummary() } },
};
