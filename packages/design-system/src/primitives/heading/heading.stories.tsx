import type { Meta, StoryObj } from '@storybook/react-vite';

import { Heading } from './heading';

const meta: Meta<typeof Heading> = {
  title: 'Design System/Primitives/Heading',
  component: Heading,
  args: { children: 'Order History service' },
  argTypes: {
    level: { control: 'inline-radio', options: [1, 2, 3, 4] },
  },
};
export default meta;

type Story = StoryObj<typeof Heading>;

/** The page title. One per route. */
export const PageTitle: Story = { args: { level: 1 } };

/** The default: a section heading. */
export const Section: Story = { args: { children: 'Findings' } };

/** The outline in one frame: size follows level, no second prop to disagree. */
export const Outline: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      <Heading level={1}>Level 1 — page title</Heading>
      <Heading level={2}>Level 2 — section</Heading>
      <Heading level={3}>Level 3 — panel</Heading>
      <Heading level={4}>Level 4 — group label</Heading>
    </div>
  ),
};
