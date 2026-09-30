import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { PROFILE } from '../../testing/fixtures';
import { AwardQueryForm, EMPTY_AWARD_FILTERS } from './award-query-form';

const meta: Meta<typeof AwardQueryForm> = {
  title: 'Govcon/Intel/AwardQueryForm',
  component: AwardQueryForm,
  args: { value: EMPTY_AWARD_FILTERS, onChange: fn(), naicsOptions: PROFILE.naics },
};
export default meta;

type Story = StoryObj<typeof AwardQueryForm>;

/** Nothing chosen: the whole store. */
export const Default: Story = {};

/** One profile code pressed, a window and a source. */
export const Narrowed: Story = {
  args: {
    value: {
      ...EMPTY_AWARD_FILTERS,
      naics: '332710',
      from: '2026-01-01',
      to: '2026-09-29',
      source: 'sam.gov',
    },
  },
};
