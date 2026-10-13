import { savedViewOf } from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { SavedViewList } from './saved-view-list';

const VIEWS = [
  savedViewOf(),
  savedViewOf({
    id: 'v-2',
    name: 'Open to us, by winner',
    href: '/spending?naics=541511&tab=where&category=recipient&placement=standalone&newOnly=true',
  }),
];

const meta: Meta<typeof SavedViewList> = {
  title: 'Govcon/Views/SavedViewList',
  component: SavedViewList,
  args: {
    views: VIEWS,
    currentHref: '/spending?naics=541511&tab=pulse',
    onSave: fn(),
    onRemove: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof SavedViewList>;

/** Two views kept; the page shown is neither. */
export const Default: Story = {};

/** The page shown is one of the views kept: it is marked as the current one. */
export const OnASavedView: Story = { args: { currentHref: VIEWS[0]?.href } };

export const Empty: Story = { args: { views: [] } };

/** A write in flight: nothing can be saved or removed twice. */
export const Busy: Story = { args: { busy: true } };

export const Refused: Story = { args: { error: 'href: an address inside the client' } };
