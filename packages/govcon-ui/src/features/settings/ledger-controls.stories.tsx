import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { LedgerControls } from './ledger-controls';

const meta: Meta<typeof LedgerControls> = {
  title: 'Govcon/Settings/LedgerControls',
  component: LedgerControls,
  args: { operation: '', onOperationChange: fn(), total: 120, limit: 50, offset: 50, onPage: fn() },
};
export default meta;

type Story = StoryObj<typeof LedgerControls>;

/** The second page of every operation. */
export const Default: Story = {};

/** Descriptions only, from the top. */
export const Descriptions: Story = { args: { operation: 'description', total: 4, offset: 0 } };
