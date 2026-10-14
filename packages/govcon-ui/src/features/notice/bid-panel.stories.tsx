import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { BID } from '../../testing/pipeline-fixtures';
import { BidPanel } from './bid-panel';

const meta: Meta<typeof BidPanel> = {
  title: 'Govcon/Notice/BidPanel',
  component: BidPanel,
  args: { bid: null, onSave: fn(), onRemove: fn() },
};
export default meta;

type Story = StoryObj<typeof BidPanel>;

/** Not tracked yet: the form starts at "watching" and one button puts it in the pipeline. */
export const Untracked: Story = {};

/** Tracked: the stored row fills the form; save or remove. */
export const Tracked: Story = { args: { bid: BID } };

/** A save in flight. */
export const Saving: Story = { args: { bid: BID, saving: true } };

/** The service refused the save. */
export const Failed: Story = { args: { bid: BID, error: 'no stored notice abc' } };
