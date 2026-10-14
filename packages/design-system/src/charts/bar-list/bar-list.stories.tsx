import type { Meta, StoryObj } from '@storybook/react-vite';

import { BarList } from './bar-list';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const meta: Meta<typeof BarList> = {
  title: 'Design System/Charts/BarList',
  component: BarList,
  args: {
    title: 'Obligations by awarding agency',
    formatValue: money,
    items: [
      { id: '1173', label: 'Department of Defense', detail: 'DOD', value: 6_200_000, share: 0.775 },
      {
        id: '862',
        label: 'National Aeronautics and Space Administration',
        detail: 'NASA',
        value: 900_000,
        share: 0.1125,
      },
      { id: '315', label: 'Department of State', detail: 'DOS', value: 500_000, share: 0.0625 },
      {
        id: '95',
        label: 'Department of Agriculture',
        detail: 'USDA',
        value: 260_000,
        share: 0.0325,
      },
    ],
  },
};
export default meta;

type Story = StoryObj<typeof BarList>;

export const Default: Story = {};

/** Without a known whole there is no share column. */
export const NoShare: Story = {
  args: {
    items: [
      { id: 'a', label: 'NAVSEA HQ', value: 37_000_000 },
      { id: 'b', label: 'Naval Air Systems Command', value: 33_000_000 },
    ],
  },
};

/** A row with a page of its own is named by a link to it; one without is named in text. */
export const LinkedLabels: Story = {
  args: {
    title: 'Obligations by recipient',
    items: [
      {
        id: 'a',
        label: <a href="/firms/a">Northwind Systems</a>,
        detail: 'A1B2C3D4E5F6',
        value: 5_000_000,
        share: 0.625,
      },
      { id: 'b', label: 'Unnamed recipient', value: 1_000_000, share: 0.125 },
    ],
  },
};

export const Empty: Story = { args: { items: [], emptyMessage: 'No rows in the window.' } };
