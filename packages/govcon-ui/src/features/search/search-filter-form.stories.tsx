import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { SearchFilterForm } from './search-filter-form';

const meta: Meta<typeof SearchFilterForm> = {
  title: 'Govcon/SearchFilterForm',
  component: SearchFilterForm,
  args: {
    filter: { naics: '332710', status: 'active' },
    onFilterChange: fn(),
    days: 7,
    onDaysChange: fn(),
    editing: null,
    name: '',
    onNameChange: fn(),
    onRun: fn(),
    onSave: fn(),
    onCancelEdit: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof SearchFilterForm>;

/** A code and a status, seven days, ready to run; nothing to save until it has a name. */
export const Default: Story = {};

/** A saved search loaded back into the form. */
export const Editing: Story = {
  args: { editing: { id: 's-1', name: 'Machine shops' }, name: 'Machine shops' },
};

/** Nothing filled in: neither button can spend or save. */
export const Blank: Story = { args: { filter: {} } };

/** No key in the environment: the run button explains itself. */
export const SourceDisabled: Story = {
  args: { sourceDisabledReason: 'SAM_GOV_API_KEY is not set (no-key)' },
};
