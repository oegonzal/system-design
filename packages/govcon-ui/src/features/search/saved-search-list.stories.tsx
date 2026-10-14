import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { SAVED_SEARCHES } from '../../testing/fixtures';
import { SavedSearchList } from './saved-search-list';

const meta: Meta<typeof SavedSearchList> = {
  title: 'Govcon/SavedSearchList',
  component: SavedSearchList,
  args: {
    searches: SAVED_SEARCHES,
    onToggleIncluded: fn(),
    onOrderChange: fn(),
    onRun: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof SavedSearchList>;

/** Three searches: two in the daily pull, one kept for hand runs — one never read, one whose read ranked well, one whose read brought nothing the profile lists. */
export const Default: Story = {};

/** A write in flight for the first row: its controls wait. */
export const Busy: Story = { args: { busyId: 's-1' } };

/** Nothing saved yet. */
export const Empty: Story = { args: { searches: [] } };

/** No key: runs are off, edits still work. */
export const SourceDisabled: Story = { args: { sourceDisabled: true } };
