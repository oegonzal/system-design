import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { AGENCIES } from '../../testing/spending-fixtures';
import { EMPTY_SCOPE } from './scope';
import { ScopeBar } from './scope-bar';

const meta: Meta<typeof ScopeBar> = {
  title: 'Govcon/Spending/ScopeBar',
  component: ScopeBar,
  args: {
    value: { ...EMPTY_SCOPE, naics: '332710' },
    onChange: fn(),
    naicsOptions: ['332710', '333249', '541511'],
    agencies: AGENCIES.entries,
  },
};
export default meta;

type Story = StoryObj<typeof ScopeBar>;

/** One profile code chosen, the directory loaded. */
export const Default: Story = {};

/** The directory still loading: the agency select waits. */
export const DirectoryLoading: Story = { args: { agencies: null } };

/** The directory could not be read; the rest of the scope still works. */
export const DirectoryFailed: Story = {
  args: { agencies: null, agenciesError: 'the service is unreachable' },
};
