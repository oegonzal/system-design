import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';

import { ColumnChart } from './column-chart';
import type { ColumnDatum } from './geometry';

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const STACKED: ColumnDatum[] = MONTHS.map((label, index) => ({
  label,
  values: { contracts: 400_000 + index * 60_000, idvs: 60_000 + (index % 3) * 20_000 },
}));

const GROUPED: ColumnDatum[] = MONTHS.map((label, index) => ({
  label,
  values: {
    fy2026:
      index < 9
        ? { value: 520_000 + index * 70_000, provisional: index === 8 }
        : {
            value: 900_000 + index * 20_000,
            projected: true,
            band: { low: 780_000 + index * 20_000, high: 1_050_000 + index * 20_000 },
          },
    fy2025: 480_000 + index * 60_000,
    fy2024: 430_000 + index * 55_000,
    fy2023: 400_000 + index * 50_000,
  },
}));

const meta: Meta<typeof ColumnChart> = {
  title: 'Design System/Charts/ColumnChart',
  component: ColumnChart,
  args: {
    title: 'Obligations by fiscal period',
    valueLabel: 'Obligations, USD',
    xLabel: 'Period',
    formatValue: money,
  },
};
export default meta;

type Story = StoryObj<typeof ColumnChart>;

/** Two series stacked: contracts and the IDVs placed under them, by period. */
export const Stacked: Story = {
  args: {
    series: [
      { id: 'contracts', label: 'Contracts' },
      { id: 'idvs', label: 'IDVs' },
    ],
    data: STACKED,
  },
};

/** Four fiscal years side by side; the current year's last reported period is provisional and the rest projected with a band. */
export const Grouped: Story = {
  args: {
    layout: 'grouped',
    series: [
      { id: 'fy2026', label: 'FY2026' },
      { id: 'fy2025', label: 'FY2025' },
      { id: 'fy2024', label: 'FY2024' },
      { id: 'fy2023', label: 'FY2023' },
    ],
    data: GROUPED,
  },
};

/** A de-obligation month: the column hangs below the baseline. */
export const Negative: Story = {
  args: {
    series: [{ id: 'total', label: 'Obligations' }],
    data: MONTHS.slice(0, 6).map((label, index) => ({
      label,
      values: { total: index === 2 ? -180_000 : 300_000 + index * 40_000 },
    })),
  },
};

/** One series: no legend box — the title names it. */
export const SingleSeries: Story = {
  args: { series: [{ id: 'total', label: 'Obligations' }], data: STACKED },
};

export const Empty: Story = {
  args: {
    series: [{ id: 'total', label: 'Obligations' }],
    data: [],
    emptyMessage: 'No periods in the window.',
  },
};

/** Reloading: the last numbers stay in view, dimmed. */
export const Pending: Story = { args: { ...Stacked.args, pending: true } };

/** A period under the pointer: one bubble names every series at that x, value first; its columns lift. */
export const Tooltip: Story = {
  args: Grouped.args,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: /^Jun:/ }));
  },
};

/** A plot narrower than the room a bubble wants beside its slot: the bubble slides back over the slot and stays inside the plot. */
export const TooltipInANarrowPlot: Story = {
  args: Grouped.args,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 300 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: /^Mar:/ }));
  },
};
