import { emptyAwardsSummary } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AWARDS_SUMMARY } from '../../testing/fixtures';
import { AwardsSummaryTiles } from './awards-summary-tiles';

const meta: Meta<typeof AwardsSummaryTiles> = {
  title: 'Govcon/Intel/AwardsSummaryTiles',
  component: AwardsSummaryTiles,
  args: { summary: AWARDS_SUMMARY, onLookup: fn() },
};
export default meta;

type Story = StoryObj<typeof AwardsSummaryTiles>;

/** Three awards in the NAICS, one awardee winning twice. */
export const Default: Story = {};

/** Nothing stored yet. */
export const Empty: Story = { args: { summary: emptyAwardsSummary() } };

/** A lookup in flight for the top awardee. */
export const LookingUp: Story = { args: { lookingUp: 'ABC123DEF456' } };
